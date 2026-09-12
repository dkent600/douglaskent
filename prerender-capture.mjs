import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium } from "playwright";
import { preview } from "vite";

/**
 * Captures the rendered resume out of the built `dist` and writes the stripped markup to
 * `index-prerender.html`, which `prerender-insert.mjs` splices into `dist/index.html`.
 *
 * The page is captured rather than generated because the Aurelia templates are the only
 * place the resume's structure is expressed. A second generator would be a second place
 * to keep correct.
 *
 * What comes out is a fragment for a reader that will not run JavaScript, so everything
 * that only matters to a running app -- classes, bindings, ids, the collapse machinery --
 * is stripped.
 */

const OUTPUT_PATH = "index-prerender.html";

/**
 * The built shell, read for its `<title>` and stylesheet links so this capture is styled
 * by the same CSS that will be in effect once the fragment is inserted into it.
 */
const SHELL_PATH = "dist/index.html";

/**
 * `/resume/expanded` rather than `/resume`: `expanded` adds the `show` class to every
 * collapse and sets `showingEntireHistory`, which is what puts the companies past the
 * toggle into the DOM at all. Every other resume address renders a subset.
 */
const ROUTE = "/resume/expanded";

/**
 * Narrower than Bootstrap's `lg` breakpoint of 992px, and deliberately so. The contact
 * block is in the DOM twice: inline at the top of the resume carrying `d-lg-none`, and
 * again in the right-hand side panel. Only CSS separates them, so the viewport decides
 * which one the capture sees. Below `lg` it is the inline copy, which is also the one
 * that belongs at the top of a document read top to bottom.
 */
const VIEWPORT = { width: 800, height: 1200 };

/**
 * Attributes kept on every element.
 *
 * `class` is kept because the fragment is spliced into `dist/index.html`, which links the
 * built stylesheet -- so the classes still resolve and the block renders as the real page
 * rather than as unstyled markup. Dropping them meant rebuilding, element by element,
 * what the stylesheet already encoded: `company-name` carries `display: inline-block`,
 * and without it the employer, the bullet and the dates break across two lines.
 *
 * `href` so links remain links, and `data-work-entry` is written below as a verification
 * marker.
 *
 * `title` is deliberately absent. The icons that carried tooltips -- "Worked Remotely",
 * "Contract", "Personal Project" -- are inside the commented-out `company-icons` block in
 * `history.html`, so they never render and no `title` reaches the capture.
 */
const KEEP_ATTRIBUTES = ["class", "href", "data-work-entry"];

/**
 * `configFile: false` is load bearing. Without it Vite discovers `vite.config.ts` and
 * loads all five `resume-*` plugins, re-running the whole generation pass -- including
 * the `writeBundle` hooks that rewrite `src/static` -- just to serve files that are
 * already built.
 *
 * The cost is that nothing from that config applies, so `base` and `build.outDir` fall
 * back to Vite's defaults of `/` and `dist`. Both are what this project uses. If either
 * is ever set in `vite.config.ts`, this call has to be revisited: a non-root `base` would
 * break the URL composed below, and a different `outDir` would serve the wrong directory.
 */
const server = await preview({
  root: process.cwd(),
  configFile: false,
  plugins: [],
  preview: { port: 0, open: false },
});

const origin = server.resolvedUrls.local[0];

const browser = await chromium.launch();

try {
  const page = await browser.newPage({ viewport: VIEWPORT });
  await page.goto(`${origin.replace(/\/$/, "")}${ROUTE}`);

  /**
   * A DOM condition rather than a timeout. Aurelia builds the work history in two
   * repeats, above and below the toggle, so the page is done when the entry count stops
   * growing. `waitForFunction` polls on animation frames, so two equal readings means the
   * count survived a frame unchanged.
   */
  await page.waitForFunction(() => {
    const count = document.querySelectorAll(".company").length;
    if (count === 0) return false;
    const settled = window.__prerenderCount === count;
    window.__prerenderCount = count;
    return settled;
  });

  const html = await page.evaluate((keepAttributes) => {
    const app = document.querySelector("app");

    /**
     * Marked before `class` is stripped so the entries stay identifiable afterwards.
     */
    for (const el of app.querySelectorAll(".company")) {
      el.setAttribute("data-work-entry", "");
    }

    /**
     * The side panel holds a second copy of the contact block and of the table of
     * contents, both of which appear earlier in the document. It is removed outright
     * rather than left to the viewport because `col-hide-md`, the class that looks like
     * it would hide it on a narrow screen, is not defined in this project or in
     * Bootstrap. It is a dead class name, so the panel is visible at every width.
     *
     * The table of contents goes with it, in both of its renditions. Every entry is a
     * `click.trigger="goto(...)"` with no `href`, so none of it is navigable without
     * JavaScript -- the desktop version would render as a list of unclickable words, and
     * the mobile version as a lone dropdown button with nothing behind it, its menu
     * already pruned for being `display:none` until Bootstrap opens it.
     */
    for (const el of app.querySelectorAll(".side-panel, toc")) {
      el.remove();
    }

    /**
     * Material Icons are ligatures: the text content is the glyph name, so `star` and
     * `check` render as icons only while the font and the class are both present. Strip
     * the class and the literal word is left behind. They are decorative, so they go.
     *
     * Matched on the class rather than on the element name, because `<i>` is also doing
     * its real job here -- the publication titles are genuine italics and must survive.
     */
    for (const el of [...app.querySelectorAll("i.material-icons")]) {
      el.remove();
    }

    /**
     * Anything the browser computes as hidden is not part of the document. This is what
     * keeps the short-resume content out: the `resume-type` attribute hides a mismatched
     * element with an inline `style.display = "none"`, which stripping attributes would
     * otherwise resurrect. It also drops the collapse bodies that never opened and the
     * responsive duplicates for the other breakpoint.
     *
     * Document order matters: an ancestor is visited before its descendants, so removing
     * it takes the subtree with it and the descendants are simply skipped.
     */
    for (const el of [...app.querySelectorAll("*")]) {
      if (!el.isConnected) continue;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") {
        el.remove();
      }
    }

    /**
     * Collapsed to a single space, never to nothing. A whitespace-only text node is
     * still the separator between two words that would otherwise abut, so the run is
     * replaced rather than removed.
     *
     * This runs while the stylesheet is still attached, which is the only moment the
     * question "is whitespace significant here" can be answered. Anything under a
     * `white-space: pre`, `pre-wrap`, `pre-line` or `break-spaces` element is left
     * exactly as authored -- collapsing a preformatted block silently destroys its
     * layout, and there is nothing in the output to show it happened. Nothing in the
     * resume is preformatted today; the guard costs one comparison and means a future
     * `<pre>` does not have to be noticed by whoever adds it.
     *
     * Collapsing is safe in a way unwrapping was not: it rewrites the contents of a text
     * node without changing which elements bound it, so no two runs can be joined.
     */
    const texts = [];
    const textWalker = document.createTreeWalker(app, NodeFilter.SHOW_TEXT);
    while (textWalker.nextNode()) {
      texts.push(textWalker.currentNode);
    }
    for (const text of texts) {
      const parent = text.parentElement;
      if (parent && getComputedStyle(parent).whiteSpace.startsWith("pre")) continue;
      text.nodeValue = text.nodeValue.replace(/\s+/g, " ");
    }

    /**
     * Collected first, then removed. Removing during the walk invalidates the walker's
     * position and silently skips nodes.
     */
    const comments = [];
    const commentWalker = document.createTreeWalker(app, NodeFilter.SHOW_COMMENT);
    while (commentWalker.nextNode()) {
      comments.push(commentWalker.currentNode);
    }
    for (const comment of comments) {
      comment.remove();
    }

    /**
     * `resume.html` gives the inline contact block `d-lg-none`, Bootstrap's "hide at
     * 992px and above". That is right in the app, where the sidebar's second `<contact>`
     * takes over at wide widths. It is wrong here, because that sidebar copy is removed
     * above -- so the class would leave a reader wider than 992px with no contact details
     * at all.
     *
     * Matched by tag rather than by `id`, since ids do not survive the pass below, and
     * scoped to `<contact>` so the class keeps working everywhere else it is used.
     */
    for (const el of app.querySelectorAll("contact")) {
      el.classList.remove("d-lg-none");
    }

    /**
     * Put same-origin links back to root-relative, and do it here rather than in the
     * templates.
     *
     * The router's link attributes synthesise an `href` from the origin the app is running
     * on. `load="/resume/short"` reaches the browser as
     * "http://localhost:<whatever port preview got>/resume/short". That is correct in a
     * running app and useless in this file: the capture runs against `vite preview` on port
     * 0, so the origin is a loopback address on a port that will not exist again, and
     * `href` is one of the three attributes the pass below keeps. Left alone it ships, and
     * the readers of this fragment are exactly the ones with no JavaScript to repair it.
     *
     * The templates used to avoid this by marking the links `external`, which suppresses
     * the rewrite -- at the price of making them full page loads, since `external` also
     * tells the router not to intercept the click. That traded away the client-side
     * navigation to fix a build artifact. Fixing the build artifact in the build is the
     * cheaper side of that trade: the app keeps soft navigation and this file gets the
     * durable URL.
     *
     * Deliberately narrow: it rewrites only hrefs that are *already* absolute against this
     * origin, which is exactly the set the router synthesised. Everything else is left
     * byte-for-byte alone.
     *
     * Resolving every href against `location.href` instead would be the tidier-looking
     * loop and it is wrong here. The collapse toggles in history.html are bare fragments,
     * `href="#highlights_9"`, and resolving those yields
     * "/resume/expanded#highlights_9" -- a rewrite of links that were never broken, and a
     * diff in this file that has nothing to do with the problem being fixed. Cross-origin
     * links and `mailto:` fall out of the check for free.
     */
    for (const el of app.querySelectorAll("a[href]")) {
      const raw = el.getAttribute("href");
      if (!raw.startsWith(location.origin)) continue;
      const url = new URL(raw);
      el.setAttribute("href", `${url.pathname}${url.search}${url.hash}`);
    }

    const keep = new Set(keepAttributes);
    for (const el of app.querySelectorAll("*")) {
      for (const name of [...el.getAttributeNames()]) {
        if (!keep.has(name)) {
          el.removeAttribute(name);
        }
      }
    }

    /**
     * The Font Awesome icons leave an empty element behind once their class is gone,
     * except where a `title` gives them content worth keeping.
     */
    for (const el of [...app.querySelectorAll("i")]) {
      if (!el.hasAttribute("title") && el.textContent.trim() === "") {
        el.remove();
      }
    }

    /**
     * Aurelia's custom elements and template controllers nest a span per binding, so a
     * single skill arrives as `<span><span><span><a>TypeScript</a></span></span></span>`.
     * Once the classes are gone those layers say nothing at all, and there are enough of
     * them to matter.
     *
     * Unwrapped only where the span holds exactly one element and no text of its own.
     * That is the condition under which the objection to unwrapping spans does not
     * apply: the hazard was always joining two text runs that a span boundary kept
     * apart, and a span with no text children has no run to join. Repeated until stable
     * because each layer removed exposes the next.
     */
    let changed = true;
    while (changed) {
      changed = false;
      for (const el of [...app.querySelectorAll("span")]) {
        if (el.attributes.length > 0 || !el.parentNode || el.children.length !== 1) continue;
        const holdsText = [...el.childNodes].some(
          (node) => node.nodeType === Node.TEXT_NODE && node.nodeValue.trim() !== "",
        );
        if (holdsText) continue;
        while (el.firstChild) {
          el.parentNode.insertBefore(el.firstChild, el);
        }
        el.remove();
        changed = true;
      }
    }

    /**
     * Divs left holding nothing are removed. The sidebar column is the case that
     * motivates it: its two children, the second contact block and the table of
     * contents, are both taken out above, leaving `<div class="col-hide-md col-lg-4
     * col-xl-3 hidden-print">  </div>` carrying only whitespace.
     *
     * Runs last so it also catches divs emptied by the earlier steps, and repeats because
     * removing a div can empty its parent in turn. Restricted to `<div>` so that elements
     * which are meant to be empty are left alone.
     *
     * The cap is a guard against a rule that never settles, not an expected limit -- the
     * loop exits on the first pass that removes nothing, which in practice is the second
     * or third. Reaching ten means something is regenerating what was removed, and that
     * is worth a failed build rather than a silently truncated capture.
     */
    for (let pass = 0; ; pass++) {
      if (pass >= 10) {
        throw new Error("empty-div removal did not stabilise within 10 passes");
      }
      let removed = false;
      for (const el of [...app.querySelectorAll("div")]) {
        if (el.children.length === 0 && el.textContent.trim() === "") {
          el.remove();
          removed = true;
        }
      }
      if (!removed) break;
    }

    /**
     * Otherwise the structure is returned as Chrome rendered it: no block element is
     * unwrapped.
     *
     * An earlier version dissolved attribute-less divs and collapsed every text node,
     * on the theory that a layout div carries no meaning once its class is gone. That
     * is not reliably true: the separation between two items is frequently nothing but
     * the div boundary plus a CSS rule this fragment does not carry, so unwrapping ran
     * "LLM Pipeline Architecture" and "AI System Evaluation" together into one string.
     * Every such bug is a bug this pass cannot have, because it no longer touches
     * structure at all.
     *
     * The cost is carrier divs and template indentation in the output. That is inert
     * for the readers this fragment exists for, and cheaper than being wrong.
     */
    /**
     * Taken from inside `au-viewport` rather than from `<app>`. The viewport is the
     * router's mount point: it means something to a running app and nothing to a static
     * copy, no rule in the stylesheet refers to it, and in the served page this block
     * sits outside `<app>` altogether. Carrying the element across would preserve a
     * wrapper that no longer stands for anything.
     */
    const viewport = app.querySelector("au-viewport");
    if (!viewport) {
      throw new Error("no au-viewport found in the rendered app; the router did not mount");
    }
    return viewport.innerHTML;
  }, KEEP_ATTRIBUTES);

  /**
   * The capture is written as a complete document rather than as a bare fragment, so it
   * can be opened and checked on its own. A fragment cannot be: with no `<head>` there is
   * no stylesheet, so every class in it goes uninterpreted and the file renders as
   * unstyled markup no matter how correct it is.
   *
   * The head is built from `dist/index.html` so the styling shown here is the styling the
   * fragment will actually get once inserted, rather than an approximation of it that can
   * drift. Two adjustments make it openable from disk: the asset path is rewritten from
   * the site-root `/assets/` to `dist/assets/`, which is where it sits relative to this
   * file, and `crossorigin` is dropped, because over `file://` it makes the browser apply
   * a CORS check that an opaque origin cannot pass and the stylesheet is fetched and then
   * discarded.
   *
   * None of this head reaches production. `prerender-insert.mjs` takes only what is
   * between the body tags, so the rewritten paths exist purely to make this file
   * viewable and are discarded at the point of insertion.
   */
  const shell = await readFile(resolve(process.cwd(), SHELL_PATH), "utf8");
  const title = (shell.match(/<title>([\s\S]*?)<\/title>/) || [, "Prerendered resume"])[1];
  const stylesheets = (shell.match(/<link[^>]+rel="stylesheet"[^>]*>/g) || [])
    .map((tag) => tag.replace(/\s+crossorigin/g, "").replace(/href="\/assets\//g, 'href="dist/assets/'))
    .join("\n    ");

  const document = `<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
    ${stylesheets}
</head>

<body>
${html}
</body>

</html>
`;

  await writeFile(resolve(process.cwd(), OUTPUT_PATH), document, "utf8");

  const entries = (html.match(/data-work-entry/g) || []).length;
  console.log(
    `prerender capture: ${Buffer.byteLength(html, "utf8")} bytes of markup, ${entries} work entries, ` +
      `written to ${OUTPUT_PATH} as a ${Buffer.byteLength(document, "utf8")} byte document`,
  );
} finally {
  await browser.close();
  await server.close();
}
