import { customElement, resolve } from "aurelia";

import { IQuality, IResumeStore } from "../../../../stores/resume-store";

import template from "./reasons.html";

@customElement({ name: "reasons", template })
export class Reasons {
  readonly resumeStore = resolve(IResumeStore);
  readonly qualities: Array<IQuality> = this.resumeStore.qualities;
}
