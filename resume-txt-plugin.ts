import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { Plugin } from "vite";

import {
  type Block,
  buildResumeContent,
  type Content,
  createWarnings,
  type Entry,
  plainText,
  type SectionId,
  type Warnings,
} from "./resume-content";

/**
 * Derives a plain-text resume from `src/static/resume.json`.
 *
 * The audience is anything that wants the resume as prose rather than as a document: a
 * paste into an application form, a `curl`, a reader that will not run JavaScript. The
 * page, the JSON-LD block and the Word file already serve their own audiences from the same
 * source.
 *
 * What the resume *says* -- which sections exist and in what order, which fields feed each
 * one, how a work entry is broken up -- lives in `resume-content.ts` and is shared with the
 * Word transformer, so a correction reaches both. What is left here is this format and only
 * this format: an 80-column budget, blank lines for structure, "- " typed as a literal
 * character, and everything folded to ASCII.
 *
 * `resume.json` is the only source of truth and is never modified here. The file is
 * regenerated on every build and lives in `src/static` because the FTP script uploads from
 * there -- it is build output, never authored by hand, and editing it achieves nothing.
 */
const RESUME_PATH = "src/static/resume.json";

const OUTPUT_PATH = "src/static/resume.txt";

/**
 * Hard wrap column. 78 leaves a plain-text file readable in an 80-column terminal and in
 * the quoted body of an email without a second layer of wrapping.
 */
const WRAP_WIDTH = 78;

/**
 * Typography in `resume.json` that has no ASCII character but does have an ASCII reading.
 *
 * `resume.json` keeps its em-dashes and curly quotes because the page renders them
 * correctly; this map is how the plain-text format renders them, and it is deliberately not
 * shared -- the Word file is UTF-8 and keeps the typography as authored, because folding
 * "Renc" out of "Renç" misspells a name in a document a human reads. Only a pure-ASCII byte
 * stream has to make this trade.
 *
 * The em-dash becomes a spaced hyphen rather than a bare one so that "Architect - Human
 * Lens" still reads as a break rather than as a hyphenated word; the surrounding whitespace
 * is collapsed afterwards, so an em-dash that already had spaces around it does not end up
 * with two.
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
 * Renders one source field as plain ASCII: the shared normalization -- links spelled out,
 * tags out, entities decoded, whitespace collapsed -- and then this format's own folding.
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
function toAscii(value: unknown, warnings: Warnings): string {
  if (typeof value !== "string") return "";

  let text = plainText(value);

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
 * Wraps `text` with its continuation lines indented two columns under the first, optionally
 * behind a marker.
 *
 * The indent is what makes a wrapped line read as a continuation rather than as a new
 * paragraph. Without it a long `Skills / Technologies:` list looks like loose prose from its
 * second line on, which is how the skill categories are set for the same reason.
 */
function hangingIndent(text: string, marker = ""): Array<string> {
  const lines = wrap(text, "", WRAP_WIDTH - 2);
  return lines.map((line, index) => (index === 0 ? `${marker}${line}` : `  ${line}`));
}

/**
 * A bullet with a hanging indent, so continuation lines sit under the text rather than
 * under the marker.
 */
function bullet(text: string): Array<string> {
  return hangingIndent(text, "- ");
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

/**
 * A block as lines. The label, when there is one, takes a line of its own and the content
 * follows underneath.
 *
 * Only the skill categories indent their list under the label. That is what tells a reader
 * scanning the section that a run of comma-separated names belongs to the category above it
 * rather than being a new one; a work entry's `Skills / Technologies:` list has no such
 * ambiguity, because the label is on the line directly above and nothing follows it.
 */
function renderBlock(block: Block, section: SectionId): Array<string> {
  const lines: Array<string> = [];
  if (block.label !== undefined) lines.push(block.label);

  const content: Content = block.content;
  switch (content.kind) {
    case "title":
      lines.push(...wrap(content.title));
      for (const subtitle of content.subtitles) lines.push(...wrap(subtitle));
      break;
    case "paragraphs":
      for (const [index, paragraph] of content.paragraphs.entries()) {
        if (index > 0) lines.push("");
        lines.push(...wrap(paragraph));
      }
      break;
    case "lines":
      for (const line of content.lines) lines.push(...wrap(line));
      break;
    case "bullets":
      for (const item of content.bullets) lines.push(...bullet(item));
      break;
    case "inline":
      lines.push(...wrap(content.text, section === "skills" ? "  " : ""));
      break;
  }

  return lines;
}

/**
 * An entry as lines, its blocks separated by one blank line each.
 */
function renderEntry(entry: Entry, section: SectionId): Array<string> {
  const lines: Array<string> = [];

  for (const block of entry.blocks) {
    const rendered = renderBlock(block, section);
    if (rendered.length === 0) continue;
    if (lines.length > 0) lines.push("");
    lines.push(...rendered);
  }

  return lines;
}

export function buildResumeText(resume: Record<string, any>): { text: string; warnings: Array<string> } {
  const warnings = createWarnings();
  const { sections } = buildResumeContent(resume, toAscii, warnings);

  const doc = new Document();

  for (const section of sections) {
    /**
     * The contact block opens the file and takes no heading; every other section is
     * introduced by its own, upper-cased.
     */
    if (section.id !== "contact") doc.section(section.heading);

    for (const [ordinal, entry] of section.entries.entries()) {
      /**
       * Two blank lines between work entries, so the gap between one job and the next is
       * wider than the gaps between the labelled blocks inside them. The first entry takes
       * one, which is what the section heading has already left behind it. Everywhere else
       * an entry is a couple of lines and one blank is enough.
       */
      doc.block(renderEntry(entry, section.id), section.id === "experience" && ordinal > 0 ? 2 : 1);
    }
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
