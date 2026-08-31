import { customElement, resolve } from "aurelia";

import { IBasics, IResumeStore, SUMMARY_KEYS } from "../../../../stores/resume-store";

import template from "./introduction.html";

@customElement({ name: "introduction", template })
export class Introduction {
  readonly resumeStore = resolve(IResumeStore);
  readonly basics: IBasics = this.resumeStore.basics;

  /**
   * The paragraphs this section renders, as keys into `basics`.
   *
   * Shared with the build-time transformers that derive `resume.txt` and the JSON-LD
   * `description`, so the page and those artifacts cannot disagree about what the summary
   * is. Adding a paragraph here adds it to all three.
   */
  readonly summaryKeys = SUMMARY_KEYS;
}
