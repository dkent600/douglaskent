import { bindable, customElement } from "aurelia";

import { ICategory, IResumeStore, ISkill } from "../../../../stores/resume-store";

import template from "./skills.html";

@customElement({ name: "skills", template })
export class Skills {
  /**
   * Map a category of skills to a set of skill names.
   */
  categoryToSkills = new Map<string, Set<ISkill>>();
  skillCategories!: Array<ICategory>;
  @bindable skillByName!: Map<string, ISkill>;

  constructor(@IResumeStore private readonly resumeStore: IResumeStore) {
    this.skillCategories = this.resumeStore.skillCategories;
  }

  binding() {
    /**
     * Key skills in a category by the keyword that they have in common.
     * "Hide" means don't show among the categories, but the
     * item can still show up under jobs.
     *
     * An alias does not need to have its own element in json.
     * But if you want something to show up as its own pill, it
     * needs its own json element.
     */

    /**
     * collect the skills associated with each skill category,
     * sorted in the order they appear in the json
     */
    for (const skill of this.resumeStore.skills
      .filter((s) => !s.hide)
      .sort((a, b) => this.evaluateSkillName(a.name, b.name))
      .sort((a, b) => this.evaluateSkillPriority(a.priority, b.priority))) {
      for (const keyword of skill.categories) {
        let skillCategory = this.categoryToSkills.get(keyword);
        if (!skillCategory) {
          // if (!this.keywords.find((s) => s === keyword)) {
          //   // this.categories.push(`${keyword} [not in keywords list!]`);
          //   console.log(`!!! ${keyword} is not in keywords list!`);
          // }
          skillCategory = new Set<ISkill>();
          this.categoryToSkills.set(keyword, skillCategory);
        }
        skillCategory.add(skill);
      }
    }
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
}
