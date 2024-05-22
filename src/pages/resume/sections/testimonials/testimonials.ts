import { bindable, customElement, resolve } from "aurelia";

import { IResumeStore, ITestimonial } from "../../../../stores/resume-store";

import template from "./testimonials.html";

@customElement({ name: "testimonials", template })
export class Testimonials {
  @bindable justOne = false;
  readonly resumeStore = resolve(IResumeStore);
  readonly testimonials:  Array<ITestimonial> = this.resumeStore.testimonials;
}
