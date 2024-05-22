import { bindable, customElement, resolve } from "aurelia";

import { IBasics, IProfile, IResumeStore } from "../../../../stores/resume-store";

import template from "./contact.html";

@customElement({ name: "contact", template })
export class Contact {
  @bindable inline = false;
  readonly resumeStore = resolve(IResumeStore);
  readonly basics: IBasics = this.resumeStore.basics;
  readonly profiles: Array<IProfile> = this.resumeStore.profiles;
}
