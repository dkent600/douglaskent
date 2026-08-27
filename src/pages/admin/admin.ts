import { customElement, ILogger, resolve } from "aurelia";

import { BasicsEditor } from "./sections/basics-editor";
import { CompaniesEditor } from "./sections/companies-editor";
import { SkillCategoriesEditor } from "./sections/skill-categories-editor";
import { SkillsEditor } from "./sections/skills-editor";
import template from "./admin.html";
import { adminStore } from "./admin-store";

import "./admin.scss";

type Tab = "basics" | "companies" | "skills" | "categories";

@customElement({
  name: "admin",
  template,
  dependencies: [BasicsEditor, CompaniesEditor, SkillsEditor, SkillCategoriesEditor],
})
export class Admin {
  readonly store = adminStore;
  tab: Tab = "companies";

  constructor() {
    this.store.useLogger(resolve(ILogger).scopeTo("Admin"));
  }

  binding(): Promise<void> {
    return this.store.load();
  }

  attached(): void {
    window.addEventListener("beforeunload", this);
  }

  detaching(): void {
    window.removeEventListener("beforeunload", this);
  }

  /**
   * Saving writes a file the browser cannot recover, so warn before losing edits.
   */
  handleEvent(event: BeforeUnloadEvent): void {
    if (this.store.dirty) {
      event.preventDefault();
    }
  }

  show(tab: Tab): void {
    this.tab = tab;
  }
}
