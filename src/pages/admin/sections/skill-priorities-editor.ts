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

/**
 * The number with the fewest decimal places strictly between `low` and `high`, rounded
 * toward their midpoint: 1 and 2 give 1.5, 4.3 and 4.31 give 4.305. A plain midpoint
 * would be just as correct, but after a few moves it leaves priorities like 4.30625 that
 * nobody wants to read or type. Null when there is no room, which means the two are equal.
 */
function between(low: number, high: number): number | null {
  const mid = (low + high) / 2;
  for (let places = 0; places <= 12; places++) {
    const candidate = Number(mid.toFixed(places));
    if (candidate > low && candidate < high) {
      return candidate;
    }
  }
  return null;
}

@customElement({ name: "skill-priorities-editor", template })
export class SkillPrioritiesEditor {
  readonly store = adminStore;

  /**
   * The category picked in the drop-down. `null` is every skill; `""` is the ones in no
   * category listed under Categories -- a skill with none, or with only categories that
   * are not in `skillCategories` (which the skills tab already warns about). A category
   * name cannot be empty, so `""` cannot collide with one.
   */
  category: string | null = null;

  /**
   * Bumped on blur and on a move, and nowhere else. The list is sorted by priority, so
   * re-sorting on every keystroke would slide the row out from under the cursor while it
   * is being edited; passing this as an argument is what defers the move to losing focus.
   * It is deliberately not `store.revision`, which changes on every keystroke.
   */
  sortRevision = 0;

  /** The scrolling list, which a move scrolls so the moved row stays put. See `nudge`. */
  listEl?: HTMLElement;

  /**
   * `filter` before `sort`, so the copy is what gets ordered and `store.skills` keeps the
   * order the document is written in.
   *
   * `_sortRevision` is unused; it exists so the binding re-evaluates. Note that this reads
   * `store.skills` in the body, which Aurelia does not track -- adding or deleting a skill
   * on another tab is picked up when this one is next opened, since the tab is destroyed
   * and rebuilt on every switch.
   */
  rows(category: string | null, _sortRevision?: number): Array<IEditableSkill> {
    const known = this.store.categories;
    const skills =
      category === null
        ? [...this.store.skills]
        : category === ""
          ? this.store.skills.filter((skill) => !skill.categories.some((name) => known.includes(name)))
          : this.store.skills.filter((skill) => skill.categories.includes(category));
    return skills.sort(byPriorityThenName);
  }

  /**
   * The input is put back in step with the model first, so a box that was emptied and
   * left shows the value it kept rather than staying blank.
   */
  commit(skill: IEditableSkill, input: HTMLInputElement): void {
    input.value = String(skill.priority);
    this.sortRevision++;
  }

  // ------------------------------------------------------------- moving

  /** Feedback after a move. */
  movedNote = "";

  /**
   * The skill last moved by an arrow or a drop, highlighted so the eye can follow it. It
   * stays lit until a different skill is moved. Typing a new priority does not light it.
   */
  lastMoved: IEditableSkill | null = null;

  /**
   * The ↑ and ↓ buttons: one step past the neighbour on that side.
   *
   * The row is then held where it was on screen and the list scrolled under it instead,
   * so the arrow just clicked is still under the pointer and can be clicked again. The
   * repeater keeps each row's element across a re-sort, so it can be measured on both
   * sides of the move. Bumping `sortRevision` re-sorts the repeater synchronously, so the
   * second measurement can follow straight on, before anything is painted.
   *
   * Not `requestAnimationFrame`: it never fires while the page is not being drawn, as in
   * a hidden browser pane, and then the row simply slid away.
   */
  nudge(skill: IEditableSkill, delta: -1 | 1, event: MouseEvent): void {
    const order = this.rows(this.category);
    const neighbour = order[order.indexOf(skill) + delta];
    if (!neighbour) {
      return;
    }
    const row = (event.currentTarget as HTMLElement).closest("li");
    const before = row?.getBoundingClientRect().top;
    this.place(skill, neighbour, delta > 0);
    if (row && before !== undefined && this.listEl) {
      this.listEl.scrollTop += row.getBoundingClientRect().top - before;
    }
  }

  /**
   * Puts `skill` just before or after `target` in the list as filtered by giving it a
   * priority between its new neighbours'. Only the moved skill's priority changes, so no
   * other skill moves anywhere. The moved skill itself can, though: it has one priority,
   * shared by every category it is in, so the note says where else to look.
   */
  place(skill: IEditableSkill, target: IEditableSkill, after: boolean): void {
    if (skill === target) {
      return;
    }
    const rest = this.rows(this.category).filter((other) => other !== skill);
    const at = rest.indexOf(target) + (after ? 1 : 0);
    const low = at > 0 ? rest[at - 1].priority : undefined;
    const high = at < rest.length ? rest[at].priority : undefined;

    let priority: number | null;
    if (low === undefined) {
      // Top of the list. Above zero, because a falsy priority sorts last.
      priority = high === undefined ? null : between(0, high);
    } else if (high === undefined) {
      priority = Math.floor(low) + 1;
    } else {
      priority = between(low, high);
    }

    if (priority === null) {
      this.movedNote = `No priority fits between ${low} and ${high}, because those two skills share it. Give one of them a different value first.`;
      return;
    }
    skill.priority = priority;
    this.store.touch();
    this.lastMoved = skill;
    this.sortRevision++;

    const elsewhere = this.category ? skill.categories.filter((other) => other !== this.category && this.store.categories.includes(other)) : [];
    this.movedNote = `${skill.name} is now ${priority}.` + (elsewhere.length ? ` It is also in ${elsewhere.join(", ")}, so it may have moved there too.` : "");
  }

  /** Drag and drop, within the list as currently filtered. */
  dragSkill: IEditableSkill | null = null;

  /** The row under the pointer, and which side of it the dragged one would land on. */
  dropSkill: IEditableSkill | null = null;
  dropAfter = false;

  dragStart(skill: IEditableSkill, event: DragEvent): void {
    this.dragSkill = skill;
    if (event.dataTransfer) {
      // Firefox will not start a drag that carries no data.
      event.dataTransfer.setData("text/plain", skill.name);
      event.dataTransfer.effectAllowed = "move";
    }
  }

  /** Not calling `preventDefault` is how a row refuses a drop. */
  dragOver(skill: IEditableSkill, event: DragEvent): void {
    if (!this.dragSkill || skill === this.dragSkill) {
      this.dropSkill = null;
      return;
    }
    event.preventDefault();
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.dropSkill = skill;
    this.dropAfter = event.clientY > box.top + box.height / 2;
  }

  /** `dragleave` also fires on moving onto the row's own name or number, so those are ignored. */
  dragLeave(skill: IEditableSkill, event: DragEvent): void {
    const row = event.currentTarget as HTMLElement;
    if (this.dropSkill === skill && !row.contains(event.relatedTarget as Node | null)) {
      this.dropSkill = null;
    }
  }

  drop(skill: IEditableSkill, event: DragEvent): void {
    event.preventDefault();
    if (this.dragSkill) {
      this.place(this.dragSkill, skill, this.dropAfter);
    }
    this.dragEnd();
  }

  dragEnd(): void {
    this.dragSkill = null;
    this.dropSkill = null;
  }
}
