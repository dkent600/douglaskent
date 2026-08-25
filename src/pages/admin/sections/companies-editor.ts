import { customElement } from "aurelia";

import { adminStore, type IEditableCompany } from "../admin-store";

import template from "./companies-editor.html";

@customElement({ name: "companies-editor", template })
export class CompaniesEditor {
  readonly store = adminStore;

  /** Index of the row open for editing; only one at a time, given 34 of them. */
  editing: number | null = null;

  /** Second click confirms a delete, so there is no modal to build. */
  confirmingDelete: number | null = null;

  toggle(index: number): void {
    this.editing = this.editing === index ? null : index;
    this.confirmingDelete = null;
  }

  add(): void {
    this.store.addCompany();
    this.editing = 0;
    this.confirmingDelete = null;
  }

  duplicate(index: number): void {
    this.store.duplicateCompany(index);
    this.editing = index + 1;
  }

  requestDelete(index: number): void {
    this.confirmingDelete = this.confirmingDelete === index ? null : index;
  }

  confirmDelete(index: number): void {
    this.store.deleteCompany(index);
    this.confirmingDelete = null;
    this.editing = null;
  }

  move(index: number, delta: number): void {
    this.store.moveCompany(index, delta);
    this.editing = this.editing === index ? index + delta : this.editing;
  }

  moveToTop(index: number): void {
    this.store.moveCompanyToTop(index);
    this.editing = this.editing === index ? 0 : this.editing;
  }

  // ------------------------------------------------------------- highlights

  addHighlight(company: IEditableCompany): void {
    (company.highlights ??= []).push("");
    this.store.touch();
  }

  removeHighlight(company: IEditableCompany, index: number): void {
    company.highlights?.splice(index, 1);
    this.store.touch();
  }

  moveHighlight(company: IEditableCompany, index: number, delta: number): void {
    const highlights = company.highlights;
    if (!highlights) {
      return;
    }
    const target = index + delta;
    if (target < 0 || target >= highlights.length) {
      return;
    }
    const [highlight] = highlights.splice(index, 1);
    highlights.splice(target, 0, highlight);
    this.store.touch();
  }

  // ----------------------------------------------------------------- skills

  /**
   * `work[].skills` are names the resume resolves against the skill list, so they are
   * only ever chosen from that list rather than typed.
   */
  toggleSkill(company: IEditableCompany, name: string): void {
    const skills = (company.skills ??= []);
    const at = skills.findIndex((existing) => existing.toLowerCase() === name.toLowerCase());
    if (at >= 0) {
      skills.splice(at, 1);
    } else {
      skills.push(name);
    }
    this.store.touch();
  }

  /**
   * Called from the template inside an array lambda rather than on its own: the array
   * drives re-evaluation, this only decides the answer.
   */
  isKnown(name: string): boolean {
    return this.store.skillsByKey.has(name.toLowerCase());
  }

  removeSkill(company: IEditableCompany, name: string): void {
    const skills = company.skills ?? [];
    const at = skills.indexOf(name);
    if (at >= 0) {
      skills.splice(at, 1);
      this.store.touch();
    }
  }

  summarise(company: IEditableCompany): string {
    const dates = [company.startDate, company.endDate].filter(Boolean).join(" – ");
    return dates || "no dates";
  }
}
