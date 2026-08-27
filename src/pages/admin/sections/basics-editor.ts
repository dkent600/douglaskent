import { customElement } from "aurelia";

import { adminStore } from "../admin-store";

import template from "./basics-editor.html";

/** `summary1`, `summary2`, ... -- the paragraphs the resume templates name by number. */
const SUMMARY = /^summary(\d+)$/;

@customElement({ name: "basics-editor", template })
export class BasicsEditor {
  readonly store = adminStore;

  /** Second click confirms a profile delete, so there is no modal to build. */
  confirmingDelete: number | null = null;

  // ---------------------------------------------------------------- summaries

  /**
   * How many `summaryN` slots to render, counted from the highest number present so a
   * gap in the numbering still shows every paragraph that exists.
   *
   * Returns the count rather than the list of keys so the repeater survives typing:
   * `store.revision` changes on every keystroke, and a binding re-renders only when the
   * bound value actually differs, which an unchanged number does not -- where a freshly
   * built array of the same keys would be a new object every time. `_revision` is
   * unused; it exists so the binding re-evaluates at all. See `AdminStore.revision`.
   */
  summaryCount(_revision?: number): number {
    let highest = 0;
    for (const key of Object.keys(this.store.basics)) {
      const match = SUMMARY.exec(key);
      if (match) {
        highest = Math.max(highest, Number(match[1]));
      }
    }
    return highest;
  }

  addSummary(): void {
    this.store.basics[`summary${this.summaryCount() + 1}`] = "";
    this.store.touch();
  }

  /**
   * Only the last slot, and only once it has been emptied. The templates reference these
   * individually (`basics.summary4`), so dropping one from the middle would renumber
   * every paragraph after it and silently move their text into another section.
   */
  canRemoveSummary(_revision?: number): boolean {
    const count = this.summaryCount();
    return count > 0 && !String(this.store.basics[`summary${count}`] ?? "").trim();
  }

  removeSummary(): void {
    if (!this.canRemoveSummary()) {
      return;
    }
    // `Reflect.deleteProperty` rather than `delete`: the key is computed, which the lint forbids.
    Reflect.deleteProperty(this.store.basics, `summary${this.summaryCount()}`);
    this.store.touch();
  }

  // ----------------------------------------------------------------- profiles

  requestDelete(index: number): void {
    this.confirmingDelete = this.confirmingDelete === index ? null : index;
  }

  confirmDelete(index: number): void {
    this.store.deleteProfile(index);
    this.confirmingDelete = null;
  }
}
