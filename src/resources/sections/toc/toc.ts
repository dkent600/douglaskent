import { bindable, customElement } from "aurelia";

import template from "./toc.html";

@customElement({ name: "toc", template })
export class TOC {
  @bindable forDropdownMenu = false;
}
