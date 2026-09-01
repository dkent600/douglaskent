import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { Plugin } from "vite";

import { stripHtml } from "./resume-text";
import { SUMMARY_KEYS } from "./src/stores/resume-store";

/**
 * Derives a plain-text resume from `src/static/resume.json`.
 *
 * The audience is anything that wants the resume as prose rather than as a document: a
 * paste into an application form, a `curl`, a reader that will not run JavaScript. The
 * page and the JSON-LD block already serve their own audiences from the same source.
 *
 * `resume.json` is the only source of truth and is never modified here. The file is
 * regenerated on every build and lives in `src/static` because the FTP script uploads from
 * there -- it is build output, never authored by hand, and editing it achieves nothing.
 *
 * Section order below is fixed by this file, not by the key order in `resume.json`. The
 * JSON is organised for the page; a resume is read top to bottom in a conventional order,
 * and that order is a property of the format rather than of the data.
 */
const RESUME_PATH = "src/static/resume.json";

const OUTPUT_PATH = "src/static/resume.txt";

/**
 * Hard wrap column. 78 leaves a plain-text file readable in an 80-column terminal and in
 * the quoted body of an email without a second layer of wrapping.
 */
const WRAP_WIDTH = 78;

/**
 * `basics.profiles` networks that belong in the contact block, in the order listed.
 *
 * Email is excluded along with both phone numbers, the street address and the postal code.
 * This file is published to the open web, so the contact block carries only what is
 * already public: the site, LinkedIn and GitHub. `Website` is excluded here because
 * `basics.website` already supplies the same URL.
 */
const CONTACT_NETWORKS = ["LinkedIn", "GitHub"];

/**
 * Values of `endDate` that mean the job has not ended, alongside a missing or empty field.
 *
 * The current entry stores the literal string `"present"` rather than leaving the field
 * empty, so testing only for absence would render it as an end date of "present" in the
 * middle of a `MM/YYYY` range.
 */
const OPEN_ENDED = new Set(["present", "current", "now", "ongoing"]);

/**
 * Named entities appearing in the HTML-authored fields.
 *
 * Only the handful that occur, plus the four that any HTML-bearing field could acquire.
 * A general entity decoder would be a dependency for no benefit.
 */
const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&#x27;": "'",
};

/**
 * Typography in `resume.json` that has no ASCII character but does have an ASCII reading.
 *
 * `resume.json` keeps its em-dashes and curly quotes because the page renders them
 * correctly; this map is how the plain-text format renders them, and the other
 * transformers are free to make a different choice. The em-dash becomes a spaced hyphen
 * rather than a bare one so that "Architect - Human Lens" still reads as a break rather
 * than as a hyphenated word; the surrounding whitespace is collapsed afterwards, so an
 * em-dash that already had spaces around it does not end up with two.
 */
const TYPOGRAPHY: Record<string, string> = {
  "—": " - ",
  "–": "-",
  "‒": "-",
  "―": "-",
  "‑": "-",
  "·": "-",
  "•": "-",
  "‘": "'",
  "’": "'",
  "‚": "'",
  "“": '"',
  "”": '"',
  "„": '"',
  "′": "'",
  "″": '"',
  "…": "...",
  /**
   * Escaped rather than written literally: a no-break space, a thin space and a narrow
   * no-break space are indistinguishable from a plain space in an editor, and a key that
   * cannot be reviewed is a key that cannot be reviewed for correctness. `resume.json`
   * holds one U+00A0 today.
   */
  "\u00a0": " ",
  "\u2009": " ",
  "\u202f": " ",
};

/**
 * An anchor in one of the HTML-authored fields, with its href and its link text.
 *
 * The href may be double-quoted, single-quoted or bare; `resume.json` uses both quote
 * styles today. The link text is matched lazily so two anchors in one sentence do not
 * collapse into one match.
 */
const ANCHOR = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s">]+))[^>]*>([\s\S]*?)<\/a>/gi;

/**
 * Rewrites anchors as `text (url)` ahead of the tag strip.
 *
 * This lives here and deliberately not in the shared `stripHtml`. Plain text has no way to
 * carry a link, so dropping the tag drops the destination and leaves a dangling reference
 * -- "Read more about them at Kolektivo and The Prime Suite" naming two sites the reader
 * cannot reach. Spelling the URL out is the plain-text rendering of a link.
 *
 * The JSON-LD block wants the opposite: its `description` is prose for a machine reader
 * that already has `url` and `sameAs` as structured properties, so a URL spliced into the
 * sentence would be noise there. `stripHtml` therefore stays a bare tag strip and each
 * format decides for itself.
 *
 * A link whose text is already the URL is emitted once rather than twice.
 */
function renderAnchors(value: string): string {
  return value.replace(ANCHOR, (_match, doubleQuoted, singleQuoted, bare, inner) => {
    const url = ((doubleQuoted ?? singleQuoted ?? bare ?? "") as string).trim();
    const text = stripHtml(inner as string);

    if (url === "") return text;
    if (text === "" || text === url) return url;
    return `${text} (${url})`;
  });
}

interface Warnings {
  add: (message: string) => void;
}

/**
 * Collects the data problems found while rendering, so they are reported rather than
 * silently repaired. Nothing here edits `resume.json`; the output is corrected and the
 * source is left for Doug to reconcile.
 */
function createWarnings(): Warnings & { list: Array<string> } {
  const seen = new Set<string>();
  const list: Array<string> = [];
  return {
    list,
    add(message: string) {
      if (seen.has(message)) return;
      seen.add(message);
      list.push(message);
    },
  };
}

/**
 * Renders one source field as plain ASCII: links spelled out, tags out, entities decoded,
 * typography folded, whitespace collapsed.
 *
 * Accents are folded by decomposing and dropping the combining marks, which turns "Quebec"
 * spelled with an acute into the same word spelled without one. That is a lossy but
 * conventional rendering for a file that has to be pure ASCII, and it is applied after the
 * explicit `TYPOGRAPHY` map so that characters with a real ASCII reading get that reading
 * rather than being decomposed into nothing.
 *
 * Anything still outside ASCII after all of that becomes `?` and is reported, because a
 * character this function does not know about is a gap in the map rather than something to
 * swallow.
 */
function toAscii(value: string, warnings: Warnings): string {
  let text = stripHtml(renderAnchors(value));

  for (const [entity, replacement] of Object.entries(ENTITIES)) {
    text = text.split(entity).join(replacement);
  }

  for (const [character, replacement] of Object.entries(TYPOGRAPHY)) {
    text = text.split(character).join(replacement);
  }

  text = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  text = text.replace(/[^\x20-\x7e]/g, (character) => {
    const code = character.codePointAt(0) ?? 0;
    if (character === "\n" || character === "\r" || character === "\t") return " ";
    warnings.add(`unmapped non-ASCII character U+${code.toString(16).toUpperCase().padStart(4, "0")} replaced with "?"`);
    return "?";
  });

  return text.replace(/\s+/g, " ").trim();
}

/**
 * Greedy word wrap. A word longer than the remaining width -- a URL, in practice -- is put
 * on its own line and allowed to overrun rather than being broken, because a broken URL
 * cannot be clicked or copied.
 */
function wrap(text: string, indent = "", width = WRAP_WIDTH): Array<string> {
  if (text === "") return [];

  const lines: Array<string> = [];
  let line = "";

  for (const word of text.split(" ")) {
    if (line === "") {
      line = word;
    } else if (`${indent}${line} ${word}`.length <= width) {
      line = `${line} ${word}`;
    } else {
      lines.push(`${indent}${line}`);
      line = word;
    }
  }
  if (line !== "") lines.push(`${indent}${line}`);

  return lines;
}

/**
 * A bullet with a hanging indent, so continuation lines sit under the text rather than
 * under the marker.
 */
function bullet(text: string): Array<string> {
  return hangingIndent(text, "- ");
}

/**
 * Wraps `text` with its continuation lines indented two columns under the first, optionally
 * behind a marker.
 *
 * The indent is what makes a wrapped line read as a continuation rather than as a new
 * paragraph. Without it a long `Skills / Technologies:` list looks like loose prose from its second
 * line on, which is how the skill categories are set for the same reason.
 */
function hangingIndent(text: string, marker = ""): Array<string> {
  const lines = wrap(text, "", WRAP_WIDTH - 2);
  return lines.map((line, index) => (index === 0 ? `${marker}${line}` : `  ${line}`));
}

/**
 * `YYYY-MM` to `MM/YYYY`. A value that is not in that shape is passed through unchanged
 * and reported, rather than being coerced into a date it may not be.
 */
function formatMonth(value: string, label: string, warnings: Warnings): string {
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (match) return `${match[2]}/${match[1]}`;

  warnings.add(`${label}: date "${value}" is not in YYYY-MM form; emitted verbatim`);
  return value.trim();
}

const isOpenEnded = (value: unknown): boolean =>
  typeof value !== "string" || value.trim() === "" || OPEN_ENDED.has(value.trim().toLowerCase());

/**
 * `priority` is typed inconsistently across the file's history -- mostly numbers, at times
 * strings. Coercing explicitly keeps the sort numeric; anything that will not coerce sorts
 * last rather than poisoning the comparison.
 */
const priorityOf = (skill: Record<string, any>): number => {
  const value = Number(skill.priority);
  return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value;
};

/**
 * Every name and alias in `skills[]`, pointing at the skill that owns it.
 *
 * This exists only to look up a `priority` for ordering a work entry's technologies. It is
 * never used to rewrite what the entry says: an entry naming "HTML5" is ordered by the
 * priority of "HTML", which owns that alias, and still prints "HTML5".
 *
 * The lower-cased map is a fallback, not the primary lookup. 17 of the references in
 * `resume.json` differ from the canonical spelling only in case ("Javascript", "jQuery",
 * "T-Sql"), and without it each of those would sort last as though it were unknown, which
 * would be an ordering bug dressed up as missing data. An exact match always wins.
 *
 * First writer wins on collision, and blank keys are skipped -- one skill carries an empty
 * string in its `aliases`, which would otherwise match an empty reference.
 */
function indexSkills(skills: Array<Record<string, any>>): {
  exact: Map<string, Record<string, any>>;
  lowercased: Map<string, Record<string, any>>;
} {
  const exact = new Map<string, Record<string, any>>();
  const lowercased = new Map<string, Record<string, any>>();

  for (const skill of skills) {
    const aliases: Array<unknown> = Array.isArray(skill.aliases) ? skill.aliases : [];
    for (const key of [skill.name, ...aliases]) {
      if (typeof key !== "string" || key.trim() === "") continue;
      if (!exact.has(key)) exact.set(key, skill);
      if (!lowercased.has(key.toLowerCase())) lowercased.set(key.toLowerCase(), skill);
    }
  }

  return { exact, lowercased };
}

/**
 * Accumulates the document, keeping the blank-line rules in one place instead of scattering
 * `""` pushes through the section builders.
 */
class Document {
  private readonly lines: Array<string> = [];

  section(heading: string): void {
    if (this.lines.length > 0) {
      this.lines.push("", "");
    }
    this.lines.push(heading.toUpperCase(), "");
  }

  /**
   * A block of lines, separated from whatever precedes it in the same section by `gap`
   * blank lines. Empty blocks are dropped so a missing field cannot leave a stray gap.
   *
   * The separation is topped up to `gap` rather than appended, so a block landing straight
   * after a heading -- which already leaves one blank line behind it -- does not open with
   * a wider gap than the heading intends.
   */
  block(lines: Array<string>, gap = 1): void {
    if (lines.length === 0) return;

    if (this.lines.length > 0) {
      let blanks = 0;
      while (blanks < this.lines.length && this.lines[this.lines.length - 1 - blanks] === "") blanks++;
      for (let index = blanks; index < gap; index++) this.lines.push("");
    }

    this.lines.push(...lines);
  }

  toString(): string {
    return `${this.lines.join("\n").replace(/\s+$/, "")}\n`;
  }
}

export function buildResumeText(resume: Record<string, any>): { text: string; warnings: Array<string> } {
  const warnings = createWarnings();
  const clean = (value: unknown): string => (typeof value === "string" ? toAscii(value, warnings) : "");

  const doc = new Document();
  const basics = resume.basics ?? {};
  const location = basics.location ?? {};

  /**
   * Contact block. No heading -- the name at the top of the file is the heading, and a
   * resume that opens with the word "CONTACT" reads as a form rather than as a document.
   */
  const contact = [clean(basics.name), clean(basics.label)];

  const place = [location.city, location.region, location.countryName]
    .map((part) => clean(part))
    .filter((part) => part !== "");
  if (place.length > 0) contact.push(place.join(", "));

  if (clean(basics.website) !== "") contact.push(clean(basics.website));

  const profiles: Array<Record<string, any>> = Array.isArray(basics.profiles) ? basics.profiles : [];
  for (const network of CONTACT_NETWORKS) {
    const profile = profiles.find((entry) => entry.network === network);
    const url = clean(profile?.url);
    if (url !== "") contact.push(url);
  }

  doc.block(contact.filter((line) => line !== ""));

  doc.section("Professional Summary");
  for (const key of SUMMARY_KEYS) {
    const paragraph = clean(basics[key]);
    if (paragraph === "") {
      warnings.add(`basics.${key} is missing or empty; omitted from PROFESSIONAL SUMMARY`);
      continue;
    }
    doc.block(wrap(paragraph));
  }

  /**
   * Rendered in array order and never sorted. The order in `resume.json` is deliberate
   * positioning -- what the resume leads with -- and re-sorting would throw away the only
   * thing the array says beyond its contents.
   *
   * One entry per line, single column. The page sets these in two columns and this format
   * deliberately does not: column alignment in plain text depends on the reader's font and
   * collapses under any reflow, and an ATS parser reading two entries on one line is
   * liable to take them for a single token.
   *
   * Each entry still goes through `wrap`, so an entry longer than the column budget breaks
   * the way every other line does rather than being a special case. The longest today is
   * 40 characters, so none of them wrap.
   *
   * The section is omitted entirely -- heading included -- when there is nothing to put in
   * it, so a missing or empty array cannot leave a heading standing over nothing.
   */
  const expertise: Array<unknown> = Array.isArray(resume.areasOfExpertise) ? resume.areasOfExpertise : [];
  const areas = expertise.flatMap((area) => {
    const text = clean(area);
    return text === "" ? [] : wrap(text);
  });

  if (areas.length > 0) {
    doc.section("Areas of Expertise");
    doc.block(areas);
  }

  /**
   * Every accomplishment, not the short list. `showOnShort` selects what the page's
   * condensed view shows and has no bearing on a full-text resume.
   */
  const accomplishments: Array<Record<string, any>> = Array.isArray(resume.accomplishments) ? resume.accomplishments : [];
  doc.section("Selected Accomplishments");
  doc.block(accomplishments.flatMap((entry) => bullet(clean(entry.text))).filter((line) => line !== ""));

  /**
   * Every skill, grouped by category.
   *
   * `hide` is deliberately not consulted: it governs which category pills the page's
   * Skills section collapses, which is a layout concern of that page and not a statement
   * that the skill should go unpublished. A skill in several categories is listed under
   * each, because the categories are how a reader navigates the list.
   */
  const skills: Array<Record<string, any>> = Array.isArray(resume.skills) ? resume.skills : [];
  const categories: Array<string> = Array.isArray(resume.skillCategories) ? resume.skillCategories : [];

  doc.section("Skills and Technologies");

  const named = skills.filter((skill) => typeof skill.name === "string" && skill.name.trim() !== "");
  const placed = new Set<Record<string, any>>();

  const renderCategory = (heading: string, members: Array<Record<string, any>>): void => {
    if (members.length === 0) return;
    const sorted = [...members].sort(
      (a, b) => priorityOf(a) - priorityOf(b) || String(a.name).localeCompare(String(b.name)),
    );
    doc.block([heading, ...wrap(sorted.map((skill) => clean(skill.name)).join(", "), "  ")]);
  };

  for (const category of categories) {
    const members = named.filter((skill) => Array.isArray(skill.categories) && skill.categories.includes(category));
    members.forEach((skill) => placed.add(skill));
    renderCategory(clean(category), members);
  }

  /**
   * A skill whose categories are all absent from `skillCategories` would otherwise vanish
   * from a file that is supposed to list every one of them. There are none today; this
   * keeps that from becoming a silent omission if the two arrays ever drift apart.
   */
  const orphans = named.filter((skill) => !placed.has(skill));
  if (orphans.length > 0) {
    warnings.add(
      `${orphans.length} skill(s) have no category listed in skillCategories and were grouped under OTHER: ${orphans
        .map((skill) => String(skill.name))
        .join(", ")}`,
    );
    renderCategory("Other", orphans);
  }

  /**
   * Sorted by start date, newest first. The array order in `resume.json` is the page's
   * display grouping -- professional work, then personal projects -- so it is not
   * chronological and sorting is required rather than cosmetic.
   */
  const work: Array<Record<string, any>> = Array.isArray(resume.work) ? resume.work : [];
  const chronological = work
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const left = String(a.entry.startDate ?? "");
      const right = String(b.entry.startDate ?? "");
      if (left === right) return a.index - b.index;
      return left < right ? 1 : -1;
    });

  doc.section("Professional Experience");

  const skillIndex = indexSkills(named);

  /**
   * References that matched only after lower-casing. Collected and reported once at the
   * end rather than one warning apiece, because they are all the same finding -- casing in
   * the work entries has drifted from casing in `skills[]` -- and 17 near-identical lines
   * would bury the warnings that are about something else.
   */
  const casingVariants = new Set<string>();

  for (const [ordinal, { entry, index }] of chronological.entries()) {
    /**
     * The entry as labelled blocks, joined below by one blank line each. A block whose
     * content is absent is never pushed, so its label never appears over nothing -- 16 of
     * the 35 entries carry no skills and get no "Skills / Technologies:" line at all.
     */
    const blocks: Array<Array<string>> = [];

    const position = clean(entry.position);
    if (position === "") warnings.add(`work[${index}] has no position`);

    const start = typeof entry.startDate === "string" ? formatMonth(entry.startDate, `work[${index}].startDate`, warnings) : "";
    const end = isOpenEnded(entry.endDate) ? "Present" : formatMonth(String(entry.endDate), `work[${index}].endDate`, warnings);
    const company = clean(entry.company);

    /**
     * The unlabelled head of the entry: who and when, then where to read more. `website`
     * is absent on some entries and an empty string on others; both mean the same thing to
     * a reader, so both are treated the same and neither is reported -- an optional field
     * is allowed to be optional.
     */
    const head = [...wrap(position), ...wrap(`${company} | ${start} - ${end}`)];
    const website = clean(entry.website);
    if (website !== "") head.push(website);
    blocks.push(head);

    const summary = clean(entry.summary);
    if (summary !== "") blocks.push(["Description:", ...wrap(summary)]);

    const highlights: Array<string> = Array.isArray(entry.highlights) ? entry.highlights : [];
    const bullets = highlights.flatMap((highlight) => {
      const text = clean(highlight);
      return text === "" ? [] : bullet(text);
    });
    if (bullets.length > 0) blocks.push(["Highlights:", ...bullets]);

    /**
     * The entry's own skills, rendered exactly as the entry writes them rather than as the
     * canonical name they resolve to. An entry saying "HTML5" prints "HTML5" even though
     * the skill is "HTML" and HTML5 is one of its aliases: the alias is a keyword a job
     * posting may use, the work entry is what chose it, and rewriting it to the canonical
     * name would delete the term a search is looking for.
     *
     * `skills[]` is consulted only for a `priority` to order by. A reference resolving to
     * nothing still prints; it sorts last and is reported.
     *
     * This block closes the entry rather than opening it, so the narrative -- what the job
     * was, then what came of it -- is not interrupted by a keyword list.
     */
    const references: Array<unknown> = Array.isArray(entry.skills) ? entry.skills : [];
    const rendered = new Set<string>();
    const technologies: Array<{ text: string; priority: number }> = [];

    for (const reference of references) {
      const raw = typeof reference === "string" ? reference.trim() : "";
      const text = clean(reference);
      if (text === "") continue;

      if (rendered.has(text)) {
        warnings.add(`work[${index}] lists "${text}" more than once; rendered once`);
        continue;
      }
      rendered.add(text);

      const exact = skillIndex.exact.get(raw);
      const match = exact ?? skillIndex.lowercased.get(raw.toLowerCase());

      if (match === undefined) {
        warnings.add(`work[${index}] lists "${text}", which matches no name or alias in skills[]; ordered last`);
      } else if (exact === undefined) {
        casingVariants.add(`"${raw}" (skills[] spells it "${String(match.name)}")`);
      }

      technologies.push({ text, priority: match === undefined ? Number.POSITIVE_INFINITY : priorityOf(match) });
    }

    if (technologies.length > 0) {
      technologies.sort((a, b) => a.priority - b.priority || a.text.localeCompare(b.text));
      blocks.push(["Skills / Technologies:", ...wrap(technologies.map((technology) => technology.text).join(", "))]);
    }

    const lines: Array<string> = [];
    for (const block of blocks) {
      if (lines.length > 0) lines.push("");
      lines.push(...block);
    }

    /**
     * Two blank lines between entries, so the gap between one job and the next is wider
     * than the gaps between the labelled blocks inside them. The first entry takes one,
     * which is what the section heading has already left behind it.
     */
    doc.block(lines, ordinal === 0 ? 1 : 2);
  }

  if (casingVariants.size > 0) {
    warnings.add(
      `${casingVariants.size} skill reference(s) in work[] match skills[] only when case is ignored: ${[...casingVariants].join(", ")}`,
    );
  }

  /**
   * `summary4` is the travel paragraph, and it is deliberately not in `SUMMARY_KEYS`:
   * that list is the introduction's share of the numbered paragraphs, and the page puts
   * this one in a travel section of its own rather than in the introduction. The text
   * resume has no travel section, so it opens this one instead, where it sets the scene
   * for the two facts that follow.
   */
  doc.section("Location, Languages & Citizenship");

  const travel = clean(basics.summary4);
  if (travel === "") {
    warnings.add("basics.summary4 is missing or empty; omitted from LOCATION, LANGUAGES & CITIZENSHIP");
  } else {
    doc.block(wrap(travel));
  }

  /**
   * Fluency is lower-cased into the parenthetical because it reads as part of the
   * sentence there, not as a heading -- `resume.json` capitalises it for the page, which
   * renders it in a column of its own.
   */
  const languages: Array<Record<string, any>> = Array.isArray(resume.languages) ? resume.languages : [];
  const spoken = languages
    .map((entry) => {
      const name = clean(entry.language);
      const fluency = clean(entry.fluency).toLowerCase();
      if (name === "") return "";
      return fluency === "" ? name : `${name} (${fluency})`;
    })
    .filter((entry) => entry !== "");
  if (spoken.length > 0) doc.block(wrap(`Languages: ${spoken.join(", ")}`));

  const citizenship: Array<Record<string, any>> = Array.isArray(resume.citizenship) ? resume.citizenship : [];

  /**
   * Country names only. Every entry is "Full Citizenship" today, so the status adds
   * nothing a reader does not already infer from the word "Citizenship". An entry saying
   * anything else would be misrepresented by that omission rather than merely abbreviated,
   * so it is reported instead of being quietly flattened.
   */
  for (const entry of citizenship) {
    const status = clean(entry.status);
    if (status !== "" && status.toLowerCase() !== "full citizenship") {
      warnings.add(`citizenship "${clean(entry.country)}" has status "${status}", which this format does not render`);
    }
  }

  const countries = citizenship.map((entry) => clean(entry.country)).filter((entry) => entry !== "");
  if (countries.length > 0) doc.block(wrap(`Citizenship: ${countries.join(", ")}`));

  /**
   * Every education entry, in file order and without deduplication. Two of them are Duke,
   * 1977-1980: those are two master's degrees earned simultaneously in different subjects,
   * not one record entered twice, and collapsing them would erase a degree.
   */
  const education: Array<Record<string, any>> = Array.isArray(resume.education) ? resume.education : [];
  doc.section("Education");

  for (const entry of education) {
    const lines: Array<string> = [];
    lines.push(...wrap(clean(entry.institution)));

    const degree = [clean(entry.studyType), clean(entry.area)].filter((part) => part !== "").join(", ");
    const years = [clean(entry.startDate), clean(entry.endDate)].filter((part) => part !== "").join("-");
    const detail = [degree, years].filter((part) => part !== "").join(" | ");
    if (detail !== "") lines.push(...wrap(detail));

    doc.block(lines);
  }

  const publications: Array<Record<string, any>> = Array.isArray(resume.publications) ? resume.publications : [];
  doc.section("Publications");

  for (const entry of publications) {
    const lines: Array<string> = [];
    lines.push(...wrap(clean(entry.name)));
    const authors = clean(entry.authors);
    if (authors !== "") lines.push(...wrap(authors));
    const publisher = clean(entry.publisher);
    if (publisher !== "") lines.push(...wrap(publisher));
    doc.block(lines);
  }

  const text = doc.toString();

  /**
   * The wrap is a hard requirement of the format, and `wrap` breaks it on purpose in one
   * case: a single token longer than the column budget -- a URL, in practice -- goes on
   * its own line and overruns rather than being split, because a broken URL cannot be
   * clicked or copied. Two lines do that today, both links spelled out by `renderAnchors`.
   *
   * Reported rather than left to be noticed. The exception is deliberate, but it is still
   * an exception, and a third one appearing should show up in the build log rather than in
   * whatever happens to read the file next.
   */
  for (const [index, line] of text.split("\n").entries()) {
    if (line.length > WRAP_WIDTH) {
      warnings.add(`line ${index + 1} is ${line.length} columns, over the ${WRAP_WIDTH}-column wrap (unbreakable token): ${line.trim()}`);
    }
  }

  return { text, warnings: warnings.list };
}

export function resumeTxt(): Plugin {
  return {
    name: "resume-txt",

    /**
     * Build only, matching `resume-jsonld`. `writeBundle` does not run under `vite dev`,
     * so saving from the admin editor does not rewrite a file in `src/static` on every
     * keystroke.
     */
    async writeBundle() {
      const resume = JSON.parse(await readFile(resolve(process.cwd(), RESUME_PATH), "utf8"));
      const { text, warnings } = buildResumeText(resume);
      await writeFile(resolve(process.cwd(), OUTPUT_PATH), text, "utf8");

      /**
       * Reported, not repaired. The output is rendered correctly regardless; these say
       * what in `resume.json` produced it, so the source can be fixed at the source.
       */
      for (const warning of warnings) {
        this.warn(`resume-txt: ${warning}`);
      }
    },
  };
}
