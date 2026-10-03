import { customElement, ILogger, resolve } from "aurelia";

import template from "./admin.html";
import { adminStore } from "./admin-store";
import { linkedInStore } from "./linkedin-store";
import * as adminComponents from "./sections";

import "./admin.scss";

type Tab = "basics" | "companies" | "skills" | "priorities" | "categories" | "linkedin";

/**
 * The editors are local `dependencies`, not registered in `main.ts` the way the resume
 * sections are. Aurelia registers these into the Admin element's own container when an
 * Admin is created, so nothing happens until `/admin` is first browsed to -- and since
 * this module is reached only through the route's dynamic `import()`, registering them
 * from `main.ts` would also pull them into the production bundle.
 */
@customElement({
  name: "admin",
  template,
  dependencies: [adminComponents],
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
   * Saving writes a file the browser cannot recover, so warn before losing edits. The
   * LinkedIn tab autosaves its own edits, so it only needs the guard inside the debounce
   * window, while a write is still pending.
   */
  handleEvent(event: BeforeUnloadEvent): void {
    if (this.store.dirty || linkedInStore.draftPending) {
      event.preventDefault();
    }
  }

  show(tab: Tab): void {
    this.tab = tab;
  }
}
