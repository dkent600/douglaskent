import { customElement } from "aurelia";

import { ICitizenship, IResumeStore } from "../../../../stores/resume-store";

import template from "./citizenship.html";

@customElement({ name: "citizenship", template })
export class Citizenship {
  citizenship!: Array<ICitizenship>;
  constructor(@IResumeStore private readonly resumeStore: IResumeStore) {
    this.citizenship = this.resumeStore.citizenship;
  }
}
