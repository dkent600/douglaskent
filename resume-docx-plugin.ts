import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  type IParagraphOptions,
  Packer,
  Paragraph,
  TextRun,
  UnderlineType,
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
 * A relationship id where it is written: the `Id` on a `Relationship` in a relationship
 * part, and the `r:id` on a `w:hyperlink` in the document. Matched with its quotes so an id
 * appearing in ordinary text cannot be rewritten as though it were markup.
 */
const relationships = (): RegExp => new RegExp('<Relationship[^>]*Id="([^"]+)"[^>]*Type="([^"]+)"[^>]*>', "g");
const relationshipIds = (): RegExp => new RegExp('(r:id="|Id=")([^"]+)(")', "g");

/**
 * Replaces the random relationship ids `docx` gives external hyperlinks with numbered ones.
 *
 * `docx` names each hyperlink relationship with a nanoid, so the links in this document
 * produce a fresh set of random ids on every build and two builds of unchanged input differ
 * in two parts. The ids are internal plumbing -- nothing outside the package refers to them
 * and Word only requires that the two ends agree -- so numbering them in order of first
 * appearance in the document is both stable and valid.
 *
 * Which ids to rewrite is taken from the relationship *types* rather than from the shape of
 * the id. A nanoid has no reliable shape: it is 21 characters from an alphabet that includes
 * digits, so it can neither be recognised by a prefix nor told apart from the `rId1`..`rId6`
 * that `docx` assigns to the fixed parts. The type is unambiguous.
 */
function renumberLinks(documentXml: string, relsXml: string): { document: string; rels: string } {
  const links = new Set<string>();
  const types = relationships();
  let relationship: RegExpExecArray | null;
  while ((relationship = types.exec(relsXml)) !== null) {
    if (relationship[2].endsWith("/hyperlink")) links.add(relationship[1]);
  }

  const stable = new Map<string, string>();
  const scan = relationshipIds();
  let reference: RegExpExecArray | null;
  while ((reference = scan.exec(documentXml)) !== null) {
    const id = reference[2];
    if (links.has(id) && !stable.has(id)) stable.set(id, `rIdLink${stable.size + 1}`);
  }

  const rewrite = (xml: string): string =>
    xml.replace(relationshipIds(), (whole, open: string, id: string, close: string) => {
      const renamed = stable.get(id);
      return renamed === undefined ? whole : `${open}${renamed}${close}`;
    });

  return { document: rewrite(documentXml), rels: rewrite(relsXml) };
}

/**
 * Makes the package reproducible: the same input builds the same bytes.
 *
 * Three things in a `.docx` otherwise carry the moment of the build. `docx` stamps
 * `dcterms:created` and `dcterms:modified` with `new Date()` and offers no way to pass a
 * date in; every entry in the zip carries its own modification time; and every external
 * hyperlink gets a randomly generated relationship id. All three are rewritten here, which
 * means the file only changes when the resume changes -- `resume.txt` already behaves that
 * way, and a build artifact that is committed should not show up as modified every time the
 * build runs.
 *
 * It also makes the metadata truthful: the date Word shows for this document is the date the
 * resume was last edited, which is the date a reader would mean by it, rather than the date
 * the site was last deployed.
 *
 * The mtime is the honest source available. Note that git does not preserve mtimes, so a
 * fresh clone dates the document from its checkout until `resume.json` is next edited; the
 * reproducibility that matters here is within a working tree, which is where the churn was.
 */
async function normalizePackage(file: Buffer, when: Date): Promise<Buffer> {
  const zip = await JSZip.loadAsync(file);

  const read = async (path: string): Promise<string> => {
    const part = zip.file(path);
    if (part === null) throw new Error(`resume-docx: packed file has no ${path}`);
    return part.async("string");
  };

  const iso = when.toISOString();
  const core = (await read("docProps/core.xml")).replace(TIMESTAMPS, (_match, open: string, close: string) => `${open}${iso}${close}`);
  zip.file("docProps/core.xml", core);

  const { document, rels } = renumberLinks(await read("word/document.xml"), await read("word/_rels/document.xml.rels"));
  zip.file("word/document.xml", document);
  zip.file("word/_rels/document.xml.rels", rels);

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

const isUrl = (text: string): boolean => text.startsWith("https://") || text.startsWith("http://");

/**
 * A supporting line under an entry's heading, clickable when it is a URL.
 *
 * The visible text stays the whole URL rather than becoming link text. Two reasons, and the
 * second is the load-bearing one: a parser that takes the plain text out of this document
 * gets a working address either way only if the address is what is written, and the
 * round-trip check against `resume.txt` compares the two documents word for word -- link
 * text saying "Portfolio" where the text file says "https://..." would be a real content
 * difference, not a formatting one.
 *
 * Only these whole-line URLs become links. A URL that `renderAnchors` has spliced into the
 * middle of a sentence is left as text, because splitting prose into runs to find them buys
 * a click and risks the extraction that everything else here is verified against.
 */
const supporting = (text: string, options: IParagraphOptions = {}): Paragraph =>
  new Paragraph({
    spacing: { after: SPACE.afterBody },
    ...options,
    children: isUrl(text)
      ? [new ExternalHyperlink({ children: [new TextRun({ text, style: "Hyperlink" })], link: text })]
      : [new TextRun(text)],
  });

/**
 * A block as paragraphs. The caption, when there is one, comes first.
 *
 * `keepNext` on a caption stops Word stranding "Highlights:" alone at the foot of a page
 * with its list on the next one.
 */
function renderBlock(block: Block, section: Section, lastInEntry: boolean): Array<Paragraph> {
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
     * candidate name looks there first.
     *
     * A job's position takes `Heading2`. It is the heading of its entry, and setting it bold
     * instead would be exactly the faked heading this file refuses to write elsewhere. The
     * level is 2 rather than 3 because a work entry and a skill category are both direct
     * children of a `Heading1` section and sit at the same depth. The payoff is that all 35
     * roles become a clickable outline in Word's Navigation Pane, which is what makes a
     * document this long usable at all, and a style-named heading above a company and a date
     * range is a stronger entry boundary for a parser than bold text is.
     *
     * The spacing is set on the paragraph rather than left to the style, so promoting these
     * changes what they mean without changing where they sit.
     *
     * Institutions and publication names stay bold, and that is not an inconsistency with
     * the above. A heading heads something. A section heads its entries; a position heads
     * the description, highlights and skills beneath it. An education entry and a
     * publication are leaf content -- there is nothing under them for a heading to head, and
     * a heading over nothing is the same lie as bold text pretending to be a heading, told
     * in the other direction.
     *
     * Promoting them would also cost twice over. An ATS that reads `Heading2` as the
     * boundary of an employment entry would find 13 publications and 4 degrees shaped
     * exactly like jobs, which is a worse parse than bold runs give it. And 17 more lines
     * would go into the navigation outline, which is the feature this whole arrangement
     * exists to deliver and which is already carrying 35 children under one section.
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
      } else if (section.id === "experience") {
        paragraphs.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            keepNext: true,
            keepLines: true,
            spacing: { before: SPACE.beforeEntry, after: SPACE.afterTight },
            children: [new TextRun(content.title)],
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
      /**
       * Every supporting line is held to the one after it, so a heading cannot be stranded
       * at the foot of a page with its company and dates overleaf -- except the last line of
       * the last block in an entry, which has nothing of its own to hold and would otherwise
       * drag the following entry's heading onto the next page with it.
       */
      for (const [index, subtitle] of content.subtitles.entries()) {
        const closesEntry = lastInEntry && index === content.subtitles.length - 1;
        paragraphs.push(supporting(subtitle, { keepNext: !closesEntry, spacing: { after: SPACE.afterTight } }));
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

  for (const [index, block] of entry.blocks.entries()) {
    paragraphs.push(...renderBlock(block, section, index === entry.blocks.length - 1));
  }

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
        /**
         * `outlineLevel` is stated rather than left to be inferred. It is the property the
         * Navigation Pane and the Office Online document map actually read, and `docx`
         * writes no `w:outlineLvl` into the style definitions it generates. Word does supply
         * one for a style whose id is a built-in heading name, so the outline would probably
         * appear anyway -- but "probably, by inheritance" is a poor foundation for the one
         * feature that makes a 17-page document navigable, and saying it costs a line.
         */
        heading1: {
          run: { font: FONT, size: HEADING_SIZE, bold: true, color: "000000" },
          paragraph: { outlineLevel: 0, spacing: { before: SPACE.beforeSection, after: SPACE.afterSection } },
        },
        heading2: {
          run: { font: FONT, size: BODY_SIZE, bold: true, color: "000000" },
          paragraph: { outlineLevel: 1, spacing: { before: SPACE.beforeCategory, after: SPACE.afterCategory } },
        },
        /**
         * Defined rather than left to Word's default so the one font holds here too. Blue
         * and underlined is what a link looks like, and the only place in the document with
         * a colour -- a link that renders as ordinary black text is a link nobody clicks.
         */
        hyperlink: {
          run: { font: FONT, size: BODY_SIZE, color: "0563C1", underline: { type: UnderlineType.SINGLE } },
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

  return { file: await normalizePackage(await Packer.toBuffer(document), when), warnings: warnings.list };
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

      /**
       * A `.docx` differs from this project's other build outputs in one way that matters
       * here: it is a file Doug opens. Word takes an exclusive lock on a document it has
       * open, so a resume left open in a window makes this write fail -- and failing the
       * write fails the whole build, taking the site down with it over a file the build did
       * not need to change.
       *
       * The lock is therefore reported rather than thrown. Nothing is lost: the previous
       * `resume.docx` is still on disk and still correct for the last `resume.json` it was
       * built from, and the next build with Word closed refreshes it. Only the lock codes
       * are caught; a genuine failure to write -- a full disk, a missing directory, a
       * permission problem that is not a lock -- still stops the build, because that is a
       * broken build rather than an open window.
       *
       * `EPERM` is here alongside `EBUSY` because Windows reports a locked file as either,
       * depending on which program holds it and how.
       */
      let locked: string | undefined;
      try {
        await writeFile(resolve(process.cwd(), OUTPUT_PATH), file);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "EBUSY" && code !== "EPERM") throw error;
        locked = code;
      }

      /**
       * Reported, not repaired. The output is rendered correctly regardless; these say
       * what in `resume.json` produced it, so the source can be fixed at the source.
       */
      for (const warning of warnings) {
        this.warn(`resume-docx: ${warning}`);
      }

      /**
       * Last, so it is the line closest to the build summary rather than one buried above
       * the content warnings.
       */
      if (locked !== undefined) {
        this.warn(
          `resume-docx: ${OUTPUT_PATH} is locked by another program (${locked}), most likely open in Word. ` +
            `It was NOT rewritten and is now stale; close it and build again.`,
        );
      }
    },
  };
}
