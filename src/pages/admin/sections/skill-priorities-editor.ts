import { customElement } from "aurelia";

import { adminStore, type IEditableSkill } from "../admin-store";

import template from "./skill-priorities-editor.html";

/**
 * Mirrors the `evaluateSkillPriority`/`evaluateSkillName` pair that both
 * `src/pages/resume/sections/skills/skills.ts` and `.../history/history.ts` carry: sort by
 * name, then stably by priority -- so ascending priority, ties alphabetical, and a falsy
 * priority last. The point of this tab is to show the resume's own order, so they have to
 * agree.
 *
 * Nothing here filters on `hide`. It only keeps a skill out of the categorised pills;
 * `History.companySkills` does not consult it, so priority still orders that skill among
 * the pills under every job it is listed on. A priority set here is live either way.
 */
function byPriorityThenName(a: IEditableSkill, b: IEditableSkill): number {
  if (a.priority && b.priority && a.priority !== b.priority) {
    return a.priority - b.priority;
  }
  if (!a.priority !== !b.priority) {
    return a.priority ? -1 : 1;
  }
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
}

@customElement({ name: "skill-priorities-editor", template })
export class SkillPrioritiesEditor {
  readonly store = adminStore;

  /**
   * Bumped on blur and nowhere else. The groups are sorted by priority, so re-sorting on
   * every keystroke would slide the pill out from under the cursor while it is being
   * edited; passing this as an argument is what defers the move to losing focus. It is
   * deliberately not `store.revision`, which changes on every keystroke.
   */
  sortRevision = 0;

  /**
   * `filter` before `sort`, so the copy is what gets ordered and `store.skills` keeps the
   * order the document is written in.
   *
   * `_sortRevision` is unused; it exists so the binding re-evaluates. Note that this reads
   * `store.skills` in the body, which Aurelia does not track -- adding or deleting a skill
   * on another tab is picked up when this one is next opened, since the tab is destroyed
   * and rebuilt on every switch.
   */
  skillsIn(category: string, _sortRevision?: number): Array<IEditableSkill> {
    return this.store.skills.filter((skill) => skill.categories.includes(category)).sort(byPriorityThenName);
  }

  /**
   * Anything the category loop above would miss, so that "every skill is a pill" stays
   * true even when the data drifts -- a skill with no categories, or with only categories
   * that are not in `skillCategories` (which the skills tab already warns about).
   */
  uncategorised(_sortRevision?: number): Array<IEditableSkill> {
    return this.store.skills.filter((skill) => !skill.categories.some((category) => this.store.categories.includes(category))).sort(byPriorityThenName);
  }

  /**
   * Re-sorts every group, not just this one: a skill in several categories has a pill in
   * each, and they all show the one underlying value.
   *
   * The input is put back in step with the model first, so a box that was emptied and
   * left shows the value it kept rather than staying blank.
   */
  commit(skill: IEditableSkill, input: HTMLInputElement): void {
    input.value = String(skill.priority);
    this.sortRevision++;
  }
}
