import { stripHtml } from "./resume-text";

/**
 * Turns `resume.json` plus `linkedin.config.json` into the set of LinkedIn fields, each with
 * a computed default.
 *
 * A plain module on purpose. It runs in two places that share nothing else: the browser
 * store behind the admin page's LinkedIn tab, and the dev-server plugin that re-validates
 * the approval gate before writing `linkedin.state.json`. So there is no Node import, no
 * DOM, no Aurelia and no file access here -- callers hand in parsed JSON and get back
 * values. That is also what keeps a CLI possible later without a refactor.
 *
 * Nothing in this file is prose. Every string that could reach a LinkedIn profile is either
 * copied from `resume.json` or assembled from it by a rule that `linkedin.config.json`
 * expresses. A default that reads badly is a config problem to report, not text to repair.
 *
 * `resume-content.ts` has the same text helpers, but it imports `node:child_process` at the
 * top, which rules it out for the browser. The two helpers this needs -- entity decoding and
 * open-ended date detection -- are small enough to repeat.
 */

export type FieldValue = string | Array<string>;
export type FieldKind = "text" | "list";

// -------------------------------------------------------------------------------- config

export interface ILinkedInGroup {
  /** Stable, the way a work id is: it keys every field the group produces. */
  id: string;
  /** `work[].id` values, in any order. */
  members: Array<string>;
  /** `detailed` gives each member a summary and bullets; `line` gives each one line. */
  render: "detailed" | "line";
}

export interface ILinkedInConfig {
  experience: {
    /**
     * `notable` is the only rule: every `work` entry with `notable: true`. The profile lists
     * good work rather than a continuous timeline -- `notable: false` is the record that an
     * entry was judged not worth listing, and the gaps that leaves are deliberate. There is
     * no date threshold and no exclusion list; the key is required so the rule stays legible
     * in the config rather than implied by the code.
     */
    selectBy: "notable";
  };
  /**
   * Several roles at one employer merged into one entry, because they read as churn rather
   * than tenure when listed separately. Nothing to do with era. Membership is explicit.
   */
  groups: Array<ILinkedInGroup>;
  personal: {
    company: string;
    employmentType: string;
  };
  employmentType: {
    contract: string;
    default: string;
  };
  about: {
    /** `basics` keys, composed in this order with a blank line between. */
    paragraphs: Array<string>;
    /** Placeholders: `{countries}` `{city}` `{region}` `{countryName}` `{countryCode}`. */
    citizenshipTemplate: string;
    listSeparator: string;
    listLastSeparator: string;
  };
  headline: {
    /** Placeholders: `{label}` (`basics.label`), `{tagline}`, `{companies}`. */
    template: string;
    /** A supplied configuration value, copied verbatim; never composed here. */
    tagline: string;
    companies: Array<string>;
    companiesSeparator: string;
  };
  profileSkills: {
    priorityBelow: number;
    supplement: Array<string>;
    pinned: Array<string>;
  };
  entrySkills: {
    min: number;
    max: number;
    excludeHidden: boolean;
  };
  description: {
    bullet: string;
    /** Regexes tested against the inside of every `( ... )`; a match removes the whole parenthetical. */
    stripParentheticals: Array<string>;
  };
  /** Field-id patterns (`*` matches one segment) that have no computable default. */
  requireOverride: Array<string>;
  /**
   * Prose about how LinkedIn uses a field and what a good value looks like, keyed by field
   * id or by a pattern (`*` matches one segment); an exact id wins over a pattern. Read into
   * the field data and not rendered anywhere yet. Every entry is optional; the map is not.
   */
  guidance: Record<string, string>;
}

/**
 * Keys the file may carry that the generator does not read. JSON has no comments, so a
 * top-level `notes` array is where the reasons behind the rules live -- why two entries
 * that look like duplicates both stay, for instance. `validateConfig` copies out only the
 * keys it knows, so anything else is ignored rather than rejected.
 */

// -------------------------------------------------------------------------------- output

/**
 * LinkedIn's own limits, from the form. Constants rather than config because they are facts
 * about LinkedIn, not rules about the content, and the tool has nothing to say if they move.
 */
export const LIMITS = {
  headline: 220,
  about: 2600,
  description: 2000,
  entrySkills: 5,
  skills: 100,
} as const;

export interface IComputedField {
  id: string;
  kind: FieldKind;
  /** Absent for the meta fields, which LinkedIn does not count. */
  limit?: number;
  /** What the field is, for the pane heading. Not content: it is never pasted anywhere. */
  label: string;
  /** Groups the panes of one experience entry; the profile-level fields share one. */
  entry: string;
  default: FieldValue;
  requiresOverride: boolean;
  /** From `config.guidance`, when a key matches. */
  guidance?: string;
}

/**
 * The subset of `resume.json` that feeds any field. Stored with the approved state so that
 * an edit anywhere else in the document cannot register as drift.
 */
export interface IInputSnapshot {
  basics: Record<string, unknown>;
  citizenship: Array<unknown>;
  skills: Array<Record<string, unknown>>;
  work: Array<Record<string, unknown>>;
}

export interface IGenerated {
  fields: Array<IComputedField>;
  inputSnapshot: IInputSnapshot;
  /** Facts about the run worth showing next to the fields: counts, and anything odd. */
  notes: Array<string>;
}

// ------------------------------------------------------------------------- state & draft

export interface IStateField {
  /** The computed default at approval time, materialised even when an override stands. */
  default: FieldValue;
  override?: FieldValue;
  /**
   * Explicit, never inferred from `override === default`: accepting the default and typing
   * text identical to it are different states with different futures.
   */
  hasOverride: boolean;
  approvedAt: string;
  /**
   * Set when the field left the output -- its entry stopped being notable, or a group no
   * longer lists it -- and cleared if it comes back. An orphan is kept, override and all,
   * until a person discards it: the override is the expensive artifact, the default is free.
   * It sits outside the gate, so it neither blocks Save nor needs approving.
   */
  orphanedAt?: string;
}

export interface ILinkedInState {
  savedAt: string;
  inputSnapshot: IInputSnapshot;
  configSnapshot: ILinkedInConfig;
  fields: Record<string, IStateField>;
}

export interface IDraftField {
  /** What the textarea holds. For a list field, one item per element. */
  buffer?: FieldValue;
  hasOverride?: boolean;
  /** The computed default the user approved against; absent means not yet approved. */
  approvedDefault?: FieldValue;
  approvedAt?: string;
}

export interface ILinkedInDraft {
  savedAt?: string;
  fields: Record<string, IDraftField>;
}

// ------------------------------------------------------------------------------- helpers

type Json = Record<string, any>;

/**
 * Reads one config key and fails naming it. There is deliberately no fallback: a missing rule
 * silently replaced by a built-in one would be this module authoring content.
 */
function requireKey<T>(config: Json, path: string, check: (value: unknown) => value is T): T {
  let value: unknown = config;
  for (const segment of path.split(".")) {
    value = typeof value === "object" && value !== null ? (value as Json)[segment] : undefined;
  }
  if (!check(value)) {
    throw new Error(`linkedin.config.json: missing or invalid "${path}"`);
  }
  return value;
}

const isString = (value: unknown): value is string => typeof value === "string";
const isNumber = (value: unknown): value is number => typeof value === "number" && !Number.isNaN(value);
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";
const isStringArray = (value: unknown): value is Array<string> => Array.isArray(value) && value.every(isString);
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const isStringMap = (value: unknown): value is Record<string, string> => isObject(value) && Object.values(value).every(isString);
const isNotableRule = (value: unknown): value is "notable" => value === "notable";
const isGroupArray = (value: unknown): value is Array<ILinkedInGroup> =>
  Array.isArray(value) && value.every((group) => isObject(group) && isString(group.id) && isStringArray(group.members) && (group.render === "detailed" || group.render === "line"));

/** Validates the file's shape up front so a typo fails at load rather than halfway through. */
export function validateConfig(raw: unknown): ILinkedInConfig {
  if (!isObject(raw)) {
    throw new Error("linkedin.config.json: not a JSON object");
  }
  return {
    experience: {
      selectBy: requireKey(raw, "experience.selectBy", isNotableRule),
    },
    groups: requireKey(raw, "groups", isGroupArray),
    personal: {
      company: requireKey(raw, "personal.company", isString),
      employmentType: requireKey(raw, "personal.employmentType", isString),
    },
    employmentType: {
      contract: requireKey(raw, "employmentType.contract", isString),
      default: requireKey(raw, "employmentType.default", isString),
    },
    about: {
      paragraphs: requireKey(raw, "about.paragraphs", isStringArray),
      citizenshipTemplate: requireKey(raw, "about.citizenshipTemplate", isString),
      listSeparator: requireKey(raw, "about.listSeparator", isString),
      listLastSeparator: requireKey(raw, "about.listLastSeparator", isString),
    },
    headline: {
      template: requireKey(raw, "headline.template", isString),
      tagline: requireKey(raw, "headline.tagline", isString),
      companies: requireKey(raw, "headline.companies", isStringArray),
      companiesSeparator: requireKey(raw, "headline.companiesSeparator", isString),
    },
    profileSkills: {
      priorityBelow: requireKey(raw, "profileSkills.priorityBelow", isNumber),
      supplement: requireKey(raw, "profileSkills.supplement", isStringArray),
      pinned: requireKey(raw, "profileSkills.pinned", isStringArray),
    },
    entrySkills: {
      min: requireKey(raw, "entrySkills.min", isNumber),
      max: requireKey(raw, "entrySkills.max", isNumber),
      excludeHidden: requireKey(raw, "entrySkills.excludeHidden", isBoolean),
    },
    description: {
      bullet: requireKey(raw, "description.bullet", isString),
      stripParentheticals: requireKey(raw, "description.stripParentheticals", isStringArray),
    },
    requireOverride: requireKey(raw, "requireOverride", isStringArray),
    guidance: requireKey(raw, "guidance", isStringMap),
  };
}

/** Mirrors `OPEN_ENDED` in `resume-content.ts`. */
const OPEN_ENDED = new Set(["present", "current", "now", "ongoing"]);

export const isOpenEnded = (value: unknown): boolean => typeof value !== "string" || value.trim() === "" || OPEN_ENDED.has(value.trim().toLowerCase());

/** Mirrors `ENTITIES` in `resume-content.ts`, plus numeric references so nothing leaks. */
const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decodeEntities(value: string): string {
  let text = value;
  for (const [entity, replacement] of Object.entries(ENTITIES)) {
    text = text.split(entity).join(replacement);
  }
  return text.replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(parseInt(hex, 16))).replace(/&#(\d+);/g, (_match, decimal: string) => String.fromCodePoint(Number(decimal)));
}

const URL = /\s*\(?\bhttps?:\/\/[^\s)]+\)?/g;
/** Only parentheticals without a nested pair, so "(kCur <> cUSD)" and its like are examined whole. */
const PARENTHETICAL = /\s*\(([^()]*)\)/g;

/**
 * The transforms every computed description passes through, in order: tags out (link text
 * stays), entities decoded, the configured parentheticals dropped, any URL still standing
 * dropped -- LinkedIn does not linkify a description, so a URL there is dead weight --
 * and runs of blanks collapsed. Newlines are preserved: composition adds them deliberately.
 *
 * Nothing here touches punctuation. A tidy that closed the gap before `.`, `,`, `;` and `:`
 * used to sit after the whitespace collapse and turned ", .NET" into ",.NET" -- any token
 * that begins with a period loses its space to a rule like that. It was redundant anyway:
 * both removals above consume the whitespace ahead of what they remove, so no gap is left
 * to close.
 */
export function cleanText(value: string, config: ILinkedInConfig): string {
  const patterns = config.description.stripParentheticals.map((pattern) => new RegExp(pattern, "i"));
  return decodeEntities(stripHtml(value))
    .replace(PARENTHETICAL, (match, inner: string) => (patterns.some((pattern) => pattern.test(inner.trim())) ? "" : match))
    .replace(URL, "")
    .replace(/[ \t\u00a0]+/g, " ")
    .trim();
}

/** `a, b and c` under the configured separators; a single item is returned as is. */
function joinList(items: Array<string>, config: ILinkedInConfig): string {
  if (items.length <= 1) return items.join("");
  return items.slice(0, -1).join(config.about.listSeparator) + config.about.listLastSeparator + items[items.length - 1];
}

/** `*` matches one `:`-delimited segment, so `exp:*:employmentType` is every entry's type. */
function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^:]*");
  return new RegExp(`^${escaped}$`);
}

// --------------------------------------------------------------------------------- skills

interface ISkillRecord {
  name: string;
  priority: number;
  hide: boolean;
}

/**
 * Every name and alias, lower-cased, pointing at the owning skill -- the same resolution
 * `History` and the admin editor use, because `work[].skills` is full of case mismatches
 * that the site treats as valid references. What comes out is always the canonical `name`.
 */
function indexSkills(skills: Array<Json>): Map<string, ISkillRecord> {
  const byKey = new Map<string, ISkillRecord>();
  for (const raw of skills) {
    const priority = Number(raw.priority);
    const record: ISkillRecord = {
      name: String(raw.name),
      priority: Number.isNaN(priority) ? Number.POSITIVE_INFINITY : priority,
      hide: raw.hide === true,
    };
    const aliases: Array<unknown> = Array.isArray(raw.aliases) ? raw.aliases : [];
    for (const key of [raw.name, ...aliases]) {
      if (typeof key !== "string" || key.trim() === "") continue;
      if (!byKey.has(key.toLowerCase())) byKey.set(key.toLowerCase(), record);
    }
  }
  return byKey;
}

const byPriorityThenName = (a: ISkillRecord, b: ISkillRecord): number => a.priority - b.priority || a.name.localeCompare(b.name);

/**
 * The profile's skills list: the pinned names first, in their configured order, then
 * everything under the priority threshold ascending, then the supplement in its order.
 * Each name appears once.
 */
function profileSkills(skills: Array<Json>, index: Map<string, ISkillRecord>, config: ILinkedInConfig): Array<string> {
  const resolve = (name: string, source: string): ISkillRecord => {
    const record = index.get(name.toLowerCase());
    if (!record) throw new Error(`linkedin.config.json: ${source} names "${name}", which is not in resume.json skills`);
    return record;
  };
  const pinned = config.profileSkills.pinned.map((name) => resolve(name, "profileSkills.pinned"));
  const below = skills
    .map((raw) => index.get(String(raw.name).toLowerCase()))
    .filter((record): record is ISkillRecord => record !== undefined && record.priority < config.profileSkills.priorityBelow)
    .filter((record) => !(config.entrySkills.excludeHidden && record.hide))
    .sort(byPriorityThenName);
  const supplement = config.profileSkills.supplement.map((name) => resolve(name, "profileSkills.supplement"));

  const names: Array<string> = [];
  for (const record of [...pinned, ...below, ...supplement]) {
    if (!names.includes(record.name)) names.push(record.name);
  }
  return names;
}

/**
 * One entry's skills line. Intersect the entry's skills with the profile list, in the
 * profile's order; if that leaves fewer than the minimum, top up from the entry's remaining
 * skills by global priority; cap at the maximum. Without the top-up the older enterprise
 * entries collapse to whatever single skill they share with an LLM- and Web3-weighted
 * profile list.
 */
function entrySkills(names: Array<string>, profile: Array<string>, index: Map<string, ISkillRecord>, config: ILinkedInConfig): Array<string> {
  const resolved: Array<ISkillRecord> = [];
  for (const name of names) {
    const record = index.get(name.toLowerCase());
    if (!record || (config.entrySkills.excludeHidden && record.hide)) continue;
    if (!resolved.some((existing) => existing.name === record.name)) resolved.push(record);
  }
  const have = new Set(resolved.map((record) => record.name));
  const chosen = profile.filter((name) => have.has(name));
  if (chosen.length < config.entrySkills.min) {
    const rest = resolved.filter((record) => !chosen.includes(record.name)).sort(byPriorityThenName);
    for (const record of rest.slice(0, config.entrySkills.min - chosen.length)) chosen.push(record.name);
  }
  return chosen.slice(0, config.entrySkills.max);
}

// ------------------------------------------------------------------------------- entries

/** One LinkedIn experience entry, before it is split into fields. */
interface IExperience {
  key: string;
  label: string;
  company: string;
  title: string;
  employmentType: string;
  startDate: string;
  endDate: string;
  description: string;
  skills: Array<string>;
}

const asStrings = (value: unknown): Array<string> => (Array.isArray(value) ? value.filter(isString) : []);

function employmentTypeOf(entries: Array<Json>, config: ILinkedInConfig): string {
  if (entries.every((entry) => entry.personal === true)) return config.personal.employmentType;
  if (entries.every((entry) => entry.contract === true)) return config.employmentType.contract;
  return config.employmentType.default;
}

const companyOf = (entry: Json, config: ILinkedInConfig): string => (entry.personal === true ? config.personal.company : String(entry.company ?? ""));

/** Summary, a blank line, then one bullet per highlight. */
function describe(entry: Json, config: ILinkedInConfig): string {
  const summary = cleanText(String(entry.summary ?? ""), config);
  const bullets = asStrings(entry.highlights)
    .map((highlight) => cleanText(highlight, config))
    .filter((highlight) => highlight !== "")
    .map((highlight) => config.description.bullet + highlight);
  return [summary, bullets.join("\n")].filter((part) => part !== "").join("\n\n");
}

function singleExperience(entry: Json, config: ILinkedInConfig, profile: Array<string>, index: Map<string, ISkillRecord>): IExperience {
  const company = companyOf(entry, config);
  const title = String(entry.position ?? "");
  return {
    key: String(entry.id),
    label: `${company} — ${title}`,
    company,
    title,
    employmentType: employmentTypeOf([entry], config),
    startDate: String(entry.startDate ?? ""),
    endDate: String(entry.endDate ?? ""),
    description: describe(entry, config),
    skills: entrySkills(asStrings(entry.skills), profile, index, config),
  };
}

const distinct = (values: Array<string>): Array<string> => values.filter((value, i) => value !== "" && values.indexOf(value) === i);

/** Latest first, the way LinkedIn lists roles. An open-ended entry sorts before every dated one. */
function latestFirst(a: Json, b: Json): number {
  const endA = isOpenEnded(a.endDate) ? "9999" : String(a.endDate);
  const endB = isOpenEnded(b.endDate) ? "9999" : String(b.endDate);
  return endB.localeCompare(endA) || String(b.startDate).localeCompare(String(a.startDate));
}

/**
 * Several roles at one employer as a single entry. The members' distinct companies and
 * positions are joined, the dates span the members, and the description carries each
 * member in turn -- either its full summary and bullets or a single line, per the group's
 * `render`.
 */
function groupExperience(group: ILinkedInGroup, members: Array<Json>, config: ILinkedInConfig, profile: Array<string>, index: Map<string, ISkillRecord>): IExperience {
  const ordered = [...members].sort(latestFirst);
  const company = distinct(ordered.map((entry) => companyOf(entry, config))).join(" / ");
  const title = distinct(ordered.map((entry) => String(entry.position ?? ""))).join(" / ");
  const startDate = ordered.map((entry) => String(entry.startDate ?? "")).sort()[0] ?? "";
  const endDate = ordered.some((entry) => isOpenEnded(entry.endDate))
    ? "present"
    : (ordered
        .map((entry) => String(entry.endDate ?? ""))
        .sort()
        .at(-1) ?? "");

  const span = (entry: Json): string => `${String(entry.startDate ?? "")} – ${String(entry.endDate ?? "")}`;
  const description =
    group.render === "line"
      ? ordered.map((entry) => `${String(entry.position ?? "")}, ${span(entry)}: ${cleanText(String(entry.summary ?? ""), config)}`).join("\n")
      : ordered.map((entry) => [`${String(entry.position ?? "")}, ${span(entry)}`, describe(entry, config)].filter((part) => part !== "").join("\n")).join("\n\n");

  return {
    key: group.id,
    label: `${company} — ${title}`,
    company,
    title,
    employmentType: employmentTypeOf(ordered, config),
    startDate,
    endDate,
    description,
    skills: entrySkills(
      ordered.flatMap((entry) => asStrings(entry.skills)),
      profile,
      index,
      config,
    ),
  };
}

// ------------------------------------------------------------------------------ generate

export function generate(resume: Json, rawConfig: unknown): IGenerated {
  const config = validateConfig(rawConfig);
  const notes: Array<string> = [];

  const work: Array<Json> = Array.isArray(resume.work) ? resume.work : [];
  const skills: Array<Json> = Array.isArray(resume.skills) ? resume.skills : [];
  const basics: Json = isObject(resume.basics) ? resume.basics : {};
  const citizenship: Array<Json> = Array.isArray(resume.citizenship) ? resume.citizenship : [];
  const byId = new Map<string, Json>();
  for (const entry of work) {
    if (!isString(entry.id) || entry.id === "") throw new Error(`resume.json: work entry "${String(entry.company)}" has no id; every entry needs one`);
    if (byId.has(entry.id)) throw new Error(`resume.json: work id "${entry.id}" is shared by two entries`);
    byId.set(entry.id, entry);
  }
  const index = indexSkills(skills);
  const profile = profileSkills(skills, index, config);

  // ---- selection

  const grouped = new Map<string, string>();
  for (const group of config.groups) {
    if (!/^[a-z0-9-]+$/.test(group.id)) throw new Error(`linkedin.config.json: group id "${group.id}" must be lower-case letters, digits and hyphens`);
    if (byId.has(group.id)) throw new Error(`linkedin.config.json: group id "${group.id}" collides with a work id`);
    if (group.members.length === 0) throw new Error(`linkedin.config.json: group "${group.id}" has no members`);
    for (const member of group.members) {
      if (!byId.has(member)) throw new Error(`linkedin.config.json: group "${group.id}" names work id "${member}", which is not in resume.json`);
      const owner = grouped.get(member);
      if (owner !== undefined) throw new Error(`linkedin.config.json: work id "${member}" is in both groups "${owner}" and "${group.id}"`);
      grouped.set(member, group.id);
    }
  }
  const isNotable = (entry: Json): boolean => entry.notable === true;
  /** Standalone entries: notable and not claimed by a group. Latest first, as LinkedIn lists them. */
  const selected = work.filter((entry) => isNotable(entry) && !grouped.has(entry.id as string)).sort(latestFirst);

  /**
   * Group membership is explicit and is not filtered by `notable` at run time. A listed
   * member that is not notable is left out of the composed entry and named in the notes, and
   * the run continues: one flag flip must not stop a tool whose other entries are fine, and
   * the consequence surfaces anyway -- the group's description default moves, so that field
   * is flagged for review with a diff. A member id that names no entry at all is a broken
   * config and fails above.
   */
  const groups: Array<{ group: ILinkedInGroup; members: Array<Json> }> = [];
  for (const group of config.groups) {
    const members = group.members.map((id) => byId.get(id) as Json);
    for (const member of members.filter((entry) => !isNotable(entry))) {
      notes.push(`warning: group "${group.id}" lists ${String(member.id)} (${String(member.company)}, ${String(member.startDate)} – ${String(member.endDate)}), which is not notable; left out`);
    }
    const kept = members.filter(isNotable);
    if (kept.length === 0) {
      notes.push(`warning: group "${group.id}" has no notable members; no entry produced`);
      continue;
    }
    groups.push({ group, members: kept });
  }

  const experiences: Array<IExperience> = [
    ...selected.map((entry) => singleExperience(entry, config, profile, index)),
    ...groups.map(({ group, members }) => groupExperience(group, members, config, profile, index)),
  ];
  notes.push(`${work.filter(isNotable).length} notable work entries → ${selected.length} standalone + ${groups.length} groups = ${experiences.length} output entries`);
  notes.push(`${profile.length} profile skills`);

  // ---- profile-level fields

  const paragraphs = config.about.paragraphs.map((key) => {
    const value = basics[key];
    if (!isString(value)) throw new Error(`linkedin.config.json: about.paragraphs names basics.${key}, which is not a string in resume.json`);
    return cleanText(value, config);
  });
  const location: Json = isObject(basics.location) ? basics.location : {};
  const placeholders: Record<string, string> = {
    countries: joinList(
      citizenship.map((entry) => String(entry.country ?? "")).filter((country) => country !== ""),
      config,
    ),
    city: String(location.city ?? ""),
    region: String(location.region ?? ""),
    countryName: String(location.countryName ?? ""),
    countryCode: String(location.countryCode ?? ""),
  };
  /** Fills `{name}` slots from a map, failing on a name the map does not have. */
  const fill = (template: string, values: Record<string, string>, source: string): string =>
    template.replace(/\{(\w+)\}/g, (_match, name: string) => {
      const value = values[name];
      if (value === undefined) throw new Error(`linkedin.config.json: ${source} uses unknown placeholder {${name}}`);
      return value;
    });
  const citizenshipSentence = fill(config.about.citizenshipTemplate, placeholders, "about.citizenshipTemplate");
  const about = [...paragraphs, citizenshipSentence].filter((part) => part !== "").join("\n\n");

  const headline = fill(
    config.headline.template,
    {
      label: isString(basics.label) ? basics.label : "",
      tagline: config.headline.tagline,
      companies: config.headline.companies.join(config.headline.companiesSeparator),
    },
    "headline.template",
  );

  // ---- fields

  const requireOverride = config.requireOverride.map(patternToRegExp);
  const guidance = Object.entries(config.guidance).map(([key, text]) => ({ key, pattern: patternToRegExp(key), text }));
  const guidanceFor = (id: string): string | undefined => (guidance.find((entry) => entry.key === id) ?? guidance.find((entry) => entry.pattern.test(id)))?.text;
  const field = (id: string, kind: FieldKind, label: string, entry: string, value: FieldValue, limit?: number): IComputedField => {
    const requiresOverride = requireOverride.some((pattern) => pattern.test(id));
    const text = guidanceFor(id);
    return { id, kind, limit, label, entry, default: requiresOverride ? (kind === "list" ? [] : "") : value, requiresOverride, ...(text !== undefined ? { guidance: text } : {}) };
  };

  const fields: Array<IComputedField> = [
    field("headline", "text", "Headline", "Profile", headline, LIMITS.headline),
    field("about", "text", "About", "Profile", about, LIMITS.about),
    field("skills", "list", "Skills", "Profile", profile, LIMITS.skills),
  ];
  for (const experience of experiences) {
    const entry = experience.label;
    const id = (name: string) => `exp:${experience.key}:${name}`;
    fields.push(
      field(id("company"), "text", "Company", entry, experience.company),
      field(id("title"), "text", "Title", entry, experience.title),
      field(id("employmentType"), "text", "Employment type", entry, experience.employmentType),
      field(id("startDate"), "text", "Start date", entry, experience.startDate),
      field(id("endDate"), "text", "End date", entry, experience.endDate),
      field(id("description"), "text", "Description", entry, experience.description, LIMITS.description),
      field(id("skills"), "list", "Skills", entry, experience.skills, LIMITS.entrySkills),
    );
  }

  // ---- snapshot

  const pick = (source: Json, keys: Array<string>): Json => {
    const picked: Json = {};
    for (const key of keys) {
      if (source[key] !== undefined) picked[key] = source[key];
    }
    return picked;
  };
  const involved = [...selected, ...groups.flatMap(({ members }) => members)];
  const inputSnapshot: IInputSnapshot = {
    basics: pick(basics, ["label", "location", ...config.about.paragraphs]),
    citizenship,
    skills: skills.map((skill) => pick(skill, ["name", "priority", "aliases", "hide"])),
    work: involved.map((entry) => pick(entry, ["id", "company", "position", "startDate", "endDate", "summary", "highlights", "website", "skills", "personal", "contract"])),
  };

  return { fields, inputSnapshot, notes };
}

// ----------------------------------------------------------------------------- values

const normalise = (value: FieldValue | undefined): FieldValue | undefined => (Array.isArray(value) ? value.map((item) => item.trim()).filter((item) => item !== "") : value);

export const sameValue = (a: FieldValue | undefined, b: FieldValue | undefined): boolean => JSON.stringify(normalise(a)) === JSON.stringify(normalise(b));

/** Characters for text, items for a list -- whichever the limit counts. */
export const valueLength = (kind: FieldKind, value: FieldValue | undefined): number => {
  if (value === undefined) return 0;
  if (kind === "list") return (normalise(value) as Array<string>).length;
  return Array.isArray(value) ? value.join("\n").length : value.length;
};

/** The output for a field -- the override when one stands, else the default. */
export const outputOf = (field: { default: FieldValue; override?: FieldValue; hasOverride: boolean }): FieldValue =>
  field.hasOverride && field.override !== undefined ? field.override : field.default;

// ------------------------------------------------------------------------------- gate

/**
 * Everything that must hold for `fields` to be written as `linkedin.state.json`. Run by the
 * dev server before it writes and by the browser to decide whether Save is offered, so the
 * two can never disagree about what "approved" means. Returns the reasons it is not; empty
 * means it may be saved.
 *
 * The gate covers what is in the output. A stored field that no longer computes is an
 * orphan, not an error: it is retained by `markOrphans` and never judged here.
 */
export function gateErrors(fields: unknown, computed: Array<IComputedField>): Array<string> {
  if (!isObject(fields)) return ["fields is not an object"];
  const errors: Array<string> = [];
  for (const field of computed) {
    const stored = fields[field.id] as unknown;
    if (!isObject(stored)) {
      errors.push(`${field.id}: not approved`);
      continue;
    }
    if (!sameValue(stored.default as FieldValue | undefined, field.default)) {
      errors.push(`${field.id}: approved against a default that has since changed`);
    }
    if (!isBoolean(stored.hasOverride)) {
      errors.push(`${field.id}: hasOverride must be true or false`);
    } else if (stored.hasOverride !== (stored.override !== undefined)) {
      errors.push(`${field.id}: hasOverride and override disagree`);
    }
    if (!isString(stored.approvedAt)) {
      errors.push(`${field.id}: no approvedAt`);
    }
    if (field.requiresOverride && stored.hasOverride !== true) {
      errors.push(`${field.id}: requires an override and has none`);
    }
    const length = valueLength(field.kind, outputOf(stored as IStateField));
    if (field.limit !== undefined && length > field.limit) {
      errors.push(`${field.id}: ${length} over the limit of ${field.limit}`);
    }
  }
  return errors;
}

/**
 * Stamps `orphanedAt` on every stored field that is not in the output and clears it from
 * every one that is. Nothing is deleted: a field leaves the state only when a person
 * discards it in the tab. An entry that returns -- the flag flipped back, a member re-added
 * -- finds its override waiting, exactly, because the id is the work entry's and never
 * changes. The stamp already on an orphan is kept, so it records when the field first left.
 */
export function markOrphans(fields: Record<string, IStateField>, computed: Array<IComputedField>, now: string): Record<string, IStateField> {
  const live = new Set(computed.map((field) => field.id));
  const marked: Record<string, IStateField> = {};
  for (const [id, field] of Object.entries(fields)) {
    if (live.has(id)) {
      const { orphanedAt: _orphanedAt, ...rest } = field;
      marked[id] = rest;
    } else {
      marked[id] = { ...field, orphanedAt: field.orphanedAt ?? now };
    }
  }
  return marked;
}
