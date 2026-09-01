import { stripHtml } from "./resume-text";
import { SUMMARY_KEYS } from "./src/stores/resume-store";

/**
 * The content of the published resume documents, resolved but not formatted.
 *
 * `resume.json` is organised for the page. A resume document is read top to bottom in a
 * conventional order, with a conventional set of labelled parts, and those decisions --
 * which sections exist and in what order, which fields feed each one, how a work entry is
 * broken up, which skills are named and how they are ordered -- are properties of "a
 * resume" rather than of any one file format. They live here so that the plain-text and
 * Word transformers cannot drift apart: a correction to what the resume *says* is made
 * once, and both documents get it.
 *
 * What is deliberately absent is any decision about how the result looks. There are no
 * column widths, no bullet characters, no blank-line rules, no heading styles. The
 * transformers receive a tree of sections, entries and labelled blocks and each renders it
 * in its own idiom -- the text file wraps at 78 columns and writes "- " as a literal
 * character, the Word file uses real heading styles and real list formatting. Forcing
 * those two through a shared renderer would be worse than keeping them apart.
 *
 * `resume.json` is never modified here.
 */

/**
 * `basics.profiles` networks that belong in the contact block, in the order listed.
 *
 * Email is excluded along with both phone numbers, the street address and the postal code.
 * These documents are published to the open web, so the contact block carries only what is
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
 *
 * Shared rather than format-specific: `&amp;` means an ampersand in every format, which is
 * not true of the plain-text transformer's typography folding, where "—" becoming " - " is
 * a choice that only a pure-ASCII byte stream has to make.
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
 * This lives here and deliberately not in the shared `stripHtml`. A document has no way to
 * carry a link that survives being pasted into an application form, so dropping the tag
 * drops the destination and leaves a dangling reference -- "Read more about them at
 * Kolektivo and The Prime Suite" naming two sites the reader cannot reach. Spelling the URL
 * out is how both published documents render a link.
 *
 * The JSON-LD block wants the opposite: its `description` is prose for a machine reader
 * that already has `url` and `sameAs` as structured properties, so a URL spliced into the
 * sentence would be noise there. `stripHtml` therefore stays a bare tag strip and each
 * format decides for itself.
 *
 * A link whose text is already the URL is emitted once rather than twice.
 */
export function renderAnchors(value: string): string {
  return value.replace(ANCHOR, (_match, doubleQuoted, singleQuoted, bare, inner) => {
    const url = ((doubleQuoted ?? singleQuoted ?? bare ?? "") as string).trim();
    const text = stripHtml(inner as string);

    if (url === "") return text;
    if (text === "" || text === url) return url;
    return `${text} (${url})`;
  });
}

/**
 * Replaces the named entities that the HTML-authored fields use with the characters they
 * stand for.
 */
export function decodeEntities(value: string): string {
  let text = value;
  for (const [entity, replacement] of Object.entries(ENTITIES)) {
    text = text.split(entity).join(replacement);
  }
  return text;
}

/**
 * Renders one source field as plain prose: links spelled out, tags out, entities decoded,
 * whitespace collapsed.
 *
 * This is the normalization every document format needs and no format can skip -- the
 * fields are authored as HTML for the page, and a document is not a page. It stops short of
 * anything typographic. Folding "—" to " - " or "ç" to "c" is a concession a pure-ASCII byte
 * stream has to make and a Word file does not, so that decision belongs to the transformer
 * that has to make it.
 *
 * Note that collapsing `\s+` already turns the no-break and thin spaces into ordinary ones,
 * because JavaScript's `\s` covers them.
 */
export function plainText(value: string): string {
  return decodeEntities(stripHtml(renderAnchors(value))).replace(/\s+/g, " ").trim();
}

/**
 * Collects the data problems found while building, so they are reported rather than
 * silently repaired. Nothing here edits `resume.json`; the output is corrected and the
 * source is left for Doug to reconcile.
 */
export interface Warnings {
  add: (message: string) => void;
}

export function createWarnings(): Warnings & { list: Array<string> } {
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
 * How a transformer turns one source field into the characters it will publish.
 *
 * Passed in rather than fixed here because the two documents disagree about exactly one
 * thing: the plain-text file folds everything to ASCII, and the Word file keeps the
 * typography as authored. That disagreement has to be settled before the content is built
 * and not after, because the resolved text is what a skill list is deduplicated and sorted
 * on -- normalizing afterwards could reorder a list or merge two entries that the other
 * format keeps apart.
 *
 * A non-string is rendered as the empty string, which is how a missing optional field
 * arrives.
 */
export type Normalizer = (value: unknown, warnings: Warnings) => string;

/**
 * The body of a block. Each variant says what the content *is*, never how it is set.
 *
 * `title`     a heading line for an entry with its supporting lines -- a job's position and
 *             the company/dates line beneath it. Split out from `lines` so a format with
 *             real emphasis can distinguish the two; the text file simply prints them.
 * `paragraphs` flowing prose, one paragraph per element, separated when rendered.
 * `lines`     short strings that are each their own line and never merge with a neighbour.
 * `bullets`   an unordered list.
 * `inline`    a single run of text that is a joined list rather than prose.
 */
export type Content =
  | { kind: "title"; title: string; subtitles: Array<string> }
  | { kind: "paragraphs"; paragraphs: Array<string> }
  | { kind: "lines"; lines: Array<string> }
  | { kind: "bullets"; bullets: Array<string> }
  | { kind: "inline"; text: string };

/**
 * A run of content under an optional label -- "Description:", "Highlights:", or the name of
 * a skill category.
 *
 * A block is only ever created when it has something in it, so a label never ends up
 * standing over nothing: 16 of the 35 work entries carry no skills and get no
 * "Skills / Technologies:" block at all.
 */
export interface Block {
  label?: string;
  content: Content;
}

/**
 * An entry, optionally naming itself.
 *
 * `heading` is a sub-heading over the entry -- the name of a skill category, which comes
 * from the `skillCategories` taxonomy rather than from the entry's own fields. It is
 * deliberately distinct from a `Block.label`, which is a caption on one run of content
 * inside an entry ("Description:", "Highlights:"), and from a `title` content, which is a
 * field of the entry itself (a job's position). A format with a heading hierarchy needs all
 * three kept apart; one that has only line breaks can flatten them.
 */
export interface Entry {
  heading?: string;
  blocks: Array<Block>;
}

/**
 * Section identity, so a transformer can make a format decision that applies to one section
 * without the content tree having to carry formatting.
 *
 * The plain-text file uses these to know that the contact block takes no heading, that work
 * entries are separated more widely than education entries, and that a skill category's
 * list is indented under its name. Those are all decisions about how it looks, which is why
 * they are made there and not here.
 */
export type SectionId =
  | "contact"
  | "summary"
  | "expertise"
  | "accomplishments"
  | "skills"
  | "experience"
  | "testimonials"
  | "approach"
  | "location"
  | "education"
  | "publications";

/**
 * `heading` is stored as written and upper-cased by the transformers, which is the
 * convention both documents happen to share.
 */
export interface Section {
  id: SectionId;
  heading: string;
  entries: Array<Entry>;
}

export interface ResumeContent {
  sections: Array<Section>;
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
 * Resolves `resume.json` into the sections, entries and labelled blocks that both published
 * documents are made of.
 *
 * `warnings` is passed in rather than returned so that a transformer's own findings -- a
 * character the plain-text file cannot spell, a line it could not wrap -- land in the same
 * deduplicated list as the content findings and are reported together.
 */
export function buildResumeContent(
  resume: Record<string, any>,
  normalize: Normalizer,
  warnings: Warnings,
): ResumeContent {
  const clean = (value: unknown): string => normalize(value, warnings);

  const sections: Array<Section> = [];
  const basics = resume.basics ?? {};
  const location = basics.location ?? {};

  /**
   * Contact block. No heading -- the name at the top of the document is the heading, and a
   * resume that opens with the word "CONTACT" reads as a form rather than as a document.
   */
  const subtitles: Array<string> = [];
  const push = (value: string): void => {
    if (value !== "") subtitles.push(value);
  };

  push(clean(basics.label));

  const place = [location.city, location.region, location.countryName]
    .map((part) => clean(part))
    .filter((part) => part !== "");
  if (place.length > 0) subtitles.push(place.join(", "));

  push(clean(basics.website));

  const profiles: Array<Record<string, any>> = Array.isArray(basics.profiles) ? basics.profiles : [];
  for (const network of CONTACT_NETWORKS) {
    const profile = profiles.find((entry) => entry.network === network);
    push(clean(profile?.url));
  }

  sections.push({
    id: "contact",
    heading: "",
    entries: [{ blocks: [{ content: { kind: "title", title: clean(basics.name), subtitles } }] }],
  });

  const paragraphs: Array<string> = [];
  for (const key of SUMMARY_KEYS) {
    const paragraph = clean(basics[key]);
    if (paragraph === "") {
      warnings.add(`basics.${key} is missing or empty; omitted from PROFESSIONAL SUMMARY`);
      continue;
    }
    paragraphs.push(paragraph);
  }
  sections.push({
    id: "summary",
    heading: "Professional Summary",
    entries: [{ blocks: [{ content: { kind: "paragraphs", paragraphs } }] }],
  });

  /**
   * Kept in array order and never sorted. The order in `resume.json` is deliberate
   * positioning -- what the resume leads with -- and re-sorting would throw away the only
   * thing the array says beyond its contents.
   *
   * One entry per line, single column. The page sets these in two columns and neither
   * document does: an ATS parser reading two entries on one line is liable to take them for
   * a single token.
   *
   * The section is omitted entirely -- heading included -- when there is nothing to put in
   * it, so a missing or empty array cannot leave a heading standing over nothing.
   */
  const expertise: Array<unknown> = Array.isArray(resume.areasOfExpertise) ? resume.areasOfExpertise : [];
  const areas = expertise.map((area) => clean(area)).filter((area) => area !== "");

  if (areas.length > 0) {
    sections.push({
      id: "expertise",
      heading: "Areas of Expertise",
      entries: [{ blocks: [{ content: { kind: "lines", lines: areas } }] }],
    });
  }

  /**
   * Every accomplishment, not the short list. `showOnShort` selects what the page's
   * condensed view shows and has no bearing on a full resume.
   */
  const accomplishments: Array<Record<string, any>> = Array.isArray(resume.accomplishments) ? resume.accomplishments : [];
  const achieved = accomplishments.map((entry) => clean(entry.text)).filter((text) => text !== "");
  sections.push({
    id: "accomplishments",
    heading: "Selected Accomplishments",
    entries: [{ blocks: [{ content: { kind: "bullets", bullets: achieved } }] }],
  });

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

  const named = skills.filter((skill) => typeof skill.name === "string" && skill.name.trim() !== "");
  const placed = new Set<Record<string, any>>();
  const grouped: Array<Entry> = [];

  const addCategory = (heading: string, members: Array<Record<string, any>>): void => {
    if (members.length === 0) return;
    const sorted = [...members].sort(
      (a, b) => priorityOf(a) - priorityOf(b) || String(a.name).localeCompare(String(b.name)),
    );
    grouped.push({
      heading,
      blocks: [{ content: { kind: "inline", text: sorted.map((skill) => clean(skill.name)).join(", ") } }],
    });
  };

  for (const category of categories) {
    const members = named.filter((skill) => Array.isArray(skill.categories) && skill.categories.includes(category));
    members.forEach((skill) => placed.add(skill));
    addCategory(clean(category), members);
  }

  /**
   * A skill whose categories are all absent from `skillCategories` would otherwise vanish
   * from a document that is supposed to list every one of them. There are none today; this
   * keeps that from becoming a silent omission if the two arrays ever drift apart.
   */
  const orphans = named.filter((skill) => !placed.has(skill));
  if (orphans.length > 0) {
    warnings.add(
      `${orphans.length} skill(s) have no category listed in skillCategories and were grouped under OTHER: ${orphans
        .map((skill) => String(skill.name))
        .join(", ")}`,
    );
    addCategory("Other", orphans);
  }

  sections.push({ id: "skills", heading: "Skills and Technologies", entries: grouped });

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

  const skillIndex = indexSkills(named);

  /**
   * References that matched only after lower-casing. Collected and reported once at the
   * end rather than one warning apiece, because they are all the same finding -- casing in
   * the work entries has drifted from casing in `skills[]` -- and 17 near-identical lines
   * would bury the warnings that are about something else.
   */
  const casingVariants = new Set<string>();
  const jobs: Array<Entry> = [];

  for (const { entry, index } of chronological) {
    const blocks: Array<Block> = [];

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
    const supporting = [`${company} | ${start} - ${end}`];
    const website = clean(entry.website);
    if (website !== "") supporting.push(website);
    blocks.push({ content: { kind: "title", title: position, subtitles: supporting } });

    const summary = clean(entry.summary);
    if (summary !== "") blocks.push({ label: "Description:", content: { kind: "paragraphs", paragraphs: [summary] } });

    const highlights: Array<string> = Array.isArray(entry.highlights) ? entry.highlights : [];
    const bullets = highlights.map((highlight) => clean(highlight)).filter((text) => text !== "");
    if (bullets.length > 0) blocks.push({ label: "Highlights:", content: { kind: "bullets", bullets } });

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
      blocks.push({
        label: "Skills / Technologies:",
        content: { kind: "inline", text: technologies.map((technology) => technology.text).join(", ") },
      });
    }

    jobs.push({ blocks });
  }

  sections.push({ id: "experience", heading: "Professional Experience", entries: jobs });

  if (casingVariants.size > 0) {
    warnings.add(
      `${casingVariants.size} skill reference(s) in work[] match skills[] only when case is ignored: ${[...casingVariants].join(", ")}`,
    );
  }

  /**
   * Endorsements, placed after the work history so the reader meets the evidence before the
   * testimony to it.
   *
   * Headed TESTIMONIALS rather than REFERENCES. "References" promises contact details to be
   * supplied on request, which is not what these are: they are statements already given, in
   * full, by named people who can be found at the URL under each one.
   *
   * Each is quoted text followed by one attribution line. The quotation marks are added here
   * rather than by each transformer because marking words as someone else's is a fact about
   * the content that both documents have to state, not a typographic choice either of them
   * gets to make differently.
   *
   * The company is bracketed rather than joined with a comma. `references[1]` gives a title
   * ending "at Ivanhoé Cambridge" alongside a company of "PSP Investments" -- two different
   * firms, the second being where the work with Doug happened -- and a plain comma list
   * would read as a mistake rather than as two true things.
   */
  const references: Array<Record<string, any>> = Array.isArray(resume.references) ? resume.references : [];
  const testimonials: Array<Entry> = [];

  for (const [index, reference] of references.entries()) {
    const quote = clean(reference.reference);
    if (quote === "") {
      warnings.add(`references[${index}] has no reference text; omitted from TESTIMONIALS`);
      continue;
    }

    const name = clean(reference.name);
    if (name === "") warnings.add(`references[${index}] has no name; its testimonial is unattributed`);

    const who = [name, clean(reference.title)].filter((part) => part !== "").join(", ");
    const company = clean(reference.company);
    const attribution = who === "" ? company : company === "" ? who : `${who} (${company})`;

    const website = clean(reference.website);
    testimonials.push({
      blocks: [
        { content: { kind: "paragraphs", paragraphs: [`"${quote}"`] } },
        { content: { kind: "title", title: attribution, subtitles: website === "" ? [] : [website] } },
      ],
    });
  }

  sections.push({ id: "testimonials", heading: "Testimonials", entries: testimonials });

  /**
   * The `qualities` array, in the order it is written and never sorted -- the order is what
   * Doug leads with, and re-sorting would discard the only thing the array says beyond its
   * contents.
   *
   * Headed PROFESSIONAL APPROACH. The page calls this "Me? Really?", which works there
   * because the site has established a tone by the time a reader reaches it; a document
   * opened cold by a recruiter has established nothing, and the joke lands as a misfile.
   */
  const qualities: Array<unknown> = Array.isArray(resume.qualities) ? resume.qualities : [];
  const approach = qualities.map((quality) => clean(quality)).filter((quality) => quality !== "");

  sections.push({
    id: "approach",
    heading: "Professional Approach",
    entries: [{ blocks: [{ content: { kind: "bullets", bullets: approach } }] }],
  });

  /**
   * `summary4` is the travel paragraph, and it is deliberately not in `SUMMARY_KEYS`:
   * that list is the introduction's share of the numbered paragraphs, and the page puts
   * this one in a travel section of its own rather than in the introduction. Neither
   * document has a travel section, so it opens this one instead, where it sets the scene
   * for the two facts that follow.
   */
  const about: Array<Block> = [];

  const travel = clean(basics.summary4);
  if (travel === "") {
    warnings.add("basics.summary4 is missing or empty; omitted from LOCATION, LANGUAGES & CITIZENSHIP");
  } else {
    about.push({ content: { kind: "paragraphs", paragraphs: [travel] } });
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

  /**
   * "Languages:" and "Citizenship:" are written into the sentence rather than made block
   * labels. They read as the opening words of a one-line statement, not as headings over a
   * body, and a document that promoted them would be saying something the text file does
   * not.
   */
  if (spoken.length > 0) {
    about.push({ content: { kind: "paragraphs", paragraphs: [`Languages: ${spoken.join(", ")}`] } });
  }

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
  if (countries.length > 0) {
    about.push({ content: { kind: "paragraphs", paragraphs: [`Citizenship: ${countries.join(", ")}`] } });
  }

  sections.push({
    id: "location",
    heading: "Location, Languages & Citizenship",
    entries: [{ blocks: about }],
  });

  /**
   * Every education entry, in file order and without deduplication. Two of them are Duke,
   * 1977-1980: those are two master's degrees earned simultaneously in different subjects,
   * not one record entered twice, and collapsing them would erase a degree.
   */
  const education: Array<Record<string, any>> = Array.isArray(resume.education) ? resume.education : [];
  sections.push({
    id: "education",
    heading: "Education",
    entries: education.map((entry) => {
      const degree = [clean(entry.studyType), clean(entry.area)].filter((part) => part !== "").join(", ");
      const years = [clean(entry.startDate), clean(entry.endDate)].filter((part) => part !== "").join("-");
      const detail = [degree, years].filter((part) => part !== "").join(" | ");
      return {
        blocks: [
          {
            content: {
              kind: "title" as const,
              title: clean(entry.institution),
              subtitles: detail === "" ? [] : [detail],
            },
          },
        ],
      };
    }),
  });

  const publications: Array<Record<string, any>> = Array.isArray(resume.publications) ? resume.publications : [];
  sections.push({
    id: "publications",
    heading: "Publications",
    entries: publications.map((entry) => {
      const credits = [clean(entry.authors), clean(entry.publisher)].filter((part) => part !== "");
      return {
        blocks: [{ content: { kind: "title" as const, title: clean(entry.name), subtitles: credits } }],
      };
    }),
  });

  return { sections };
}
