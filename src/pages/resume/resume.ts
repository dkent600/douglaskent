import { customElement, IContainer, ILogger, resolve } from "aurelia";
import { type IRouteViewModel, type NavigationInstruction, type Params, type RouteNode } from "@aurelia/router";

import { WhichResumeOnly } from "../../resources/attributes/whichResumeOnly";
import { IBasics, IResumeStore } from "../../stores/resume-store";
import { NotFound } from "../not-found/not-found";

import template from "./resume.html";
import * as resumeComponents from "./sections";

import "./resume.scss";

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
  readonly resumeStore = resolve(IResumeStore);
  private readonly log = resolve(ILogger).scopeTo("Resume");
  readonly basics: IBasics = this.resumeStore.basics;
  /**
   * used by CSS
   */
  isShort = false;
  expanded = false;

  constructor() {
    this.basics = this.resumeStore.basics;
  }
  canLoad(params: Params, next: RouteNode): boolean | NavigationInstruction {
    /**
     * The route captures everything after `/resume` as one star segment, so this is
     * where an address like `/resume/bogus` or `/resume/a/b` is rejected.
     */
    const option = params.rest;
    if (option !== undefined && option !== "short" && option !== "expanded") {
      this.log.warn(`"${option}" is not a resume view; redirecting to not-found`);
      NotFound.attemptedPath = window.location.pathname + window.location.search;
      return "not-found";
    }
    /**
     * `this.isShort` is used to set the is-short class at the top of this view
     * WhichResumeOnly.isShort is used by the `resume-type` custom attribute to control what is displayed
     * depending on whether we're showing the short or complete resume
     */
    WhichResumeOnly.isShort = this.isShort = option === "short";
    /**
     * `?expanded=1` was the canonical URL two changes ago: `/resume/expanded` replaced it,
     * and the apex, `https://www.douglaskent.com/`, has since replaced that. Links against
     * the old query string are still out there in search results, so keep honouring it --
     * but only on the complete resume. `short` and `expanded` are mutually exclusive in the
     * path, and the query string is not a way around that: on the short resume it is
     * ignored, the same as any other query parameter the app does not know about.
     */
    this.expanded = option === "expanded" || (!this.isShort && Boolean(next.queryParams.get("expanded")));
    return true;
  }

  attached() {
    $("body").bootstrapMaterialDesign();

    /**
     * Bootstrap's tooltips are opt-in and nothing above turns them on: the call over this
     * one instantiates a fixed list -- ripples, checkbox, checkboxInline, collapseInline,
     * drawer, radio, radioInline, switch, text, textarea, select, autofill -- and tooltip
     * is not in it. So `data-toggle="tooltip"` needs this sweep to become a tooltip at all.
     * The plugin itself is already here: bootstrap-material-design's dist bundles bootstrap
     * 4.3.1's tooltip.js, and it finds the `Popper` tooltips require on the global that
     * jquery-global.ts publishes.
     *
     * A sweep, so it only covers what is in the DOM when the page attaches. That is enough
     * for the markup that uses it: the Expand/Retract links in contact.html are marked
     * `external`, which means following one is a full page load rather than a soft route
     * change, so this runs again over the new DOM. Anything added later by a binding would
     * need its own call.
     */
    $('[data-toggle="tooltip"]').tooltip();

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
