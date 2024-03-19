import { customElement } from "aurelia";

import { IPublication, IResumeStore } from "../../../stores/resume-store";

import template from "./publications.html";

@customElement({ name: "publications", template })
export class Publications {
  publications!: Array<IPublication>;
  showingPublications = false;

  constructor(@IResumeStore private readonly resumeStore: IResumeStore) {
    this.publications = this.resumeStore.publications;
  }

  attaching() {
    $("#publications-list").on("show.bs.collapse", () => {
      this.showingPublications = true;
    });
    $("#publications-list").on("hide.bs.collapse", () => {
      this.showingPublications = false;
    });
  }
}
