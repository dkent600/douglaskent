import { IQuality, IResumeStore } from "../../../../stores/resume-store";
export class Reasons {
  qualities!: Array<IQuality>;
  constructor(@IResumeStore private readonly resumeStore: IResumeStore) {
    this.qualities = this.resumeStore.qualities;
  }
}
