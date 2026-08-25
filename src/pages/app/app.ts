import { customElement } from "aurelia";
import { route, type RouteNode } from "@aurelia/router";

import { NotFound } from "../not-found/not-found";
import { Resume } from "../resume/resume";

import view from "./app.html";

const resumeTitle = (node: RouteNode): string => (node.params.rest === "short" ? "Douglas Kent - Short Resume" : "Douglas Kent - Resume");
const notFoundTitle = "Douglas Kent - Page Not Found";

/**
 * `Resume` is the only substantial routed component and its dependencies are registered
 * eagerly in `main.ts`, so there is nothing for a dynamic `import()` here to split the
 * bundle against.
 */
@route({
  routes: [
    {
      path: "resume",
      component: Resume,
      title: resumeTitle,
    },
    {
      /**
       * A star segment rather than `resume/:option?`, and this matters. The router
       * matches hierarchically: `resume/:option?` matches `/resume/a/b` as `resume/a`
       * and leaves `b` over, which it then tries to resolve as a *child* route of
       * `resume`. That throws AUR3401 and renders a blank page, and it cannot be
       * caught -- the router deliberately does not raise a navigation-error event for
       * an unknown route. A star consumes every trailing segment, so nothing is ever
       * left over, and `Resume.canLoad` decides what is valid.
       */
      path: "resume/*rest",
      component: Resume,
      title: resumeTitle,
    },
    {
      path: "techresume",
      redirectTo: "resume",
    },
    {
      /**
       * `/expanded` is the address a reader is most likely to shorten to.
       */
      path: "expanded",
      redirectTo: "resume/expanded",
    },
    {
      /**
       * `short` and `expanded` are mutually exclusive, so this is not a real route --
       * but it is the combination a reader is most likely to guess at, so forward it
       * rather than treating it as an error.
       */
      path: "resume/short/expanded",
      redirectTo: "resume/expanded",
    },
    /**
     * The resume editor. Dev-only in two ways: the entry is spread in behind
     * `import.meta.env.DEV`, and the component is a dynamic `import()` so the build
     * has no static reference to reach it -- nothing under `src/pages/admin` ends up
     * in the production bundle. It has no production counterpart to talk to anyway:
     * the write endpoint lives in a vite dev-server plugin.
     */
    ...(import.meta.env.DEV
      ? [
          {
            path: "admin",
            component: (): Promise<unknown> => import("../admin/admin"),
            title: "Resume editor",
          },
        ]
      : []),
    {
      path: "not-found",
      component: NotFound,
      title: notFoundTitle,
    },
    {
      path: "*path",
      component: NotFound,
      title: notFoundTitle,
    },
  ],
})
@customElement({
  name: "app",
  template: view,
})
export class App {
  binding() {
    $("#splash").css("display", "none");
  }
}
