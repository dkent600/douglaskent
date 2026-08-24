import { customElement } from "aurelia";

import template from "./not-found.html";

import "./not-found.scss";

@customElement({ name: "not-found", template })
export class NotFound {
  /**
   * Set by `App` when it catches a failed navigation, because redirecting here
   * replaces the address that failed. Same pattern as `WhichResumeOnly.isShort`.
   */
  static attemptedPath = "";

  /**
   * The address that failed to match, shown back to the reader so a mistyped or
   * truncated link is obvious.
   */
  path = "";

  binding() {
    this.path = NotFound.attemptedPath || window.location.pathname + window.location.search;
    NotFound.attemptedPath = "";
  }
}
