import { bindable, customElement } from "aurelia";

import { IPublication, IResumeStore } from "../../../../stores/resume-store";

import template from "./publications.html";

@customElement({ name: "publications", template })
export class Publications {
  publications!: Array<IPublication>;
  showingPublications = false;
  @bindable expanded = false;

  constructor(@IResumeStore private readonly resumeStore: IResumeStore) {
    this.publications = this.resumeStore.publications;
  }

  binding() {
    this.showingPublications = this.expanded;
  }

  toggleshowingPublications() {
    this.showingPublications = !this.showingPublications;
  }
}
