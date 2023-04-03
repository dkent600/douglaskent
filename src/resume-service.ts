import { DI, IContainer, Registration } from "aurelia";

export const ResumeJson = (await import("./static/resume.json"));
export type IResume = typeof ResumeJson;

export type IResumeService = ResumeService;
export const IResumeService = DI.createInterface<IResumeService>();

export class ResumeService {

    public static register(container: IContainer) {
        Registration.singleton(IResumeService, ResumeService).register(container);
    }

}
