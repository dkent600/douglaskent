import { customElement, resolve } from "aurelia";

import { ICitizenship, IResumeStore } from "../../../../stores/resume-store";

import template from "./citizenship.html";

@customElement({ name: "citizenship", template })
export class Citizenship {
  readonly resumeStore = resolve(IResumeStore);
  readonly citizenship: Array<ICitizenship> = this.resumeStore.citizenship;
}
