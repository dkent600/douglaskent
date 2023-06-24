import { bindable, customElement } from "aurelia";

import { ICompany, IResumeStore, ISkill } from "../../../../stores/resume-store";

import template from "./history.html";

@customElement({ name: "history", template })
export class History {
  companies!: Array<ICompany>;
  @bindable skillByName!: Map<string, ISkill>;

  constructor(@IResumeStore private readonly resumeStore: IResumeStore) {
    this.companies = this.resumeStore.companies
      // .sort((a, b) => {
      //   return evaluateDateTime(a.endDate, b.endDate, -1);
      // })
      .map((s, _index) => {
        s.showingHighlights = false;
        return s;
      });
  }

  companySkills(company: ICompany): Array<ISkill> {
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

  private toggleHighlights(company: ICompany): void {
    company.showingHighlights = !company.showingHighlights;
  }
}
