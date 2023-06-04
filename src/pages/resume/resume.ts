import { IContainer } from "aurelia";
import { IRouteableComponent } from "@aurelia/router";

import { IBasics, IResumeStore, ISkill } from "../../stores/resume-store";

import * as resumeComponents from "./sections";

import "./resume.scss";

export class ResumeDependencies {
  public static register(container: IContainer): void {
    container.register(resumeComponents);
  }
}

export class Resume implements IRouteableComponent {
  /**
   * given the name or alias of a skill, return the skill json
   */
  skillByName = new Map<string, ISkill>();
  basics!: IBasics;

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

  binding() {
    $("#splash").css("display", "none");
  }

  attached() {
    ($("body") as any).bootstrapMaterialDesign();
    ($("body") as any).scrollspy({ target: "#TOC", offset: 232 });
    ($(".company .remote i") as any).tooltip();
    ($(".company .contract i") as any).tooltip();
    ($(".company .personal i") as any).tooltip();

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
