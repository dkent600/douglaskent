import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { Plugin } from "vite";

import { isOpenEnded, plainText, resumeLastUpdated } from "./resume-content";
import { stripHtml } from "./resume-text";
import { SUMMARY_KEYS } from "./src/stores/resume-store";

/**
 * Derives a schema.org `@graph` from `src/static/resume.json` and injects it into the
 * `<head>` of `index.html`.
 *
 * The graph is a `ProfilePage` whose `mainEntity` is a `Person`, plus one node per employer
 * and one per personal project. Nodes carry `@id` and refer to each other by it, so an
 * employer named by two roles exists once, and a project can be a part of the page, owned by
 * the Person, and name that same Person as its author -- none of which an anonymous nested
 * object can express, because nothing can point at it.
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
 * O*NET code for Software Developers.
 */
const OCCUPATION_CODE = "15-1252.00";

/**
 * The `@id` values every reference in the graph is resolved against.
 *
 * Absolute, never bare fragments. The same block is served on four routes and again as a
 * standalone file at a fifth URL; a relative `#douglas-kent` resolves against whatever
 * document it is read from, so the five copies would describe five different people. The
 * origin matches `resume-head-plugin.ts`, which publishes the apex as canonical.
 *
 * These are identifiers, not addresses -- nothing needs to be fetchable at the fragment.
 * The Person and the page get constants; every other node is identified by a URL that is
 * already in `resume.json`, so no identifier is ever slugged, parsed or invented here.
 */
const SITE_ORIGIN = "https://www.douglaskent.com";
const PAGE_URL = `${SITE_ORIGIN}/`;
const PAGE_ID = `${SITE_ORIGIN}/#page`;
const PERSON_ID = `${SITE_ORIGIN}/#douglas-kent`;

interface Profile {
  network?: string;
  url?: string;
}

interface Education {
  institution?: string;
  area?: string;
  studyType?: string;
}

interface Work {
  company?: string;
  position?: string;
  summary?: string;
  website?: string;
  startDate?: string;
  endDate?: string;
  skills?: Array<string>;
  showOnShort?: boolean;
  personal?: boolean;
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
 * Escapes the block for embedding in a `<script>` element.
 *
 * `<` is escaped so a stray `</script` anywhere in the resume text cannot close the tag
 * early. Only that sequence can break out of the element -- `application/ld+json` is a data
 * block, not executable JavaScript -- so escaping `<` covers it, and U+2028/U+2029 and the
 * rest are deliberately left alone: `JSON.parse` handles them, and widening the escape set
 * without a reason is how a working normalizer acquires cases nobody can justify later.
 *
 * The escape is invisible to a JSON parser, so this changes the bytes without changing the
 * data. It applies only to the inlined copy; the standalone file is not embedded in HTML
 * and needs no such guard.
 *
 * The backslash is doubled deliberately. A single one makes the replacement a Unicode
 * escape that JavaScript resolves back to `<` while parsing this file, so the call becomes
 * a silent no-op that still looks correct.
 *
 * Exported so it can be tested. The real `resume.json` contains no `<` at all, which means
 * the inlined copy contains no `<` either and no assertion against real data can tell
 * a working escaper from a deleted one. The test drives this function with a synthetic
 * fixture instead -- see `check-jsonld.test.mjs`.
 */
export function escapeForScript(json: string): string {
  return json.replaceAll("<", "\\u003c");
}

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

/**
 * `warn` is optional so the function stays pure and callable outside a build -- the test
 * exercises it directly, and Vite's `this.warn` exists only inside a plugin hook. Omitting
 * it discards warnings rather than routing them somewhere nothing reads.
 */
export function buildPersonJsonLd(
  resume: Record<string, any>,
  warn?: (message: string) => void,
): Record<string, unknown> {
  const basics = resume.basics ?? {};
  const location = basics.location ?? {};

  /**
   * `knowsAbout` is defined as the subject areas a person knows about, and `areasOfExpertise`
   * is exactly that list. It has one home: this property and no other. It used to be repeated
   * under `hasOccupation.skills`, which asserted the same fourteen strings twice under two
   * names and told a reader nothing the first copy had not.
   *
   * The top-level `skills[]` array reaches neither property. It is 156 entries of mixed
   * altitude -- "LLM Pipeline Architecture" is a subject, "Claude Code for VS Code" is a
   * product -- and an undifferentiated list that long carries less weight than a short
   * curated one. What `Person.skills` publishes instead is the union of the *published work
   * entries'* own skill lists, which is both shorter and attributable: every name in it was
   * earned on a job or a project the graph also describes.
   *
   * Emitted in source order, unsorted and uncapped: the ordering of `areasOfExpertise` is
   * deliberate positioning rather than an artefact, so re-sorting it would discard the
   * one thing the list encodes.
   *
   * There is deliberately no fallback to `skills` when the field is missing. `compact`
   * then drops both properties, which is loud; quietly substituting the old source would
   * disguise the field having gone away.
   */
  const areas: Array<unknown> = Array.isArray(resume.areasOfExpertise) ? resume.areasOfExpertise : [];
  const knowsAbout = areas.filter((area): area is string => typeof area === "string" && area.trim() !== "");

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

  /**
   * The work history, which becomes two kinds of node.
   *
   * Employment is an `OrganizationRole` rather than a bare `Organization`: `worksFor` names
   * a *current* employer and has nowhere to put dates, so a plain list of organizations
   * would claim Doug works at all of them simultaneously. The `Role` wrapper is what schema
   * .org provides for exactly this -- the role, when it was held, and a reference to the
   * organization it was held at.
   *
   * The employment side is here for entity disambiguation. Several findable people share
   * this name, and an organization that already has a public identity is a strong
   * separating signal -- which is what the organization's URL carries, and why it doubles
   * as that node's `@id`.
   *
   * Ordered the way the resume documents order the same entries: start date descending,
   * source order breaking ties. The array in `resume.json` is the page's display grouping
   * -- professional work, then personal projects -- so it is not chronological and the
   * sort is required rather than cosmetic.
   */
  const work: Array<Work> = Array.isArray(resume.work) ? resume.work : [];

  /**
   * `showOnShort` selects what reaches the graph, and it is the page's own selector rather
   * than one invented here. The canonical URL is the apex, which renders the short history;
   * structured data that claimed thirty-five roles while the page it describes shows seven
   * would be describing a different document. `personal` then decides which kind of node an
   * entry becomes. The two branches are disjoint, so nothing is published twice.
   */
  const published = work
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.showOnShort === true)
    .sort((a, b) => {
      const left = String(a.entry.startDate ?? "");
      const right = String(b.entry.startDate ?? "");
      if (left === right) return a.index - b.index;
      return left < right ? 1 : -1;
    });

  const employment = published.filter(({ entry }) => entry.personal !== true);
  const projects = published.filter(({ entry }) => entry.personal === true);

  /**
   * Every published entry is identified by its own `website`, so an entry without one has
   * no identity and cannot be referenced. Emitting it anyway would put a node in the graph
   * that `worksFor` or `owns` points at with nothing to point to -- the dangling reference
   * this whole shape exists to prevent -- so the build stops instead. Both projects have
   * repositories today; this guards the day one without a repository is promoted.
   */
  for (const { entry, index } of published) {
    if (typeof entry.website !== "string" || entry.website.trim() === "") {
      throw new Error(
        `resume-jsonld: work[${index}] ("${entry.company ?? ""}") is showOnShort but has no website, so it has no @id`,
      );
    }
  }

  /**
   * Organizations are identified by `website` and nothing else, so two roles at one company
   * collapse to a single node only when the two URL strings match exactly. Both Microsoft
   * entries read `https://www.microsoft.com` today; adding a trailing slash to one of them
   * later would quietly split Microsoft into two organizations that no longer look like the
   * same employer. The name is the thing a reader would notice was wrong, so the name is
   * what the check keys on: one company name must resolve to exactly one URL.
   */
  const websitesByCompany = new Map<string, Set<string>>();
  for (const { entry } of employment) {
    const name = entry.company ?? "";
    const bucket = websitesByCompany.get(name) ?? new Set<string>();
    bucket.add(entry.website as string);
    websitesByCompany.set(name, bucket);
  }
  for (const [name, urls] of websitesByCompany) {
    if (urls.size > 1) {
      throw new Error(
        `resume-jsonld: "${name}" is published with ${urls.size} different website values ` +
          `(${[...urls].join(", ")}), so it would become that many separate organizations`,
      );
    }
  }

  /**
   * One node per distinct employer, in first-published order. Roles are never merged: two
   * Microsoft roles remain two `OrganizationRole` objects, both pointing at the one
   * Microsoft node. Collapsing them would invent a continuous tenure that did not happen.
   */
  const organizations = [...new Map(employment.map(({ entry }) => [entry.website as string, entry])).values()].map(
    (entry) =>
      compact({
        "@type": "Organization",
        "@id": entry.website,
        url: entry.website,
        name: entry.company,
      }),
  );

  /**
   * `description` goes on whichever node is Doug's. That is the rule, and the two branches
   * apply it to different nodes rather than disagreeing: for employment the description
   * belongs to the *role*, because the company is not his -- put on the `Organization` it
   * would assert that ShiftWise *is* "a lead role in an Agile Scrum environment". For a
   * project it belongs to the *software itself*, because the software is his, which is why
   * the applications below carry `description` on the node and not on their `author` Role.
   *
   * `summary` is normalized rather than passed through. These fields are authored as HTML
   * for the page -- one writes its project names in `<i>` and separates them with `&nbsp;`
   * -- and `description` is defined as text. `plainText` is the normalizer the plain-text
   * and Word documents run on the same fields, so all three agree on what the prose says.
   *
   * A role's own `skills` have nowhere to go, and this was checked against schema.org rather
   * than assumed: `keywords` is used on CreativeWork, Event, Organization, Place and Product;
   * `skills` on JobPosting, Occupation, Organization and Person. Neither lists `Role`. Both
   * are legal on `Organization`, but hanging a job's skill list there would assert they are
   * the *company's* specializations rather than Doug's, which is worse than omitting them.
   * An employment entry's skills therefore survive only inside the Person-level union below,
   * without attribution to the job that earned them. That is a limit of the vocabulary, not
   * a decision made here, and there is no property that would fix it -- please do not
   * re-open it looking for one.
   */
  const worksFor = employment.map(({ entry }) =>
    compact({
      "@type": "OrganizationRole",
      roleName: entry.position,
      description: typeof entry.summary === "string" ? plainText(entry.summary) : undefined,
      startDate: entry.startDate,
      /**
       * An open-ended entry gets no `endDate` at all. Emitting "present" would be a
       * malformed date, and emitting today's date would assert an end that has not
       * happened; absence is how schema.org says a role is still held.
       */
      endDate: isOpenEnded(entry.endDate) ? undefined : entry.endDate,
      worksFor: { "@id": entry.website },
    }),
  );

  /**
   * The personal projects, as software rather than as employment.
   *
   * `name` is `company`, the same mapping the employment branch uses, and that is a decision
   * with a known cost rather than a neutral mapping.
   *
   * The reason: `company` is the string a human reader sees on the resume site under each
   * personal entry, and the block should carry what the page shows. The cost Doug accepted
   * knowingly: `company` on these entries reads "Independent Software Developer", so both
   * `SoftwareApplication` nodes are named that, and the graph contains the words "Human Lens"
   * and "Butterfly" in no `name` at all -- only inside the `roleName` prose below. Two nodes
   * with one name are told apart solely by `@id` and `url`.
   *
   * The alternatives were putting the project name in `company` (which changes what the page,
   * `resume.txt` and the Word file display) and adding a `project` field (which changes the
   * resume schema). Both were considered and declined.
   *
   * `roleName` takes `position` whole and nothing splits it. That string carries two facts
   * at once -- "Technical Lead & LLM Pipeline Architect - Human Lens, AI-native web app" --
   * which is true of a role and would be false as the name of a piece of software. The Role
   * wrapper is what lets the dates travel with the authorship instead of attaching to the
   * software, which has no dates of its own here.
   */
  const applications = projects.map(({ entry }) =>
    compact({
      "@type": "SoftwareApplication",
      "@id": entry.website,
      url: entry.website,
      name: entry.company,
      description: typeof entry.summary === "string" ? plainText(entry.summary) : undefined,
      keywords: Array.isArray(entry.skills) ? entry.skills : undefined,
      author: compact({
        "@type": "Role",
        roleName: entry.position,
        startDate: entry.startDate,
        endDate: isOpenEnded(entry.endDate) ? undefined : entry.endDate,
        author: { "@id": PERSON_ID },
      }),
    }),
  );

  /**
   * The union of the published entries' own skill lists, deduped on first appearance so the
   * order still reflects the resume's ordering rather than an alphabet.
   *
   * `skills` and not `knowsAbout`: schema.org defines `skills` as "knowledge, skill, ability,
   * task or any other assertion expressing a competency", which a named tool satisfies, while
   * `knowsAbout` means a topic known about, which "Visual Studio Code" is not. That is the
   * same distinction that keeps `areasOfExpertise` in `knowsAbout` and out of here.
   */
  const publishedSkills: Array<string> = [];
  const seenSkills = new Set<string>();
  for (const { entry } of published) {
    for (const skill of entry.skills ?? []) {
      if (typeof skill !== "string" || skill.trim() === "" || seenSkills.has(skill)) continue;
      seenSkills.add(skill);
      publishedSkills.push(skill);
    }
  }

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
   * `bio` is the third-person long-form description, written for this property and for
   * nothing else.
   *
   * The page speaks in the first person -- "I am a software engineer and architect with 35
   * years..." -- which is right for a person's own site and wrong for a metadata field a
   * machine reader will quote back about him. `metaDescription` is not the substitute: it
   * is capped at 160 characters because it feeds `<meta name="description">` and
   * `og:description`, and the graph has room for the longer prose.
   *
   * ACCEPTED COST: `bio` restates the facts in `summary1`, `summary2` and `summary7` in a
   * different voice, and nothing can check that the two stay in agreement. Editing one and
   * not the other leaves the page and the graph saying different things about the same
   * career, silently. That is the price of the page being first person and the graph third,
   * and it is paid deliberately -- the alternative is publishing "I am..." to readers that
   * are quoting rather than listening.
   *
   * The fallback keeps the build working before the field exists and warns rather than
   * degrading quietly, matching how `resume-head-plugin.ts` treats its own missing fields.
   *
   * `stripHtml` and not the text file's ASCII folding: this is JSON, so the source's
   * em-dashes and curly quotes are carried through as they are written. `bio` should hold
   * no markup, but the strip costs nothing, and the `summary*` fields it replaces do carry
   * anchors.
   */
  const bio = typeof basics.bio === "string" ? stripHtml(basics.bio).trim() : "";
  let description = bio;
  if (description === "") {
    description = SUMMARY_KEYS.map((key) => (typeof basics[key] === "string" ? stripHtml(basics[key]) : ""))
      .filter((paragraph) => paragraph !== "")
      .join(" ");
    warn?.(
      `basics.bio is missing or empty; Person.description falls back to the first-person ` +
        `${SUMMARY_KEYS.join(", ")} paragraphs, which read as the page rather than as metadata`,
    );
  }

  const jobTitle = typeof basics.label === "string" ? basics.label : undefined;

  /**
   * No `skills` here. It used to repeat `areasOfExpertise`, which `knowsAbout` already
   * carries -- the same list asserted twice under two names. `areasOfExpertise` now has one
   * home, and the concrete tool names live in `Person.skills` instead.
   */
  const hasOccupation = jobTitle
    ? compact({
        "@type": "Occupation",
        name: jobTitle,
        occupationalCategory: OCCUPATION_CODE,
      })
    : undefined;

  const person = compact({
    "@type": "Person",
    "@id": PERSON_ID,
    mainEntityOfPage: { "@id": PAGE_ID },
    name: basics.name,
    url: basics.website,
    image: basics.image,
    jobTitle,
    description,
    sameAs,
    address: Object.keys(address).length > 1 ? address : undefined,
    knowsLanguage,
    nationality,
    alumniOf,
    hasCredential,
    knowsAbout,
    skills: publishedSkills,
    hasOccupation,
    worksFor,
    /**
     * `owns` rather than a forward "created" property, because schema.org defines no such
     * property on `Person` -- only the inverse, which is why each application carries
     * `author` back to this node. The reference here is a pointer to that node, so the
     * relationship is stated once in a term the vocabulary knows and once in a term that
     * reads naturally, and neither is invented.
     */
    owns: projects.map(({ entry }) => ({ "@id": entry.website })),
  });

  /**
   * The page node, which is what the document actually describes. Until now the block was a
   * bare `Person`: it described a man, with no statement that this URL is his profile page.
   * `ProfilePage` plus `mainEntity` makes the page a first-class node and the Person the
   * subject of it, which is the pairing a reader looks for to decide what a URL *is*.
   */
  const page = compact({
    "@type": "ProfilePage",
    "@id": PAGE_ID,
    url: PAGE_URL,
    name: basics.metaTitle,
    description: basics.metaDescription,
    /**
     * The commit date of the last commit that touched `resume.json`, not a build timestamp
     * and not the file's mtime -- `resumeLastUpdated()` carries the reasoning for both
     * exclusions. `dateModified` is a claim about when the content changed, so a value that
     * moved on every rebuild would be worse than no value at all.
     */
    dateModified: resumeLastUpdated(),
    mainEntity: { "@id": PERSON_ID },
    hasPart: projects.map(({ entry }) => ({ "@id": entry.website })),
  });

  /**
   * A `@graph` rather than one nested object, so every node that is referred to more than
   * once exists exactly once and is referred to by `@id`. Microsoft is one node with two
   * roles pointing at it; each project is one node that the page lists as a part, the Person
   * owns, and which names the Person as its author. Nesting could express none of that --
   * an anonymous node cannot be pointed at.
   */
  return {
    "@context": "https://schema.org",
    "@graph": [page, person, ...organizations, ...applications],
  };
}

export function resumeJsonLd(): Plugin {
  const generate = async (warn: (message: string) => void): Promise<string> => {
    const resume = JSON.parse(await readFile(resolve(process.cwd(), RESUME_PATH), "utf8"));
    return JSON.stringify(buildPersonJsonLd(resume, warn), null, 2);
  };

  return {
    name: "resume-jsonld",

    async transformIndexHtml() {
      const json = escapeForScript(await generate((message) => this.warn(message)));

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
      await writeFile(resolve(process.cwd(), OUTPUT_PATH), `${await generate((message) => this.warn(message))}\n`, "utf8");
    },
  };
}
