import { customElement } from "aurelia";
import { IRouteableComponent, routes } from "@aurelia/router";

import { Resume } from "../resume/resume";

import view from "./app.html";

@routes([
  {
    path: ["", "resume/:short?"],
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
