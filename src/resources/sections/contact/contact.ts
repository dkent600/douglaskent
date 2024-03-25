import { bindable, customElement } from "aurelia";

import { IBasics, IProfile, IResumeStore } from "../../../stores/resume-store";

import template from "./contact.html";

@customElement({ name: "contact", template })
export class Contact {
  @bindable inline = false;
  basics!: IBasics;
  profiles!: Array<IProfile>;
  constructor(@IResumeStore private readonly resumeStore: IResumeStore) {
    this.basics = this.resumeStore.basics;
    this.profiles = this.resumeStore.profiles;
  }
}
