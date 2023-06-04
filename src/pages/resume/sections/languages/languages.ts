import { ILanguage, IResumeStore } from "../../../../stores/resume-store";
export class Languages {
  languages!: Array<ILanguage>;
  constructor(@IResumeStore private readonly resumeStore: IResumeStore) {
    this.languages = this.resumeStore.languages;
  }
}
