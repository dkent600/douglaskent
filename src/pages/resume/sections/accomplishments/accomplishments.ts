import { customElement, resolve } from "aurelia";
import { IAccomplishment, IResumeStore } from "../../../../stores/resume-store";
import { WhichResumeOnly } from "../../../../resources/attributes/whichResumeOnly";

import template from "./accomplishments.html";
@customElement({ name: "accomplishments", template })
export class Accomplishments {
  readonly resumeStore = resolve(IResumeStore);
  private readonly all: Array<IAccomplishment> = this.resumeStore.accomplishments;

  get accomplishments(): Array<IAccomplishment> {
    return WhichResumeOnly.isShort ? this.all.filter((a) => a.showOnShort) : this.all;
  }
}
