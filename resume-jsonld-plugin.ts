import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { Plugin } from "vite";

/**
 * Derives a schema.org `Person` block from `src/static/resume.json` and injects it into
 * the `<head>` of `index.html`.
 *
 * This runs in `transformIndexHtml` rather than in the app because the audience is
 * crawlers. Aurelia boots after the document is served, so anything the app injects is
 * invisible to readers that do not execute JavaScript -- which is most of the AI crawlers
 * this is aimed at. The block has to be in the HTML as served.
 *
 * `resume.json` is the only source of truth. Nothing here is written to disk: the block is
 * regenerated on every build, so there is no generated artifact to drift or to commit.
 */
const RESUME_PATH = "src/static/resume.json";

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

const stripHtml = (value: string): string => value.replace(/<[^>]*>/g, "").trim();

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

  const skills: Array<Skill> = Array.isArray(resume.skills) ? resume.skills : [];
  /**
   * Sourced from `skills` only. Education deliberately feeds nothing here: a degree
   * subject is a different claim from a skill, and the schooling is already carried by
   * `alumniOf` and `hasCredential`.
   *
   * Selection is by `priority` alone. `hide` is deliberately not consulted: it governs
   * only the Skills section's category pills, and the work entries list those skills
   * regardless, so it is not a signal about the page as a whole.
   */
  const knowsAbout = [...skills]
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

  const jobTitle = typeof basics.label === "string" ? basics.label : undefined;

  const hasOccupation = jobTitle
    ? {
        "@type": "Occupation",
        name: jobTitle,
        occupationalCategory: OCCUPATION_CODE,
      }
    : undefined;

  return compact({
    "@context": "https://schema.org",
    "@type": "Person",
    name: basics.name,
    url: basics.website,
    jobTitle,
    description: typeof basics.summary1 === "string" ? stripHtml(basics.summary1) : undefined,
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
  return {
    name: "resume-jsonld",
    async transformIndexHtml() {
      const file = resolve(process.cwd(), RESUME_PATH);
      const resume = JSON.parse(await readFile(file, "utf8"));

      /**
       * `<` is escaped so a stray `</script>` anywhere in the resume text cannot close the
       * tag early. The escape is invisible to a JSON parser.
       */
      const json = JSON.stringify(buildPersonJsonLd(resume), null, 2).replaceAll("<", "\u003c");

      return [
        {
          tag: "script",
          attrs: { type: "application/ld+json" },
          children: json,
          injectTo: "head" as const,
        },
      ];
    },
  };
}
