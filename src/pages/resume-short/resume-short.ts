import { customElement } from "aurelia";

import template from "./resume-short.html";

import { Resume } from "../resume/resume";
import { IResumeStore } from "../../stores/resume-store";

@customElement({ name: "resumeshort", template })
export class ResumeShort extends Resume {
  constructor(@IResumeStore resumeStore: IResumeStore) {
    super(resumeStore);
  }
}
