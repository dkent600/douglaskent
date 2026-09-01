import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  AlignmentType,
  Document,
  HeadingLevel,
  type IParagraphOptions,
  Packer,
  Paragraph,
  TextRun,
  convertInchesToTwip,
} from "docx";
import JSZip from "jszip";
import type { Plugin } from "vite";

import {
  type Block,
  buildResumeContent,
  createWarnings,
  type Entry,
  type Normalizer,
  plainText,
  type Section,
} from "./resume-content";

/**
 * Derives a Word resume from `src/static/resume.json`.
 *
 * The audience is the one that asks for "your resume as a .docx" -- an application portal
 * that will only take a Word file, a recruiter who wants something to forward, and the
 * applicant tracking systems behind both. The plain-text file, the page and the JSON-LD
 * block serve their own audiences from the same source.
 *
 * What the resume *says* lives in `resume-content.ts` and is shared with the plain-text
 * transformer, so the two documents cannot drift. What is here is Word, and only Word.
 *
 * Every layout decision below is made for a parser rather than for a reader, because a
 * resume that a human likes and a parser mangles has failed before anyone reads it:
 *
 *   - No tables, no columns, no text boxes, no images, no graphics. Parsers read a table by
 *     guessing at its reading order and routinely guess wrong, and everything else in that
 *     list is either dropped or turned into an unlabelled blob.
 *   - Nothing in the header or the footer, page numbers included. Those parts are commonly
 *     discarded before the text is even looked at, so anything put there is thrown away.
 *   - One column, top to bottom, one logical flow.
 *   - Word's built-in `Heading1` and `Heading2` styles for the section headings and the
 *     skill categories. A parser keys on the style name, not on the fact that something
 *     looks big and bold, so a faked heading is invisible to it.
 *   - Real Word list formatting for the bullets, not a hyphen typed at the start of a line.
 *   - One font throughout.
 *
 * `resume.json` is the only source of truth and is never modified here. The file is
 * regenerated on every build and lives in `src/static` because the FTP script uploads from
 * there -- it is build output, never authored by hand, and editing it achieves nothing.
 */
const RESUME_PATH = "src/static/resume.json";

const OUTPUT_PATH = "src/static/resume.docx";

/**
 * Calibri at 11pt. Word's own default since 2007, so it is present on every machine that
 * will open this and needs no substitution; a substituted font is a re-flowed document.
 *
 * `docx` measures type in half-points.
 */
const FONT = "Calibri";
const BODY_SIZE = 22;
const HEADING_SIZE = 24;
const NAME_SIZE = 32;

/**
 * Three quarters of an inch on all four sides. Inside the range every printer can manage,
 * and wide enough that no parser mistakes the text for a margin note.
 */
const MARGIN = convertInchesToTwip(0.75);

/**
 * Vertical rhythm, in twentieths of a point.
 *
 * Spacing is set as paragraph properties rather than by leaving empty paragraphs between
 * things. An empty paragraph is a paragraph, and a parser that is counting them to work out
 * where one job ends and the next begins is misled by every one of them.
 */
const SPACE = {
  afterBody: 100,
  afterTight: 0,
  afterBullet: 60,
  beforeSection: 320,
  afterSection: 140,
  beforeCategory: 180,
  afterCategory: 60,
  beforeEntry: 260,
  beforeLabel: 140,
  afterLabel: 40,
};

/**
 * The Word file keeps the typography as `resume.json` authors it.
 *
 * This is the one place the two documents disagree, and deliberately. The plain-text file
 * folds everything to ASCII because it has no alternative -- it is a byte stream with no
 * encoding to declare. A `.docx` is UTF-8 XML inside a zip, Word reads it natively, and so
 * does anything else that can read the format at all. Folding here would buy nothing and
 * would cost the spelling of two proper nouns that do reach this document: "Curaçao" and
 * "Québec". Misspelling the country a project was for and the province a client operated in
 * is a worse failure than an em-dash a parser may not love.
 *
 * The shared normalization still applies: links are spelled out, tags come out, entities
 * are decoded and whitespace is collapsed. Those are not typography, they are the fact that
 * the fields are authored as HTML for the page and this is not a page.
 */
const toProse: Normalizer = (value) => (typeof value === "string" ? plainText(value) : "");

/**
 * The two `dcterms` timestamps in the core properties part, matched so their values can be
 * replaced without disturbing the attributes on the elements.
 *
 * Built from a string rather than written as a literal so the closing tags need no escaped
 * slashes, which is the sort of thing that survives a review only by accident.
 */
const TIMESTAMPS = new RegExp("(<dcterms:(?:created|modified)[^>]*>)[^<]*(</dcterms:(?:created|modified)>)", "g");

/**
 * Dates the package from `resume.json` rather than from the clock, so that building twice
 * without changing the source produces the same bytes.
 *
 * Two things in a `.docx` otherwise carry the moment of the build. `docx` stamps
 * `dcterms:created` and `dcterms:modified` with `new Date()` and offers no way to pass a
 * date in, and every entry in the zip carries its own modification time. Both are rewritten
 * here, which means the file only changes when the resume changes -- `resume.txt` already
 * behaves that way, and a build artifact that is committed should not show up as modified
 * every time the build runs.
 *
 * It also makes the metadata truthful: the date Word shows for this document is the date the
 * resume was last edited, which is the date a reader would mean by it, rather than the date
 * the site was last deployed.
 *
 * The mtime is the honest source available. Note that git does not preserve mtimes, so a
 * fresh clone dates the document from its checkout until `resume.json` is next edited; the
 * reproducibility that matters here is within a working tree, which is where the churn was.
 */
async function datePackage(file: Buffer, when: Date): Promise<Buffer> {
  const zip = await JSZip.loadAsync(file);

  const core = zip.file("docProps/core.xml");
  if (core === null) throw new Error("resume-docx: packed file has no docProps/core.xml to date");

  const iso = when.toISOString();
  const dated = (await core.async("string")).replace(TIMESTAMPS, (_match, open: string, close: string) => `${open}${iso}${close}`);
  zip.file("docProps/core.xml", dated);

  zip.forEach((_path, entry) => {
    entry.date = when;
  });

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } });
}

/**
 * A paragraph of ordinary body text.
 */
const body = (text: string, options: IParagraphOptions = {}): Paragraph =>
  new Paragraph({ spacing: { after: SPACE.afterBody }, ...options, children: [new TextRun(text)] });

/**
 * A paragraph whose whole content is bold -- an entry's own title, and the caption over a
 * labelled block.
 *
 * Bold is used here and nowhere near a heading. These are captions inside an entry, and a
 * caption is not a section: promoting "Description:" to a real heading style would tell a
 * parser that a new section of the resume had begun 35 times over.
 */
const strong = (text: string, options: IParagraphOptions = {}): Paragraph =>
  new Paragraph({
    spacing: { after: SPACE.afterBody },
    ...options,
    children: [new TextRun({ text, bold: true })],
  });

/**
 * A block as paragraphs. The caption, when there is one, comes first.
 *
 * `keepNext` on a caption stops Word stranding "Highlights:" alone at the foot of a page
 * with its list on the next one.
 */
function renderBlock(block: Block, section: Section): Array<Paragraph> {
  const paragraphs: Array<Paragraph> = [];

  if (block.label !== undefined) {
    paragraphs.push(
      strong(block.label, {
        keepNext: true,
        spacing: { before: SPACE.beforeLabel, after: SPACE.afterLabel },
      }),
    );
  }

  const content = block.content;
  switch (content.kind) {
    /**
     * The contact block's title is the name at the top of the document, which takes Word's
     * built-in `Title` style -- it is what that style is for, and a parser looking for a
     * candidate name looks there first. Everywhere else a title is an entry's own heading
     * line: a job's position, an institution, the name of a publication. Those are set bold
     * rather than as headings, because a resume with 35 `Heading2` job titles reads to a
     * parser as a document with 35 sections.
     */
    case "title":
      if (section.id === "contact") {
        paragraphs.push(
          new Paragraph({
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.LEFT,
            spacing: { after: SPACE.afterTight },
            children: [new TextRun({ text: content.title, bold: true, size: NAME_SIZE })],
          }),
        );
      } else {
        paragraphs.push(
          strong(content.title, {
            keepNext: true,
            spacing: { before: SPACE.beforeEntry, after: SPACE.afterTight },
          }),
        );
      }
      for (const subtitle of content.subtitles) {
        paragraphs.push(body(subtitle, { keepNext: true, spacing: { after: SPACE.afterTight } }));
      }
      break;

    case "paragraphs":
      for (const paragraph of content.paragraphs) paragraphs.push(body(paragraph));
      break;

    case "lines":
      for (const line of content.lines) paragraphs.push(body(line, { spacing: { after: SPACE.afterTight } }));
      break;

    /**
     * Real Word list formatting. `bullet` puts the paragraph in a numbering definition with
     * a bullet marker and a hanging indent, which is what Word itself produces and what a
     * parser recognises as a list; a "- " typed into the text is just a hyphen, and a
     * parser has to guess.
     */
    case "bullets":
      for (const item of content.bullets) {
        paragraphs.push(
          new Paragraph({
            bullet: { level: 0 },
            spacing: { after: SPACE.afterBullet },
            children: [new TextRun(item)],
          }),
        );
      }
      break;

    case "inline":
      paragraphs.push(body(content.text));
      break;
  }

  return paragraphs;
}

/**
 * An entry as paragraphs, opening with its sub-heading if it has one.
 *
 * A sub-heading here is a skill category, and it takes Word's built-in `Heading2` -- it is a
 * genuine subdivision of the section above it, which is exactly what the style means.
 */
function renderEntry(entry: Entry, section: Section): Array<Paragraph> {
  const paragraphs: Array<Paragraph> = [];

  if (entry.heading !== undefined) {
    paragraphs.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        keepNext: true,
        spacing: { before: SPACE.beforeCategory, after: SPACE.afterCategory },
        children: [new TextRun(entry.heading)],
      }),
    );
  }

  for (const block of entry.blocks) paragraphs.push(...renderBlock(block, section));

  return paragraphs;
}

export async function buildResumeDocx(
  resume: Record<string, any>,
  when: Date,
): Promise<{ file: Buffer; warnings: Array<string> }> {
  const warnings = createWarnings();
  const { sections } = buildResumeContent(resume, toProse, warnings);

  const children: Array<Paragraph> = [];

  for (const section of sections) {
    /**
     * The contact block opens the document and takes no heading -- the name is the heading.
     * Every other section is introduced by its own, upper-cased to match the plain-text
     * file, and set in Word's built-in `Heading1`.
     */
    if (section.id !== "contact") {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          keepNext: true,
          spacing: { before: SPACE.beforeSection, after: SPACE.afterSection },
          children: [new TextRun(section.heading.toUpperCase())],
        }),
      );
    }

    for (const entry of section.entries) children.push(...renderEntry(entry, section));
  }

  const basics = resume.basics ?? {};
  const name = toProse(basics.name, warnings);

  const document = new Document({
    creator: name,
    lastModifiedBy: name,
    title: `${name} - Resume`,
    description: toProse(basics.label, warnings),
    styles: {
      /**
       * One font throughout, including the heading styles.
       *
       * Word's built-in headings default to the theme's heading font in blue, which would
       * put a second typeface and a colour into a document that is supposed to have exactly
       * one of each. Overriding the styles rather than abandoning them keeps the style
       * names -- `Heading1`, `Heading2` -- which is the part a parser actually reads.
       */
      default: {
        document: {
          run: { font: FONT, size: BODY_SIZE, color: "000000" },
          paragraph: { spacing: { after: SPACE.afterBody, line: 264 } },
        },
        title: {
          run: { font: FONT, size: NAME_SIZE, bold: true, color: "000000" },
          paragraph: { spacing: { after: SPACE.afterTight } },
        },
        heading1: {
          run: { font: FONT, size: HEADING_SIZE, bold: true, color: "000000" },
          paragraph: { spacing: { before: SPACE.beforeSection, after: SPACE.afterSection } },
        },
        heading2: {
          run: { font: FONT, size: BODY_SIZE, bold: true, color: "000000" },
          paragraph: { spacing: { before: SPACE.beforeCategory, after: SPACE.afterCategory } },
        },
      },
    },
    sections: [
      {
        /**
         * One section, one column, and no `headers` or `footers` key at all -- not an empty
         * one. A header part that exists but is blank is still a header part, and the point
         * is that there is nothing there to be discarded.
         */
        properties: {
          page: { margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN } },
        },
        children,
      },
    ],
  });

  return { file: await datePackage(await Packer.toBuffer(document), when), warnings: warnings.list };
}

export function resumeDocx(): Plugin {
  return {
    name: "resume-docx",

    /**
     * Build only, matching `resume-txt` and `resume-jsonld`. `writeBundle` does not run
     * under `vite dev`, so saving from the admin editor does not rewrite a file in
     * `src/static` on every keystroke.
     */
    async writeBundle() {
      const source = resolve(process.cwd(), RESUME_PATH);
      const resume = JSON.parse(await readFile(source, "utf8"));
      const { file, warnings } = await buildResumeDocx(resume, (await stat(source)).mtime);
      await writeFile(resolve(process.cwd(), OUTPUT_PATH), file);

      /**
       * Reported, not repaired. The output is rendered correctly regardless; these say
       * what in `resume.json` produced it, so the source can be fixed at the source.
       */
      for (const warning of warnings) {
        this.warn(`resume-docx: ${warning}`);
      }
    },
  };
}
