import { ICitizenship, IResumeStore } from "../../../../stores/resume-store";
export class Citizenship {
  citizenship!: Array<ICitizenship>;
  constructor(@IResumeStore private readonly resumeStore: IResumeStore) {
    this.citizenship = this.resumeStore.citizenship;
  }
}
