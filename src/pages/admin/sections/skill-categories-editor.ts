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

  /** The name as it was when the field gained focus. */
  private renamingFrom: string | null = null;

  renamedNote = "";
  blockedNote = "";

  /**
   * The old name has to be captured on focus, not read at blur. `value.bind="category"`
   * is two-way over the repeat local, so it writes each keystroke straight into
   * `store.categories` -- by blur the array already holds the new name, and reading the
   * "previous" value there just returns the new one.
   */
  beginRename(index: number): void {
    this.renamingFrom = this.store.categories[index];
    this.renamedNote = "";
    this.blockedNote = "";
  }

  /**
   * Categories are plain strings that skills reference by value, so a rename has to be
   * applied to every skill that names the old one or those references would dangle.
   */
  commitRename(index: number, raw: string): void {
    const previous = this.renamingFrom;
    this.renamingFrom = null;
    const name = raw.trim();
    if (previous === null || name === previous) {
      return;
    }
    if (!name) {
      this.store.categories.splice(index, 1, previous);
      this.blockedNote = "A category cannot be blank; the previous name has been restored.";
      return;
    }
    if (this.store.categories.some((category, at) => at !== index && category === name)) {
      this.store.categories.splice(index, 1, previous);
      this.blockedNote = `"${name}" already exists, so the rename was undone. Merge them by moving the skills instead.`;
      return;
    }
    this.store.categories.splice(index, 1, name);
    let changed = 0;
    for (const skill of this.store.skills) {
      for (let at = 0; at < skill.categories.length; at++) {
        if (skill.categories[at] === previous) {
          // splice rather than an index write, which Aurelia does not observe
          skill.categories.splice(at, 1, name);
          changed++;
        }
      }
    }
    this.store.touch();
    this.renamedNote = changed > 0 ? `Renamed "${previous}" to "${name}" in ${changed} skill${changed === 1 ? "" : "s"}.` : "";
  }

  /** `_revision` is unused; it exists so the binding re-evaluates. See `AdminStore.revision`. */
  users(category: string, _revision?: number): Array<string> {
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
