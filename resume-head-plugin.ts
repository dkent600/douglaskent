import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { HtmlTagDescriptor, Plugin } from "vite";

import { stripHtml } from "./resume-text";

/**
 * Derives the `<head>` SEO tags -- title, description, canonical and Open Graph -- from
 * `src/static/resume.json` and injects them into `index.html`.
 *
 * Same reasoning as `resume-jsonld-plugin.ts`, and for the same reason it runs in
 * `transformIndexHtml` rather than in the app: the router sets the document title at
 * runtime, which is invisible to any reader that does not execute JavaScript. That is
 * every AI crawler (GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot) and every social
 * link unfurler. The shell was previously served with no `<title>` and no description at
 * all, so those readers saw a page with no name. These tags have to be in the HTML as
 * served.
 *
 * `resume.json` is the only source of truth, and the tags are regenerated on every build.
 *
 * The plugin also emits `dist/sitemap.xml` from `writeBundle`. That is not a head tag, but it
 * belongs here rather than in `public/`: the sitemap's first entry is the canonical URL, which
 * is already the constant `CANONICAL_PATH` below, and a hand-written sitemap would put that
 * address in two places. There is an open question about whether the canonical should move
 * from `/resume/expanded` to the bare domain; generating the sitemap means it follows that
 * decision automatically instead of silently disagreeing with the head after it is made.
 */
const RESUME_PATH = "src/static/resume.json";

/**
 * Where the generated sitemap lands. `dist` rather than `src/static` because, unlike the
 * standalone JSON-LD file, nothing but the deploy reads it, and `dist` is where the FTP
 * script's `lcd dist` already points. `ftpDeploy.txt` names every file individually, so a
 * line for `sitemap.xml` is what makes this reach the server -- without it the file builds
 * correctly and never goes live.
 */
const SITEMAP_PATH = "dist/sitemap.xml";

/**
 * The site origin, defined once. It appears in both the canonical link and `og:url`, and
 * those two must never disagree: a canonical pointing one place while `og:url` points
 * another is precisely the ambiguity canonicalization exists to remove.
 */
const SITE_ORIGIN = "https://www.douglaskent.com";

/**
 * The address the whole site canonicalizes to. `/resume/expanded` rather than `/resume`
 * because the expanded variant is the one that renders every collapsible section, so it
 * is the copy with the most text for a crawler to read. This matches what `index.html`
 * used to hardcode; that link has been removed in favour of this plugin owning it.
 */
const CANONICAL_PATH = "/resume/expanded";

/**
 * The canonical address itself, at module scope so the head tags and `sitemap.xml` are
 * literally the same string rather than two constructions of it. The sitemap's `<loc>` and
 * the `href` on `<link rel="canonical">` have to agree byte for byte -- a sitemap that
 * submits an address the page does not claim as canonical is the same mixed signal the
 * canonical link exists to remove.
 */
const canonical = `${SITE_ORIGIN}${CANONICAL_PATH}`;

/**
 * The plain-text resume, listed in the sitemap and linked as `rel="alternate"`.
 */
const PLAIN_TEXT_PATH = "/resume.txt";

/**
 * Search engines truncate a description around this length. The cap only ever applies to
 * the fallback -- `basics.metaDescription` is hand-written to fit.
 */
const DESCRIPTION_LIMIT = 160;

/**
 * Intrinsic size of `public/og-preview.png`. Declaring it lets an unfurler lay the card
 * out on the first scrape rather than deferring until it has fetched the image itself,
 * which is the difference between a card that renders immediately and one that appears
 * on the second share.
 *
 * Constants rather than measured from the file: the plugin has no image decoder, and
 * adding a dependency to learn two numbers that change only when the card is redrawn is
 * not worth it. The cost is that swapping in a differently-sized card silently makes
 * these wrong, so the size belongs in the same commit as the file.
 */
const IMAGE_WIDTH = "1200";
const IMAGE_HEIGHT = "630";

/**
 * Escapes text that Vite will insert verbatim.
 *
 * `serializeAttrs` runs attribute values through `escape-html`, so anything passed as an
 * attr is already safe. A tag's `children` string is not: `serializeTags` returns it as
 * written. `basics.label` contains a literal `&`, so the title text is escaped here or it
 * reaches the document unescaped.
 */
const escapeText = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/**
 * Trims to `limit` characters without cutting a word in half, so a truncated description
 * still reads as a sentence fragment rather than as a typo. No ellipsis is appended --
 * the point is to fit inside the limit, and the ellipsis would spend characters saying
 * something the truncation already implies.
 */
function truncateOnWord(value: string, limit: number): string {
  if (value.length <= limit) return value;
  const clipped = value.slice(0, limit);
  const lastSpace = clipped.lastIndexOf(" ");
  return (lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped).trimEnd();
}

export function resumeHead(): Plugin {
  return {
    name: "resume-head",

    async transformIndexHtml() {
      const resume = JSON.parse(await readFile(resolve(process.cwd(), RESUME_PATH), "utf8"));
      const basics = resume.basics ?? {};

      /**
       * `metaTitle` exists because the SERP headline has a length budget that nothing
       * else derived from `resume.json` has to live within. Google truncates around 60
       * characters, and `${name} — ${label}` is 81, so the part that gets cut is
       * "LLM Systems, Blockchain" -- the specialization the page is aimed at.
       *
       * Shortening `label` is not the fix. The JSON-LD block reads it for `jobTitle` and
       * `hasOccupation.name`, where there is no length budget and the long form is the
       * accurate one. So the two are deliberately different strings describing the same
       * role, and that divergence is the point of this field rather than a drift to be
       * reconciled.
       *
       * The fallback keeps the page titled if the field is ever emptied, and warns for
       * the same reason the description fallback does: degrading quietly to an 81-character
       * title would look like nothing had happened.
       *
       * `stripHtml` for the same reason the JSON-LD plugin uses it: nothing in these
       * fields carries markup today, but a future edit to one of them should not put a
       * tag into a `<title>`.
       */
      const metaTitle = typeof basics.metaTitle === "string" ? stripHtml(basics.metaTitle) : "";
      let title = metaTitle;
      if (title === "") {
        const name = typeof basics.name === "string" ? basics.name : "";
        const label = typeof basics.label === "string" ? stripHtml(basics.label) : "";
        title = `${name} — ${label}`;
        this.warn(`basics.metaTitle is missing or empty; falling back to basics.name and basics.label`);
      }

      /**
       * `metaDescription` is written for this purpose and is the only field that should
       * ever fill it. The fallback exists so a missing or emptied field degrades to
       * something true rather than to no description at all -- but it is a degradation,
       * and it is worth knowing about, hence the warning.
       */
      const metaDescription = typeof basics.metaDescription === "string" ? basics.metaDescription.trim() : "";
      let description = metaDescription;
      if (description === "") {
        const summary = typeof basics.summary1 === "string" ? stripHtml(basics.summary1) : "";
        description = truncateOnWord(summary, DESCRIPTION_LIMIT);
        this.warn(`basics.metaDescription is missing or empty; falling back to a truncation of basics.summary1`);
      }

      /**
       * `basics.image` is the JSON Resume field for exactly this, and the app renders it
       * nowhere -- it appears only as an editable input in `/admin`. So one value drives
       * both the card image here and `image` in the JSON-LD block, with no effect on the
       * visible page and no need for a field invented to avoid one.
       *
       * Empty remains a supported state, and it degrades rather than lies: the image tags
       * are omitted entirely and `twitter:card` falls back to `summary`. An `og:image`
       * naming a file that is not there is worse than none -- an unfurler that fetches a
       * broken image may render a blank card instead of falling back to the text, and the
       * large-image card is a promise there is an image to fill it.
       */
      const image = typeof basics.image === "string" ? basics.image.trim() : "";

      const tags: Array<HtmlTagDescriptor> = [
        { tag: "title", children: escapeText(title), injectTo: "head" as const },
        { tag: "meta", attrs: { name: "description", content: description }, injectTo: "head" as const },
        /**
         * LinkedIn's Post Inspector reports "No author found" without this. The rendered
         * card does not display an author either way, so the tag is for other consumers
         * rather than for LinkedIn itself.
         *
         * Deliberately no `article:published_time` or `article:modified_time` alongside it.
         * A resume has no publication date, and the `article:*` namespace contradicts the
         * `og:type` of `profile` below -- adding them would assert something false in order
         * to satisfy a classifier that has already mistyped the page as an Article.
         */
        { tag: "meta", attrs: { name: "author", content: basics.name }, injectTo: "head" as const },
        { tag: "link", attrs: { rel: "canonical", href: canonical }, injectTo: "head" as const },
        /**
         * A hint, not a mechanism. No major crawler documents following `rel="alternate"`
         * to a plain-text variant, and Google's documented uses of the relation are hreflang
         * and media variants, neither of which this is. It costs one line and it is the
         * conventional way to say "the same document, in this other format", so it is worth
         * having -- but `sitemap.xml`, emitted below, is what actually gets `/resume.txt`
         * fetched. Do not mistake this tag for the load-bearing part.
         *
         * There is deliberately no second and third alternate for `/resume.json` and
         * `/resume-json-ld.json`. The JSON-LD is already inlined in this same head, so
         * linking a second copy of it is redundant, and nothing looks for a JSON Resume
         * document at a linked path.
         */
        {
          tag: "link",
          attrs: { rel: "alternate", type: "text/plain", href: PLAIN_TEXT_PATH, title: "Plain-text resume" },
          injectTo: "head" as const,
        },
        { tag: "meta", attrs: { property: "og:type", content: "profile" }, injectTo: "head" as const },
        { tag: "meta", attrs: { property: "og:title", content: title }, injectTo: "head" as const },
        { tag: "meta", attrs: { property: "og:description", content: description }, injectTo: "head" as const },
        { tag: "meta", attrs: { property: "og:url", content: canonical }, injectTo: "head" as const },
      ];

      /**
       * Appended rather than written into the literal above so the `og:` properties stay
       * contiguous and in the order an unfurler reads them.
       */
      if (image !== "") {
        tags.push(
          { tag: "meta", attrs: { property: "og:image", content: image }, injectTo: "head" },
          { tag: "meta", attrs: { property: "og:image:width", content: IMAGE_WIDTH }, injectTo: "head" },
          { tag: "meta", attrs: { property: "og:image:height", content: IMAGE_HEIGHT }, injectTo: "head" },
          /**
           * The card renders this same name and role, so the title is a literal description
           * of the image rather than a restatement of the page.
           */
          { tag: "meta", attrs: { property: "og:image:alt", content: title }, injectTo: "head" },
        );
      }

      tags.push({
        tag: "meta",
        attrs: { name: "twitter:card", content: image === "" ? "summary" : "summary_large_image" },
        injectTo: "head",
      });

      return tags;
    },

    /**
     * Emits `sitemap.xml`. Build only, for the same reason `resume-jsonld-plugin.ts` writes
     * its standalone file from `writeBundle`: the hook does not run under `vite dev`, so
     * editing the resume in the admin UI does not rewrite a file on every keystroke.
     *
     * Two entries, and only two. `/resume` and `/resume/short` are deliberately absent: both
     * declare `/resume/expanded` canonical, so listing them would submit addresses the pages
     * themselves disclaim.
     */
    async writeBundle() {
      const resume = JSON.parse(await readFile(resolve(process.cwd(), RESUME_PATH), "utf8"));

      /**
       * `lastUpdated` is a top-level field, not one under `basics`, and it is already an ISO
       * date -- which is exactly what `lastmod` is defined to take. It is deliberately not a
       * build timestamp: `lastmod` means when the content last changed, and stamping every
       * build would tell a crawler the page changed each time the bundle was rebuilt, which
       * is the fastest way to have the field ignored entirely. A missing field therefore
       * omits `lastmod` rather than substituting `Date.now()`.
       */
      const lastUpdated = typeof resume.lastUpdated === "string" ? resume.lastUpdated.trim() : "";
      if (lastUpdated === "") {
        this.warn(`lastUpdated is missing or empty; sitemap.xml will carry no lastmod`);
      }
      const lastmod = lastUpdated === "" ? "" : `\n    <lastmod>${lastUpdated}</lastmod>`;

      const urls = [canonical, `${SITE_ORIGIN}${PLAIN_TEXT_PATH}`]
        .map((loc) => `  <url>\n    <loc>${loc}</loc>${lastmod}\n  </url>`)
        .join("\n");

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

      await writeFile(resolve(process.cwd(), SITEMAP_PATH), xml, "utf8");
    },
  };
}
