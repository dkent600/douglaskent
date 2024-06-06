import { customElement, resolve } from "aurelia";

import { ILanguage, IResumeStore } from "../../../../stores/resume-store";

import template from "./languages.html";

@customElement({ name: "languages", template })
export class Languages {
  readonly resumeStore = resolve(IResumeStore);
  readonly languages: Array<ILanguage> = this.resumeStore.languages;
}
