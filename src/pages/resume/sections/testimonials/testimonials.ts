import { IResumeStore, ITestimonial } from "../../../../stores/resume-store";
export class Testimonials {
  testimonials!: Array<ITestimonial>;
  constructor(@IResumeStore private readonly resumeStore: IResumeStore) {
    this.testimonials = this.resumeStore.testimonials;
  }
}
