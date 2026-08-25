import { customElement } from "aurelia";

import { adminStore } from "../admin-store";

import template from "./skill-categories-editor.html";

@customElement({ name: "skill-categories-editor", template })
export class SkillCategoriesEditor {
  readonly store = adminStore;

  added = "";

  add(): void {
    const name = this.added.trim();
    if (!name || this.store.categories.includes(name)) {
      return;
    }
    this.store.categories.push(name);
    this.added = "";
    this.store.touch();
  }

  /**
   * Categories are plain strings that skills reference by value, so a rename has to be
   * applied to every skill that names the old one or those references would dangle.
   */
  rename(index: number, next: string): void {
    const previous = this.store.categories[index];
    const name = next.trim();
    if (!name || name === previous || this.store.categories.includes(name)) {
      return;
    }
    this.store.categories.splice(index, 1, name);
    for (const skill of this.store.skills) {
      const at = skill.categories.indexOf(previous);
      if (at >= 0) {
        skill.categories.splice(at, 1, name);
      }
    }
    this.store.touch();
  }

  users(category: string): Array<string> {
    return this.store.skillsUsingCategory(category);
  }

  remove(index: number): void {
    if (this.users(this.store.categories[index]).length > 0) {
      return;
    }
    this.store.categories.splice(index, 1);
    this.store.touch();
  }

  move(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= this.store.categories.length) {
      return;
    }
    const [category] = this.store.categories.splice(index, 1);
    this.store.categories.splice(target, 0, category);
    this.store.touch();
  }
}
