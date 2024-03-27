import { bindable, customElement } from "aurelia";

import { IBasics, ICitizenship, ILanguage, IResumeStore } from "../../../stores/resume-store";

import template from "./travel.html";

@customElement({ name: "travel", template })
export class Travel {
  citizenship!: Array<ICitizenship>;
  basics!: IBasics;
  languages!: Array<ILanguage>;
  constructor(@IResumeStore private readonly resumeStore: IResumeStore) {
    this.citizenship = this.resumeStore.citizenship;
    this.languages = this.resumeStore.languages;
    this.basics = this.resumeStore.basics;
  }
}
