import { customElement } from "aurelia";
import { IRouteableComponent, routes } from "@aurelia/router-direct";

import { Resume } from "../resume/resume";

import view from "./app.html";

@routes([
  {
    /**
     * The optional segment is either "short" or "expanded". They are mutually
     * exclusive, so there is no /resume/short/expanded -- that falls through to
     * the catch-all route below and renders the plain complete resume.
     */
    path: ["", "resume/:option?"],
    component: Resume,
    title: "Resume",
  },
  {
    path: ["techresume"],
    redirectTo: "resume",
  },
  {
    path: ["*"],
    component: Resume,
  },
])
@customElement({
  name: "app",
  template: view,
})
export class App implements IRouteableComponent {
  binding() {
    $("#splash").css("display", "none");
  }
}
