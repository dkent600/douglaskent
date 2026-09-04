import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { Plugin } from "vite";

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
 * Unlike the JSON-LD plugin there is no `writeBundle` hook, because there is no standalone
 * file to emit -- head tags only mean anything inside the document.
 */
const RESUME_PATH = "src/static/resume.json";

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
 * Search engines truncate a description around this length. The cap only ever applies to
 * the fallback -- `basics.metaDescription` is hand-written to fit.
 */
const DESCRIPTION_LIMIT = 160;

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

      const canonical = `${SITE_ORIGIN}${CANONICAL_PATH}`;

      /**
       * No `og:image`. `basics.picture` is empty, so there is nothing to point at, and an
       * `og:image` naming a file that does not exist is worse than none: an unfurler that
       * finds a broken image may render a blank card rather than fall back to the text.
       *
       * `twitter:card` is `summary` and not `summary_large_image` for the same reason --
       * the large-image card has nothing to fill it with.
       */
      return [
        { tag: "title", children: escapeText(title), injectTo: "head" as const },
        { tag: "meta", attrs: { name: "description", content: description }, injectTo: "head" as const },
        { tag: "link", attrs: { rel: "canonical", href: canonical }, injectTo: "head" as const },
        { tag: "meta", attrs: { property: "og:type", content: "profile" }, injectTo: "head" as const },
        { tag: "meta", attrs: { property: "og:title", content: title }, injectTo: "head" as const },
        { tag: "meta", attrs: { property: "og:description", content: description }, injectTo: "head" as const },
        { tag: "meta", attrs: { property: "og:url", content: canonical }, injectTo: "head" as const },
        { tag: "meta", attrs: { name: "twitter:card", content: "summary" }, injectTo: "head" as const },
      ];
    },
  };
}
