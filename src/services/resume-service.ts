import { DI, IContainer, Registration } from "aurelia";

import ResumeJson from "../static/resume.json";
export { ResumeJson };
export type IResume = typeof ResumeJson;

export type IResumeService = ResumeService;
export const IResumeService = DI.createInterface<IResumeService>();

export class ResumeService {
  public static register(container: IContainer) {
    Registration.singleton(IResumeService, ResumeService).register(container);
  }
}
