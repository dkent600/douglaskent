import { customElement } from "aurelia";
import { route, type RouteNode } from "@aurelia/router";

import { IResumeStore } from "../../stores/resume-store";
import { NotFound } from "../not-found/not-found";
import { Resume } from "../resume/resume";

import view from "./app.html";

/**
 * The title the resume routes publish, resolved per navigation.
 *
 * The router overwrites `document.title` once it navigates, so whatever this returns is
 * the title Googlebot records -- it renders before it indexes. Left hardcoded, the served
 * HTML carried `basics.metaTitle` for non-rendering crawlers while Google saw a weaker
 * string, which is precisely backwards. This keeps the two in agreement.
 *
 * It must not drift from `resume-head-plugin.ts`. That plugin writes the static `<title>`
 * at build time from the same two fields with the same preference order, and the point is
 * that the runtime title and the served one are the same string. A change to either
 * belongs in both.
 *
 * A `title` function is handed a `RouteNode` rather than a container, but that is not the
 * obstacle it looks like: `RouteNode.context` is the node's `IRouteContext`, which exposes
 * a public `container`. So this reads `basics` through `IResumeStore` like any other
 * consumer, and no state has to be pushed in from a lifecycle hook to make it work.
 *
 * `App` itself could not do that pushing anyway. Routing hooks are invoked by a
 * `ComponentAgent`, and agents are only ever created for a component activated *into* a
 * viewport (`viewport-agent.ts`). `App` hosts the viewport rather than occupying one, so
 * it never gets an agent and never receives `loaded`.
 *
 * No escaping. `document.title` takes text rather than markup, so the `&` in `label` is
 * correct as it stands; the plugin escapes only because it writes into an HTML string.
 */
const resumeTitle = (node: RouteNode): string => {
  const basics = node.context.container.get(IResumeStore).basics;
  const baseTitle = basics.metaTitle ? basics.metaTitle : `${basics.name} — ${basics.label}`;
  /**
   * Suffixed rather than replaced with a different string. The keywords are at the front
   * of `baseTitle`, and a browser tab truncates from the end, so appending keeps them
   * readable on the short resume too.
   */
  return node.params.rest === "short" ? `${baseTitle} (Short)` : baseTitle;
};

/**
 * Left hardcoded, and it must stay that way. `not-found` is not a page anyone should reach
 * from a search result, so it deliberately carries no resume keywords.
 */
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
