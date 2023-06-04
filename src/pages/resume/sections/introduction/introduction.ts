import { IBasics, IResumeStore } from "../../../../stores/resume-store";
export class Introduction {
  basics!: IBasics;
  constructor(@IResumeStore private readonly resumeStore: IResumeStore) {
    this.basics = this.resumeStore.basics;
  }
}
