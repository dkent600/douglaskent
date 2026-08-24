import { bindable, customAttribute, INode, resolve } from "aurelia";

/**
 * `defaultProperty` is what receives the attribute value when the attribute is written in its
 * single-value form, as in `resume-type="short"`. It defaults to "value", so it has to name
 * `which` explicitly -- before Aurelia rc.0 the sole bindable was picked up implicitly.
 */
@customAttribute({ name: "resume-type", defaultProperty: "which" })
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
