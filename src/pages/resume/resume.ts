import { customElement, IContainer, resolve } from "aurelia";
import { IRouteViewModel, NavigationInstruction, Params, RouteNode } from "@aurelia/router-lite";

import { IBasics, IResumeStore } from "../../stores/resume-store";

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
  readonly resumeStore = resolve(IResumeStore);
  /**
   * given the name or alias of a skill, return the skill json
   */
  readonly basics: IBasics = this.resumeStore.basics;
  /**
   * used by CSS
   */
  isShort = false;
  expanded = false;

  constructor() {
    this.basics = this.resumeStore.basics;
  }
    
  canLoad(parameters: Params, next: RouteNode, _current: RouteNode | null): boolean | NavigationInstruction | NavigationInstruction[] | Promise<boolean> {
    /**
     * `this.isShort` is used to set the is-short class at the top of this view
     * WhichResumeOnly.isShort is used by the `resume-type` custom attribute to control what is displayed
     * depending on whether we're showing the short or complete resume
     */
    WhichResumeOnly.isShort = this.isShort = !!parameters.short;
    this.expanded = Boolean(parseInt(next.queryParams.get("expanded") ?? '0'));
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
