import { customElement } from "aurelia";

import { IAccomplishment, IResumeStore } from "../../../../stores/resume-store";

import template from "./accomplishments.html";
@customElement({ name: "accomplishments", template })
export class Accomplishments {
  accomplishments!: Array<IAccomplishment>;
  constructor(@IResumeStore private readonly resumeStore: IResumeStore) {
    this.accomplishments = this.resumeStore.accomplishments;
  }
}
