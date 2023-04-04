import { DI, IContainer, Registration } from "aurelia";

import { IResume, ResumeJson } from "./resume-service";

export type ISkill = IResume["skills"][0];
export type IBasics = IResume["basics"];
export type ILanguage = IResume["languages"][0];
export type IProfile = IResume["basics"]["profiles"][0];
export type ICitizenship = IResume["citizenship"][0];
export type ICompany = IResume["work"][0];
export type ISchool = IResume["education"][0];
export type ITestimonial = IResume["references"][0];
export type IAccomplishment = IResume["accomplishments"][0];
export type IQuality = IResume["qualities"][0];
export type IPublication = IResume["publications"][0];
export type ICategory = IResume["keywords"][0];

export type IResumeStore = ResumeStore;
export const IResumeStore = DI.createInterface<IResumeStore>();

export class ResumeStore {
  public static register(container: IContainer): void {
    container.register(Registration.singleton(IResumeStore, ResumeStore));
  }

  private get resumeJson(): IResume {
    return ResumeJson;
  }

  public get skills(): Array<ISkill> {
    return this.resumeJson.skills;
  }

  public get basics(): IBasics {
    return this.resumeJson.basics;
  }

  public get languages(): Array<ILanguage> {
    return this.resumeJson.languages;
  }

  public get profiles(): Array<IProfile> {
    return this.resumeJson.basics.profiles;
  }

  public get citizenship(): Array<ICitizenship> {
    return this.resumeJson.citizenship;
  }

  public get work(): Array<ICompany> {
    return this.resumeJson.work;
  }

  public get schools(): Array<ISchool> {
    return this.resumeJson.education;
  }

  public get testimonials(): Array<ITestimonial> {
    return this.resumeJson.references;
  }

  public get accomplishments(): Array<IAccomplishment> {
    return this.resumeJson.accomplishments;
  }

  public get qualities(): Array<IQuality> {
    return this.resumeJson.qualities;
  }

  public get publications(): Array<IPublication> {
    return this.resumeJson.publications;
  }

  public get keywords(): Array<ICategory> {
    return this.resumeJson.keywords;
  }
}
