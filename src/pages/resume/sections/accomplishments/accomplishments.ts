import { IAccomplishment, IResumeStore } from "../../../../stores/resume-store";
export class Accomplishments {
  accomplishments!: Array<IAccomplishment>;
  constructor(@IResumeStore private readonly resumeStore: IResumeStore) {
    this.accomplishments = this.resumeStore.accomplishments;
  }
}
