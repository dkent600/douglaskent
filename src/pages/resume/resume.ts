import { customElement, IContainer } from "aurelia";
import { IRouteViewModel, Params } from "@aurelia/router-lite";

import { IBasics, IResumeStore, ISkill } from "../../stores/resume-store";

import template from "./resume.html";
import * as resumeComponents from "./sections";

import "./resume.scss";
import { WhichResumeOnly } from '../../resources/attributes/whichResumeOnly';

export class ResumeDependencies {
  public static register(container: IContainer): void {
    container.register(resumeComponents);
  }
}

@customElement({ name: "resume", template })
export class Resume implements IRouteViewModel {
  /**
   * given the name or alias of a skill, return the skill json
   */
  basics!: IBasics;
  isShort = false;

  constructor(@IResumeStore private readonly resumeStore: IResumeStore) {
    this.basics = this.resumeStore.basics;
  }
    
  canLoad(parameters: Params) {
    /**
     * `this.isShort` is used to set the is-short class at the top of this view
     * WhichResumeOnly.isShort is used by the `resume-type` custom attribute to control what is displayed
     * depending on whether we're showing the short or complete resume
     */
    WhichResumeOnly.isShort = this.isShort = parameters.short === "short";
    return true;
  }

  attached() {
    ($("body") as any).bootstrapMaterialDesign();
    
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
