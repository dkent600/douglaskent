import { customElement } from "aurelia";
import { route } from "@aurelia/router-lite";

import { Resume } from "../resume/resume";

import view from "./app.html";

@route({
  routes: [
    {
      path: ["", "resume/:short?"],
      component: Resume,
      title: "Douglas Kent",
    },
    {
      path: ["techresume"],
      redirectTo: "resume",
    },
  ],
  fallback: "",
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
