import { customElement, IContainer, resolve } from "aurelia";
import { IRouteableComponent, LoadInstruction, Navigation, Parameters, RoutingInstruction } from "@aurelia/router";

import { WhichResumeOnly } from "../../resources/attributes/whichResumeOnly";
import { IBasics, IResumeStore } from "../../stores/resume-store";

import template from "./resume.html";
import * as resumeComponents from "./sections";

import "./resume.scss";

export class ResumeDependencies {
  public static register(container: IContainer): void {
    container.register(resumeComponents);
  }
}

@customElement({ name: "resume", template })
export class Resume implements IRouteableComponent {
  /**
   * given the name or alias of a skill, return the skill json
   */
  readonly resumeStore = resolve(IResumeStore);
  readonly basics: IBasics = this.resumeStore.basics;
  /**
   * used by CSS
   */
  isShort = false;
  expanded = false;

  constructor() {
    this.basics = this.resumeStore.basics;
  }
  canLoad(parameters: Parameters, _instruction: RoutingInstruction, _navigation: Navigation): boolean | LoadInstruction[] | Promise<boolean | LoadInstruction[]> {
    /**
     * `this.isShort` is used to set the is-short class at the top of this view
     * WhichResumeOnly.isShort is used by the `resume-type` custom attribute to control what is displayed
     * depending on whether we're showing the short or complete resume
     */
    WhichResumeOnly.isShort = this.isShort = parameters.short === "short";
    this.expanded = Boolean(parameters.expanded ?? false);
    return true;
  }

  // canLoad(parameters: Parameters, instruction: RoutingInstruction, _navigation: Navigation): boolean {
  //   /**
  //    * `this.isShort` is used to set the is-short class at the top of this view
  //    * WhichResumeOnly.isShort is used by the `resume-type` custom attribute to control what is displayed
  // 1   * depending on whether we're showing the short or complete resume
  //    */
  //   WhichResumeOnly.isShort = this.isShort = !!parameters.short;
  //   this.expanded = Boolean(parseInt(instruction..get("expanded") ?? '0'));
  //   return true;
  // }

  attached() {
    ($("body") as HTMLElement).bootstrapMaterialDesign();

    const bookmark = window.location.hash;
    if (bookmark) {
      this.scrollToBookmark(bookmark.slice(1));
    }
  }

  private scrollToBookmark(elementId: string) {
    const element = document.getElementById(elementId);
    if (element) {
      element.scrollIntoView({ behavior: "auto" });
    }
  }
}
