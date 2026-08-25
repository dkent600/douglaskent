/**
 * State for the dev-only resume editor.
 *
 * Deliberately a module singleton rather than a DI registration. Registering it would
 * mean naming it in `main.ts`, which would pull the whole editor into the production
 * bundle; keeping it here means nothing outside `src/pages/admin` ever references it,
 * which is what lets Rollup drop the editor entirely from a build.
 *
 * It also does not go through `IResumeStore`. That store reads the `resume.json` that
 * was imported at build time, which goes stale the moment the editor writes the file.
 * The editor always works from a fresh `GET /__resume` instead.
 */
import type { ILogger } from "aurelia";

export interface IEditableCompany {
  company: string;
  position: string;
  startDate: string;
  endDate: string;
  summary?: string;
  website?: string;
  remote?: boolean;
  contract?: boolean;
  personal?: boolean;
  highlights?: Array<string>;
  skills?: Array<string>;
}

export interface IEditableSkill {
  name: string;
  priority: number;
  categories: Array<string>;
  url?: string;
  aliases?: Array<string>;
  hide?: boolean;
}

/**
 * The index signature matters: the editor only touches three sections, but it saves the
 * whole document back, so every other section has to survive the round trip untouched.
 */
export interface IEditableResume {
  work: Array<IEditableCompany>;
  skills: Array<IEditableSkill>;
  skillCategories: Array<string>;
  [section: string]: unknown;
}

export interface IIssue {
  level: "error" | "warning";
  message: string;
}

const ENDPOINT = "/__resume";
const MONTH = /^\d{4}-\d{2}$/;

export class AdminStore {
  /**
   * Set once by `Admin`. The store is constructed at module load, outside any DI
   * activation context, so it cannot `resolve(ILogger)` for itself.
   */
  private log: ILogger | null = null;

  public useLogger(logger: ILogger): void {
    this.log = logger;
  }

  public resume: IEditableResume | null = null;
  public dirty = false;
  public busy = false;
  public status = "";

  public async load(): Promise<void> {
    this.busy = true;
    this.status = "loading...";
    try {
      const response = await fetch(ENDPOINT);
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      this.resume = (await response.json()) as IEditableResume;
      this.dirty = false;
      this.status = `loaded ${this.resume.work.length} companies, ${this.resume.skills.length} skills, ${this.resume.skillCategories.length} categories`;
    } catch (error) {
      this.status = `load failed: ${(error as Error).message}`;
      this.log?.error("load failed", error);
    } finally {
      this.busy = false;
    }
  }

  public async save(): Promise<void> {
    if (!this.resume || this.errors.length > 0) {
      return;
    }
    this.busy = true;
    this.status = "saving...";
    try {
      const response = await fetch(ENDPOINT, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(this.resume),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? `${response.status} ${response.statusText}`);
      }
      this.dirty = false;
      this.status = `saved at ${new Date().toLocaleTimeString()}`;
    } catch (error) {
      this.status = `save failed: ${(error as Error).message}`;
      this.log?.error("save failed", error);
    } finally {
      this.busy = false;
    }
  }

  public touch(): void {
    this.dirty = true;
  }

  // ---------------------------------------------------------------- companies

  public get companies(): Array<IEditableCompany> {
    return this.resume?.work ?? [];
  }

  public addCompany(): IEditableCompany {
    const company: IEditableCompany = { company: "", position: "", startDate: "", endDate: "", summary: "", highlights: [], skills: [] };
    this.companies.unshift(company);
    this.touch();
    return company;
  }

  public duplicateCompany(index: number): void {
    const copy = structuredClone(this.companies[index]);
    copy.company = `${copy.company} (copy)`;
    this.companies.splice(index + 1, 0, copy);
    this.touch();
  }

  public deleteCompany(index: number): void {
    this.companies.splice(index, 1);
    this.touch();
  }

  /**
   * Array order is display order, and the first three entries sit above the
   * "Show the whole history" fold, so moving to the top is its own operation.
   */
  public moveCompany(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= this.companies.length) {
      return;
    }
    const [company] = this.companies.splice(index, 1);
    this.companies.splice(target, 0, company);
    this.touch();
  }

  public moveCompanyToTop(index: number): void {
    const [company] = this.companies.splice(index, 1);
    this.companies.unshift(company);
    this.touch();
  }

  // ------------------------------------------------------------------- skills

  public get skills(): Array<IEditableSkill> {
    return this.resume?.skills ?? [];
  }

  public get categories(): Array<string> {
    return this.resume?.skillCategories ?? [];
  }

  /**
   * Lowercase name *and* alias to skill, mirroring how `History` resolves the names in
   * `work[].skills`. Later entries overwrite earlier ones there, and here, so that the
   * editor reports exactly what the resume would render.
   */
  public get skillsByKey(): Map<string, IEditableSkill> {
    const byKey = new Map<string, IEditableSkill>();
    for (const skill of this.skills) {
      byKey.set(skill.name.toLowerCase(), skill);
      for (const alias of skill.aliases ?? []) {
        byKey.set(alias.toLowerCase(), skill);
      }
    }
    return byKey;
  }

  /** Every name a company may legally reference, for the skill pickers. */
  public get selectableSkillNames(): Array<string> {
    return [...new Set(this.skills.flatMap((skill) => [skill.name, ...(skill.aliases ?? [])]))].sort((a, b) => a.localeCompare(b));
  }

  public companiesUsingSkill(skill: IEditableSkill): Array<string> {
    const keys = new Set([skill.name.toLowerCase(), ...(skill.aliases ?? []).map((alias) => alias.toLowerCase())]);
    return this.companies.filter((company) => (company.skills ?? []).some((name) => keys.has(name.toLowerCase()))).map((company) => company.company);
  }

  public skillsUsingCategory(category: string): Array<string> {
    return this.skills.filter((skill) => skill.categories.includes(category)).map((skill) => skill.name);
  }

  // --------------------------------------------------------------- validation

  public get issues(): Array<IIssue> {
    if (!this.resume) {
      return [];
    }
    const issues: Array<IIssue> = [];
    const byKey = this.skillsByKey;

    for (const company of this.companies) {
      const label = company.company || "(unnamed company)";
      if (!company.company.trim()) {
        issues.push({ level: "error", message: `A company has no name` });
      }
      if (!company.position.trim()) {
        issues.push({ level: "error", message: `${label}: position is required` });
      }
      for (const [field, value] of [
        ["startDate", company.startDate],
        ["endDate", company.endDate],
      ] as const) {
        /**
         * A warning, not an error. Nothing parses these -- the view interpolates them
         * as text -- and the real resume deliberately carries "2017-09 (intermittent)".
         * Worth flagging for consistency, not worth blocking a save over.
         */
        if (!MONTH.test(value)) {
          issues.push({ level: "warning", message: `${label}: ${field} is not YYYY-MM ("${value}")` });
        }
      }
      /**
       * The resume resolves these with a non-null assertion, so an unknown name renders
       * `undefined` rather than failing loudly. Treat it as a hard error here instead.
       */
      for (const name of company.skills ?? []) {
        if (!byKey.has(name.toLowerCase())) {
          issues.push({ level: "error", message: `${label}: references unknown skill "${name}"` });
        }
      }
    }

    const seen = new Map<string, string>();
    for (const skill of this.skills) {
      if (!skill.name.trim()) {
        issues.push({ level: "error", message: "A skill has no name" });
      }
      for (const key of [skill.name, ...(skill.aliases ?? [])]) {
        const lower = key.toLowerCase();
        const owner = seen.get(lower);
        if (owner !== undefined && owner !== skill.name) {
          issues.push({ level: "warning", message: `"${key}" is claimed by both "${owner}" and "${skill.name}"; the later one wins` });
        }
        seen.set(lower, skill.name);
      }
      for (const category of skill.categories) {
        if (!this.categories.includes(category)) {
          issues.push({ level: "warning", message: `${skill.name}: category "${category}" is not in skillCategories, so it will not be shown` });
        }
      }
    }

    for (const category of this.categories) {
      if (this.skillsUsingCategory(category).length === 0) {
        issues.push({ level: "warning", message: `Category "${category}" has no skills` });
      }
    }

    return issues;
  }

  public get errors(): Array<IIssue> {
    return this.issues.filter((issue) => issue.level === "error");
  }

  public get warnings(): Array<IIssue> {
    return this.issues.filter((issue) => issue.level === "warning");
  }
}

export const adminStore = new AdminStore();
