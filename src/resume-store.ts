import { DI, IContainer, Registration } from "aurelia";
import { IResume, ResumeJson } from "./resume-service";

export type ISkill = IResume['skills'][0];

export type IResumeStore = ResumeStore;
export const IResumeStore = DI.createInterface<IResumeStore>();

export class ResumeStore {

    public static register(container: IContainer): void {
        container.register(Registration.singleton(IResumeStore, ResumeStore));
    }

    public get resumeJson(): IResume {
        return ResumeJson;
    }

    public get skills(): Array<ISkill> {
        return this.resumeJson.skills;
    }
}