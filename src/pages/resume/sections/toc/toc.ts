import { bindable } from "aurelia";

export class TOC {
  @bindable forDropdownMenu = false;

  attached() {
    ($("body") as any).scrollspy({ target: "#TOC", offset: 232 });
  }
}
