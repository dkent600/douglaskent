import { customElement } from "aurelia";

import { adminStore, type IEditableSkill } from "../admin-store";

import template from "./skills-editor.html";

@customElement({ name: "skills-editor", template })
export class SkillsEditor {
  readonly store = adminStore;

  /** What is typed in the box, which is not necessarily what is being filtered on. */
  filter = "";

  /** The filter actually in force. Only `applyFilter` changes it. */
  applied = "";

  /**
   * Bumped only when `applied` changes, and passed to `visible` as an argument -- which is
   * the entire point of `visible` being a method rather than the getter it used to be.
   * Aurelia tracks what a getter reads, so the old one re-ran the moment any name it had
   * read changed: renaming a skill re-filtered the list mid-keystroke and tore out the very
   * row being typed in. A method call is re-evaluated only when its arguments change, so
   * now nothing but an actual apply can rebuild the list.
   */
  applyRevision = 0;

  editing: IEditableSkill | null = null;

  /**
   * Deliberately not called as you type. The list is the thing being edited in, so
   * re-filtering under the cursor destroys the open row; this runs on blur, and Enter
   * blurs the box so that applies too.
   */
  applyFilter(): void {
    const applied = this.filter.trim().toLowerCase();
    if (applied === this.applied) {
      return;
    }
    this.applied = applied;
    this.applyRevision++;
  }

  /**
   * Unfiltered, this hands back `store.skills` itself rather than a copy, so the repeater
   * observes the array and an add or delete shows up without an apply. Filtered, it is a
   * snapshot -- which is why `add` and `remove` bump `applyRevision` themselves.
   *
   * `_applyRevision` is unused; it exists so the binding re-evaluates. See `applyRevision`.
   */
  visible(_applyRevision?: number): Array<IEditableSkill> {
    const needle = this.applied;
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

  /** The name as it was when the field gained focus, so a rename knows what to cascade. */
  private renamingFrom: string | null = null;

  /** Feedback after a cascade, so the knock-on edit is visible rather than silent. */
  renamedNote = "";

  /** Why a removal was refused. */
  blockedNote = "";

  toggle(skill: IEditableSkill): void {
    this.editing = this.editing === skill ? null : skill;
    this.renamedNote = "";
    this.blockedNote = "";
  }

  beginRename(skill: IEditableSkill): void {
    this.renamingFrom = skill.name;
  }

  /**
   * Runs on blur rather than on every keystroke: mid-typing values like "DeFi" -> "Def"
   * would otherwise each cascade in turn and scramble the references.
   */
  commitRename(skill: IEditableSkill): void {
    const from = this.renamingFrom;
    this.renamingFrom = null;
    const to = skill.name;
    if (from === null || from === to || !from.trim() || !to.trim()) {
      return;
    }
    const count = this.store.renameSkillReferences(from, to);
    this.renamedNote = count > 0 ? `Renamed "${from}" to "${to}" in ${count} company reference${count === 1 ? "" : "s"}.` : "";
  }

  add(): void {
    const skill: IEditableSkill = { name: "", priority: 1, categories: [], url: "" };
    this.store.skills.unshift(skill);
    this.editing = skill;
    this.store.touch();
    /**
     * A new skill has no name yet, so it matches no filter and would be added straight out
     * of sight. Clearing the box is what makes the row it opens for editing reachable.
     */
    this.filter = "";
    this.applyFilter();
  }

  /**
   * Deleting a skill a company still names would leave that company rendering nothing
   * for it, so the button reports the blockers instead of removing.
   */
  blockers(skill: IEditableSkill, _revision?: number): Array<string> {
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
      // A filtered `visible` is a snapshot, so the splice is not observed; force the rebuild.
      this.applyRevision++;
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

  /**
   * Aliases are referenced by companies exactly as names are, so renaming one has to
   * cascade too. Captured on focus and applied on blur, for the same reason as the name.
   */
  beginAliasRename(skill: IEditableSkill, index: number): void {
    this.renamingFrom = skill.aliases?.[index] ?? null;
  }

  commitAliasRename(skill: IEditableSkill, index: number): void {
    const from = this.renamingFrom;
    this.renamingFrom = null;
    const to = skill.aliases?.[index];
    if (from === null || to === undefined || from === to || !from.trim() || !to.trim()) {
      return;
    }
    const count = this.store.renameSkillReferences(from, to);
    this.renamedNote = count > 0 ? `Renamed alias "${from}" to "${to}" in ${count} company reference${count === 1 ? "" : "s"}.` : "";
  }

  addAlias(skill: IEditableSkill): void {
    (skill.aliases ??= []).push("");
    this.store.touch();
  }

  /** Companies that reference this alias. Removing it would leave them dangling. */
  aliasBlockers(skill: IEditableSkill, index: number, _revision?: number): Array<string> {
    const alias = skill.aliases?.[index];
    return alias === undefined ? [] : this.store.companiesUsingName(alias);
  }

  /**
   * The button is also disabled when this would refuse, but that binding is a method call
   * and so is only re-evaluated when its arguments change -- a rename cascade elsewhere on
   * the page can leave it stale. This check runs at click time and is the authoritative one.
   */
  removeAlias(skill: IEditableSkill, index: number): void {
    const blockers = this.aliasBlockers(skill, index);
    if (blockers.length > 0) {
      this.blockedNote = `"${skill.aliases?.[index] ?? ""}" is still referenced by ${blockers.join(", ")}. Remove it from those companies first, or rename it instead.`;
      return;
    }
    this.blockedNote = "";
    skill.aliases?.splice(index, 1);
    this.store.touch();
  }
}
