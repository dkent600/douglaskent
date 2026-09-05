import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { Plugin } from "vite";

import { stripHtml } from "./resume-text";
import { SUMMARY_KEYS } from "./src/stores/resume-store";

/**
 * Derives a schema.org `Person` block from `src/static/resume.json` and injects it into
 * the `<head>` of `index.html`.
 *
 * This runs in `transformIndexHtml` rather than in the app because the audience is
 * crawlers. Aurelia boots after the document is served, so anything the app injects is
 * invisible to readers that do not execute JavaScript -- which is most of the AI crawlers
 * this is aimed at. The block has to be in the HTML as served.
 *
 * `resume.json` is the only source of truth. The block is regenerated on every build, both
 * into the page and, so it can be fetched on its own, into the file named by `OUTPUT_PATH`.
 * That file is build output that happens to live in `src/static` because the FTP script
 * uploads from there -- it is never authored by hand, and editing it achieves nothing.
 */
const RESUME_PATH = "src/static/resume.json";

/**
 * The same block written as a standalone file, so it can be deployed and fetched on its
 * own rather than only read out of the page. It sits beside `resume.json` because the FTP
 * script uploads from there; it is still generated, not authored, so it is regenerated on
 * every build and should never be hand-edited.
 */
const OUTPUT_PATH = "src/static/resume-json-ld.json";

/**
 * How many skills reach `knowsAbout`.
 *
 * All 156 would be noise -- an undifferentiated list of that length carries less weight
 * than a short one. The knob is a count rather than a priority threshold because the
 * priority scale is hand-maintained and irregular (1, 1.2, 1.2101, 200, 400), so no round
 * threshold means anything; a count stays meaningful if the numbering is ever reworked.
 */
const SKILL_LIMIT = 25;

/**
 * O*NET code for Software Developers.
 */
const OCCUPATION_CODE = "15-1252.00";

interface Profile {
  network?: string;
  url?: string;
}

interface Skill {
  name?: string;
  priority?: number | string;
}

interface Education {
  institution?: string;
  area?: string;
  studyType?: string;
}

interface Language {
  language?: string;
}

interface Citizenship {
  country?: string;
}

/**
 * Networks in `basics.profiles` that identify Doug somewhere else on the web.
 *
 * `sameAs` is the highest-value property on this page: several other people share the
 * name, and this is what tells a machine reader that the site, the LinkedIn profile and
 * the GitHub account are one entity. The mailto is not a profile, and the website entry is
 * already `url`, so neither belongs here.
 */
const SAME_AS_NETWORKS = new Set(["LinkedIn", "GitHub"]);

/**
 * `priority` is typed inconsistently in the file -- mostly numbers, but at least two
 * entries are strings ("1.8"). Coercing explicitly keeps the sort numeric; anything that
 * will not coerce sorts last rather than poisoning the comparison.
 */

const priorityOf = (skill: Skill): number => {
  const value = Number(skill.priority);
  return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value;
};

/**
 * Drops properties whose source field was absent or empty, so the block never carries an
 * empty string, an empty array or a null.
 */
function compact(source: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    result[key] = value;
  }
  return result;
}

export function buildPersonJsonLd(resume: Record<string, any>): Record<string, unknown> {
  const basics = resume.basics ?? {};
  const location = basics.location ?? {};

  /**
   * `knowsAbout` is defined as the subject areas a person knows about, and that is what
   * `areasOfExpertise` holds. The skill list never fit: "LLM Pipeline Architecture" is a
   * subject, "Claude Code for VS Code" is a product, and a property meant for the former
   * was being filled with the latter. The skills now appear under `hasOccupation.skills`,
   * which is the property that actually means them -- so the block carries both the
   * subject-level claim and the concrete keyword surface, and nothing is lost.
   *
   * Emitted in source order, unsorted and uncapped: the ordering of `areasOfExpertise` is
   * deliberate positioning rather than an artefact, so re-sorting it would discard the
   * one thing the list encodes.
   *
   * There is deliberately no fallback to `skills` when the field is missing. `compact`
   * then drops `knowsAbout` entirely, which is loud; quietly substituting the old source
   * would disguise the field having gone away.
   */
  const areas: Array<unknown> = Array.isArray(resume.areasOfExpertise) ? resume.areasOfExpertise : [];
  const knowsAbout = areas.filter((area): area is string => typeof area === "string" && area.trim() !== "");

  /**
   * The skill names, selected by `priority` alone. `hide` is deliberately not consulted:
   * it governs only the Skills section's category pills, and the work entries list those
   * skills regardless, so it is not a signal about the page as a whole.
   */
  const skills: Array<Skill> = Array.isArray(resume.skills) ? resume.skills : [];
  const topSkills = [...skills]
    .filter((skill) => typeof skill.name === "string" && skill.name.trim() !== "")
    .sort((a, b) => priorityOf(a) - priorityOf(b))
    .slice(0, SKILL_LIMIT)
    .map((skill) => skill.name as string);

  const profiles: Array<Profile> = Array.isArray(basics.profiles) ? basics.profiles : [];
  const sameAs = profiles
    .filter((profile) => profile.network !== undefined && SAME_AS_NETWORKS.has(profile.network))
    .map((profile) => profile.url)
    .filter((url): url is string => typeof url === "string" && url !== "");

  /**
   * `address` deliberately carries only country and region. This is a public page and the
   * street address and postal code in `basics.location` have no business on it.
   */
  const address = compact({
    "@type": "PostalAddress",
    addressCountry: location.countryCode,
    addressRegion: location.region,
  });

  const education: Array<Education> = Array.isArray(resume.education) ? resume.education : [];
  /**
   * Institution names only, so two degrees from one university collapse to one entry --
   * `alumniOf` lists institutions, and listing the same one twice says nothing. This is a
   * property of the name-only projection and is not a judgement about the underlying
   * `education` records, which are Doug's to reconcile.
   */
  const alumniOf = [
    ...new Set(
      education
        .map((entry) => entry.institution)
        .filter((name): name is string => typeof name === "string" && name.trim() !== ""),
    ),
  ].map((name) => ({ "@type": "CollegeOrUniversity", name }));

  /**
   * Each degree in its own right, which `alumniOf` cannot express: that property lists
   * institutions, so the two master's degrees Doug earned at Duke simultaneously collapse
   * into a single entry there. `hasCredential` is what keeps both of them visible.
   *
   * Every `education` entry is mapped, degree or not. What keeps a non-degree entry from
   * reading as a degree is `credentialCategory`, which carries `studyType` verbatim: the
   * UNC coursework is published as "Continuing Education", which is what it was. The
   * honesty of this property therefore rests on `studyType` being accurate in
   * `resume.json`, not on any filtering here.
   */
  const hasCredential = education
    .filter((entry) => typeof entry.institution === "string" && entry.institution.trim() !== "")
    .map((entry) =>
      compact({
        "@type": "EducationalOccupationalCredential",
        credentialCategory: entry.studyType,
        about: entry.area,
        recognizedBy: { "@type": "CollegeOrUniversity", name: entry.institution },
      }),
    );

  const languages: Array<Language> = Array.isArray(resume.languages) ? resume.languages : [];
  const knowsLanguage = languages
    .map((entry) => entry.language)
    .filter((name): name is string => typeof name === "string" && name.trim() !== "");

  const citizenship: Array<Citizenship> = Array.isArray(resume.citizenship) ? resume.citizenship : [];
  const nationality = citizenship
    .map((entry) => entry.country)
    .filter((name): name is string => typeof name === "string" && name.trim() !== "")
    .map((name) => ({ "@type": "Country", name }));

  /**
   * The same summary paragraphs the plain-text resume prints, joined into the single
   * string `description` is defined to be. One paragraph was too thin a claim for the
   * property that most machine readers quote back; three still fit comfortably inside what
   * a description is for.
   *
   * `stripHtml` and not the text file's ASCII folding: this is JSON, so the source's
   * em-dashes and curly quotes are carried through as they are written. Nothing in these
   * three keys contains markup today, but the strip costs nothing and keeps a future edit
   * to one of them from putting a tag into the block.
   */
  const description = SUMMARY_KEYS.map((key) => (typeof basics[key] === "string" ? stripHtml(basics[key]) : ""))
    .filter((paragraph) => paragraph !== "")
    .join(" ");

  const jobTitle = typeof basics.label === "string" ? basics.label : undefined;

  const hasOccupation = jobTitle
    ? compact({
        "@type": "Occupation",
        name: jobTitle,
        occupationalCategory: OCCUPATION_CODE,
        skills: topSkills,
      })
    : undefined;

  return compact({
    "@context": "https://schema.org",
    "@type": "Person",
    name: basics.name,
    url: basics.website,
    image: basics.picture,
    jobTitle,
    description,
    sameAs,
    address: Object.keys(address).length > 1 ? address : undefined,
    knowsLanguage,
    nationality,
    alumniOf,
    hasCredential,
    knowsAbout,
    hasOccupation,
  });
}

export function resumeJsonLd(): Plugin {
  const generate = async (): Promise<string> => {
    const resume = JSON.parse(await readFile(resolve(process.cwd(), RESUME_PATH), "utf8"));
    return JSON.stringify(buildPersonJsonLd(resume), null, 2);
  };

  return {
    name: "resume-jsonld",

    async transformIndexHtml() {
      /**
       * `<` is escaped so a stray `</script>` anywhere in the resume text cannot close
       * the tag early. The escape is invisible to a JSON parser, and it applies only to
       * this copy -- the standalone file is not embedded in HTML and needs no such guard.
       *
       * The backslash is doubled deliberately. A single one makes the replacement a
       * Unicode escape that JavaScript resolves back to `<` while parsing this file, so
       * the call becomes a silent no-op that still looks correct.
       */
      const json = (await generate()).replaceAll("<", "\\u003c");

      return [
        {
          tag: "script",
          attrs: { type: "application/ld+json" },
          children: json,
          injectTo: "head" as const,
        },
      ];
    },

    /**
     * Build only. `writeBundle` does not run under `vite dev`, so saving from the admin
     * editor does not rewrite a file in `src/static` on every keystroke.
     */
    async writeBundle() {
      await writeFile(resolve(process.cwd(), OUTPUT_PATH), `${await generate()}\n`, "utf8");
    },
  };
}
