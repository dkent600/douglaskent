import { customElement } from "aurelia";

import { IResumeStore, ITestimonial } from "../../../../stores/resume-store";

import template from "./testimonials.html";

@customElement({ name: "testimonials", template })
export class Testimonials {
  testimonials!: Array<ITestimonial>;
  constructor(@IResumeStore private readonly resumeStore: IResumeStore) {
    this.testimonials = this.resumeStore.testimonials;
  }
}
