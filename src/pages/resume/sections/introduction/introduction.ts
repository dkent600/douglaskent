import { customElement, resolve } from "aurelia";

import { IBasics, IResumeStore } from "../../../../stores/resume-store";

import template from "./introduction.html";

@customElement({ name: "introduction", template })
export class Introduction {
  readonly resumeStore = resolve(IResumeStore);
  readonly basics: IBasics = this.resumeStore.basics;
}
