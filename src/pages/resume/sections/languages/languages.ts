import { customElement } from "aurelia";

import { ILanguage, IResumeStore } from "../../../../stores/resume-store";

import template from "./languages.html";

@customElement({ name: "languages", template })
export class Languages {
  languages!: Array<ILanguage>;
  constructor(@IResumeStore private readonly resumeStore: IResumeStore) {
    this.languages = this.resumeStore.languages;
  }
}
