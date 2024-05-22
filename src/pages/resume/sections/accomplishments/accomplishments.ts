import { customElement, resolve } from "aurelia";

import { IAccomplishment, IResumeStore } from "../../../../stores/resume-store";

import template from "./accomplishments.html";
@customElement({ name: "accomplishments", template })
export class Accomplishments {
  readonly resumeStore = resolve(IResumeStore);
  readonly accomplishments: Array<IAccomplishment> = this.resumeStore.accomplishments; 
}
