import { customElement } from "aurelia";

import { ICitizenship, ILanguage, IResumeStore } from "../../../stores/resume-store";

import template from "./travel.html";

@customElement({ name: "travel", template })
export class Travel {
  citizenship!: Array<ICitizenship>;
  languages!: Array<ILanguage>;
  constructor(@IResumeStore private readonly resumeStore: IResumeStore) {
    this.citizenship = this.resumeStore.citizenship;
    this.languages = this.resumeStore.languages;
  }
}
