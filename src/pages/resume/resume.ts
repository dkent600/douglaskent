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
     * A sweep, so it covers what is in the DOM when the page attaches, and `detaching`
     * below undoes exactly the same set. Both halves are needed because the career links in
     * contact.html use `load`, which navigates client-side: the component is detached and
     * reattached around each of those, rather than the page being thrown away and rebuilt.
     * Anything added to the DOM later by a binding, rather than by a navigation, would still
     * need its own call.
     */
    /**
     * Sweep up any tooltip stranded by the navigation that brought us here.
     *
     * Bootstrap renders a tooltip as its own element and, with the default `container` of
     * `false`, appends it to `document.body` -- outside the component tree, which is the
     * whole of the problem. Removing the anchor does not take it along, and the anchor is
     * always removed out from under an open tooltip: the pointer has to rest on the link to
     * click it, so every click leaves one behind. They accumulated for the life of the page,
     * one visible orphan per navigation.
     *
     * Cleaning them here, rather than disposing them as the old view goes away, because the
     * anchors are already gone by the time this component's `detaching` runs -- a `dispose`
     * sweep there finds nothing to dispose and the orphan survives it. That was measured,
     * not assumed. Attach is the hook that reliably runs after the previous view has been
     * dismantled, whichever order the router swaps the two components in.
     *
     * `body > .tooltip` and not `.tooltip`: only the ones bootstrap parked on the body are
     * orphans. A tooltip belonging to a live element sits wherever its `container` put it,
     * and none of those exist at this point anyway, since the sweep below has not run yet.
     */
    $("body > .tooltip").remove();

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
