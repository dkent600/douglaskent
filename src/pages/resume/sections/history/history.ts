import { bindable, customElement, resolve } from "aurelia";

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
  /**
   * How far down the open list the toggle sits. Purely the link's placement -- it says
   * nothing about which companies are recent history; `showOnShort` does that.
   */
  readonly toggleAfterIndex = 7;
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

  /**
   * The companies above the "Show the whole history" toggle.
   *
   * Closed, that is the recent-history selection, `showOnShort` -- the same selection the
   * short resume makes, so the complete resume opens on the same companies the short one
   * shows. Open, it is the first `toggleAfterIndex` companies, which is what keeps the
   * toggle where it has always sat: partway down rather than below the whole history,
   * where collapsing again would mean scrolling past all of it.
   *
   * The two cannot be the same rule. `showOnShort` is a filter over the full list, not a
   * prefix of it, so once every company is on the page the recent ones are scattered
   * through it and there is no one position that follows them. Splitting the open list by
   * the flag instead would put the toggle after the highest priorty, but only by reordering
   * the history around it, which is a worse trade than a positional cut.
   *
   * `WhichResumeOnly.isShort` is not consulted here: the short resume never shows the
   * toggle, so `showingEntireHistory` stays false there and it gets the closed list.
   */
  get companiesAboveToggle(): Array<ICompanyView> {
    return this.showingEntireHistory ? this.companies.slice(0, this.toggleAfterIndex) : this.companies.filter((c) => c.showOnShort);
  }

  /**
   * Empty when closed, so the companies the page is not showing are not in the DOM at all
   * rather than present and hidden by a collapse.
   */
  get companiesBelowToggle(): Array<ICompanyView> {
    return this.showingEntireHistory ? this.companies.slice(this.toggleAfterIndex) : [];
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
