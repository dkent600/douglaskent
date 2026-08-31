import { DI, IContainer, Registration } from "aurelia";

import { IResume, ResumeJson } from "../services/resume-service";

export interface ISkill {
  priority: number;
  name: string;
  categories: Array<ICategory>;
  url: string;
  aliases?: Array<string>;
  hide?: boolean;
}

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
export type ICategory = IResume["skillCategories"][0];

/**
 * The `basics` keys that carry the introduction's prose, in reading order.
 *
 * These paragraphs are numbered rather than held in an array because the templates place
 * them in different sections -- `summary4` is the travel paragraph and belongs to the
 * travel section, not here. This list is the introduction's share of them.
 *
 * `summary3` is deliberately absent even though the introduction renders it: it is a
 * "see my complete resume at" pointer shown only on the short resume, so it is page
 * furniture rather than resume content and the derived artifacts must not repeat it. The
 * introduction template binds it separately for that reason.
 *
 * Consumed at runtime by the introduction component and at build time by the transformers
 * that derive `resume.txt` and the JSON-LD `description` from the same paragraphs, so the
 * page and the artifacts cannot drift into disagreeing about what the summary is. What
 * each of them does with the paragraphs still differs: the page and the text file keep
 * them separate, the JSON-LD joins them into the single string `description` is defined
 * to be.
 */
export const SUMMARY_KEYS = ["summary1", "summary2", "summary7"];

export type IResumeStore = ResumeStore;
export const IResumeStore = DI.createInterface<IResumeStore>();

export class ResumeStore {
  public static register(container: IContainer): void {
    container.register(Registration.singleton(IResumeStore, ResumeStore));
  }

  private get resumeJson(): IResume {
    return ResumeJson;
  }

  public get skillCategories(): Array<ICategory> {
    return this.resumeJson.skillCategories;
  }

  public get skills(): Array<ISkill> {
    return this.resumeJson.skills as Array<ISkill>;
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

  public get companies(): Array<ICompany> {
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
}
