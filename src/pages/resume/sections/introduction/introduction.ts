import { customElement } from "aurelia";

import { IBasics, IResumeStore } from "../../../../stores/resume-store";

import template from "./introduction.html";
@customElement({ name: "introduction", template })
export class Introduction {
  basics!: IBasics;
  constructor(@IResumeStore private readonly resumeStore: IResumeStore) {
    this.basics = this.resumeStore.basics;
  }
}
