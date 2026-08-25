import { customElement } from "aurelia";

import { adminStore, type IEditableSkill } from "../admin-store";

import template from "./skills-editor.html";

@customElement({ name: "skills-editor", template })
export class SkillsEditor {
  readonly store = adminStore;

  filter = "";
  editing: IEditableSkill | null = null;

  get visible(): Array<IEditableSkill> {
    const needle = this.filter.trim().toLowerCase();
    if (!needle) {
      return this.store.skills;
    }
    return this.store.skills.filter(
      (skill) =>
        skill.name.toLowerCase().includes(needle) ||
        (skill.aliases ?? []).some((alias) => alias.toLowerCase().includes(needle)) ||
        skill.categories.some((category) => category.toLowerCase().includes(needle)),
    );
  }

  toggle(skill: IEditableSkill): void {
    this.editing = this.editing === skill ? null : skill;
  }

  add(): void {
    const skill: IEditableSkill = { name: "", priority: 1, categories: [], url: "" };
    this.store.skills.unshift(skill);
    this.editing = skill;
    this.store.touch();
  }

  /**
   * Deleting a skill a company still names would leave that company rendering nothing
   * for it, so the button reports the blockers instead of removing.
   */
  blockers(skill: IEditableSkill): Array<string> {
    return this.store.companiesUsingSkill(skill);
  }

  remove(skill: IEditableSkill): void {
    if (this.blockers(skill).length > 0) {
      return;
    }
    const at = this.store.skills.indexOf(skill);
    if (at >= 0) {
      this.store.skills.splice(at, 1);
      this.editing = null;
      this.store.touch();
    }
  }

  toggleCategory(skill: IEditableSkill, category: string): void {
    const at = skill.categories.indexOf(category);
    if (at >= 0) {
      skill.categories.splice(at, 1);
    } else {
      skill.categories.push(category);
    }
    this.store.touch();
  }

  addAlias(skill: IEditableSkill): void {
    (skill.aliases ??= []).push("");
    this.store.touch();
  }

  removeAlias(skill: IEditableSkill, index: number): void {
    skill.aliases?.splice(index, 1);
    this.store.touch();
  }
}
