import { customElement } from "aurelia";

import { IQuality, IResumeStore } from "../../../../stores/resume-store";

import template from "./reasons.html";

@customElement({ name: "reasons", template })
export class Reasons {
  qualities!: Array<IQuality>;
  constructor(@IResumeStore private readonly resumeStore: IResumeStore) {
    this.qualities = this.resumeStore.qualities;
  }
}
