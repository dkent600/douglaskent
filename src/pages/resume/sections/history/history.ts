import { bindable, customElement, resolve } from "aurelia";
import { WhichResumeOnly } from "../../../../resources/attributes/whichResumeOnly";

import { ICompany, IResumeStore, ISkill } from "../../../../stores/resume-store";

import template from "./history.html";

/**
 * `showingHighlights` is view state rather than resume data, so it has no place in
 * resume.json -- and ICompany is inferred from that json. Layer it on here, where the
 * template binds to it.
 */
type ICompanyView = ICompany & { showingHighlights: boolean };

@customElement({ name: "history", template })
export class History {
  @bindable expanded = false;
  showingEntireHistory = false;
  entireHistoryStartIndex = 7;
  readonly skillByName: Map<string, ISkill> = new Map<string, ISkill>();
  readonly resumeStore = resolve(IResumeStore);
  readonly companies: Array<ICompanyView> = this.resumeStore.companies
    // .sort((a, b) => {
    //   return evaluateDateTime(a.endDate, b.endDate, -1);
    // })
    .map((s) => {
      const company = s as ICompanyView;
      company.showingHighlights = false;
      return company;
    });

  constructor() {
    /**
     * Key the skill element by its lowercase name and all its aliases.
     * If there is a circular reference here between
     * name and the alias, then what ever is the last one encountered
     * will be keyed by the duplicated skill name.
     */
    for (const skill of this.resumeStore.skills) {
      // will overwrite dups
      this.skillByName.set(skill.name.toLowerCase(), skill);
      const aliases = skill.aliases ?? [];
      /**
       * when the alias is referenced in a job, it will be
       * displayed using this skill.
       */
      for (const alias of aliases) {
        // will overwrite dups
        this.skillByName.set(alias.toLowerCase(), skill);
      }
    }
  }

  binding() {
    this.showingEntireHistory = this.expanded;
  }

  get companiesFirst(): Array<ICompanyView> {
  return WhichResumeOnly.isShort
    ? this.companies.filter((c) => c.showOnShort)
    : this.companies.slice(0, this.entireHistoryStartIndex);
  }

  get companiesTheRest(): Array<ICompanyView> {
    return this.companies.slice(this.entireHistoryStartIndex);
  }

  companySkills(company: ICompany, _skillByName: Map<string, ISkill>): Array<ISkill> {
    return company.skills
      .map((name: string) => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.skillByName.get(name.toLowerCase())!;
      })
      .sort((a, b) => this.evaluateSkillName(a.name, b.name))
      .sort((a, b) => this.evaluateSkillPriority(a.priority, b.priority));
  }

  private evaluateSkillName(a: string, b: string, factor = 1) {
    if (!a && !b) {
      return 0;
    }

    if (!a) {
      return -factor;
    }
    if (!b) {
      return factor;
    }

    a = a.toLowerCase();
    b = b.toLowerCase();

    return a.localeCompare(b) * factor;
  }

  private evaluateSkillPriority(a: number, b: number, factor = 1) {
    /* whereever pririty is 0 or undefined, it goes last, otherwise is increasing */
    if (!a && !b) return -1;

    if (!a) return factor;
    if (!b) return -factor;

    return (a - b) * factor;
  }

  private toggleHighlights(company: ICompanyView): void {
    company.showingHighlights = !company.showingHighlights;
  }
}
