import { bindable, customElement } from "aurelia";

import { evaluateDateTime } from "../../../services/utils";
import { IResumeStore, ISchool } from "../../../stores/resume-store";

import template from "./education.html";

@customElement({ name: "education", template })
export class Education {
  schools!: Array<ISchool>;
  constructor(@IResumeStore private readonly resumeStore: IResumeStore) {
    this.schools = this.resumeStore.schools.sort((a, b) => {
      return evaluateDateTime(a.startDate, b.startDate, -1);
    });
  }
}
