import { bindable, customElement, resolve } from "aurelia";

import { IPublication, IResumeStore } from "../../../../stores/resume-store";

import template from "./publications.html";

@customElement({ name: "publications", template })
export class Publications {
  showingPublications = false;
  @bindable expanded = false;
  readonly resumeStore = resolve(IResumeStore);
  readonly publications: Array<IPublication> = this.resumeStore.publications;

  binding() {
    this.showingPublications = this.expanded;
  }

  toggleshowingPublications() {
    this.showingPublications = !this.showingPublications;
  }
}
