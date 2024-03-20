import { customElement, IContainer } from "aurelia";
import { IRouteViewModel, Params } from "@aurelia/router-lite";

import { IBasics, IResumeStore, ISkill } from "../../stores/resume-store";

import template from "./resume.html";
import * as resumeComponents from "../../resources/sections";

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
  skillByName = new Map<string, ISkill>();
  basics!: IBasics;
  isShort = false;

  constructor(@IResumeStore private readonly resumeStore: IResumeStore) {
    this.basics = this.resumeStore.basics;
    /**
     * Key the skill element by its lowercase name and all its aliases.
     * If there is a circular reference here between
     * name and the alias, then what ever is the last one encountered
     * will be keyed by the duplicated skill name.
     */
    for (const skill of this.resumeStore.skills) {
      // will overwrite dups
      this.skillByName.set(skill.name.toLowerCase(), skill);
      const aliases = skill.aliases ?? [];
      /**
       * when the alias is referenced in a job, it will be
       * displayed using this skill.
       */
      for (const alias of aliases) {
        // will overwrite dups
        this.skillByName.set(alias.toLowerCase(), skill);
      }
    }
  }
    
  canLoad(parameters: Params) {
    this.isShort = parameters.short === "short";
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
