import { bindable, customElement, resolve } from "aurelia";

import { evaluateDateTime } from "../../../../services/utils";
import { IResumeStore, ISchool } from "../../../../stores/resume-store";

import template from "./education.html";

@customElement({ name: "education", template })
export class Education {
  readonly resumeStore = resolve(IResumeStore);
  readonly schools: Array<ISchool> = this.resumeStore.schools.sort((a, b) => {
    return evaluateDateTime(a.startDate, b.startDate, -1);
  });
}
