import { customElement, resolve } from "aurelia";

import { IBasics, ICitizenship, ILanguage, IResumeStore } from "../../../../stores/resume-store";

import template from "./travel.html";

@customElement({ name: "travel", template })
export class Travel {
  readonly resumeStore = resolve(IResumeStore);
  readonly languages: Array<ILanguage> = this.resumeStore.languages;
  readonly basics: IBasics = this.resumeStore.basics;
  readonly citizenship: Array<ICitizenship> = this.resumeStore.citizenship;
}
