import { bindable, customAttribute, INode, resolve } from "aurelia";

@customAttribute({ name: "resume-type" })
export class WhichResumeOnly {
  // initialized in resume.ts
  static isShort = false;
  private element = resolve(INode) as HTMLElement;

  @bindable private which: "complete" | "short" = "complete";

  bound() {
    this.showHideElement();
  }

  private showHideElement(): void {
    /** hide if not what is specified */
    if ((WhichResumeOnly.isShort && this.which === "complete") || (!WhichResumeOnly.isShort && this.which === "short")) {
      this.element.style.display = "none";
      this.element.style.visibility = "hidden";
      // for use in css
      this.element.classList.add("hidden-from-resume");
    } else {
      this.element.classList.remove("hidden-from-resume");
    }
  }
}
