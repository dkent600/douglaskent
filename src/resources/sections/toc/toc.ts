import { bindable, customElement } from "aurelia";

import template from "./toc.html";

@customElement({ name: "toc", template })
export class TOC {
  @bindable forDropdownMenu = false;
  @bindable isShort = false;

  goto(where:string) {
    const el = document.getElementById(where);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  }
}
