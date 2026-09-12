/**
 * jQuery is used as a global (`$`), published onto `window` by src/jquery-global.ts. Its
 * global declaration sits in @types/jquery's misc.d.ts, reachable only through the
 * triple-slash references in that package's index.d.ts -- which TypeScript 6 no longer
 * follows on its own.
 */
/// <reference types="jquery" />

/**
 * `import.meta.env` (used in main.ts to pick a log level) is typed by Vite.
 */
/// <reference types="vite/client" />

/**
 * The `window` members that jquery-global.ts assigns to. @types/jquery declares `$` and
 * `jQuery` as bare globals but does not put them on `Window`. This has to sit below the
 * triple-slash references above, which are only honoured while nothing precedes them.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- augmenting the DOM lib's `Window`, so the name is not ours to choose
interface Window {
  $: JQueryStatic;
  jQuery: JQueryStatic;
  Popper: typeof import("popper.js").default;
}

/**
 * bootstrap-material-design is a jQuery plugin that ships no types of its own. It attaches
 * itself to the jQuery prototype when vendor-globals.ts imports it for its side effects, so
 * declare it onto jQuery rather than casting at the call site.
 *
 * The interface is `JQuery` -- @types/jquery's name for an *instance* (what `$(...)` returns),
 * as against `JQueryStatic` for `$` itself. The type parameter list has to match its
 * declaration exactly too, or this is a separate interface rather than a merge.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- merging into @types/jquery's interface, so the name is not ours to choose
interface JQuery<TElement = HTMLElement> {
  bootstrapMaterialDesign(options?: Record<string, unknown>): JQuery<TElement>;

  /**
   * bootstrap's own tooltip plugin, which reaches the prototype by the same route: the
   * bootstrap-material-design dist vendor-globals.ts imports bundles bootstrap 4.3.1's
   * tooltip.js.
   *
   * Declared here rather than taken from `@types/bootstrap`, which is installed but
   * contributes nothing to this: it is pinned at 3.x, and TypeScript is not picking it up
   * regardless -- without this line `$(...).tooltip` does not exist on the type at all.
   *
   * No parameters, because the one call site in `src/` passes none. resume.ts sweeps
   * `[data-toggle="tooltip"]` and every option comes off the markup, the way bootstrap
   * reads `data-placement` and `title`.
   */
  tooltip(): JQuery<TElement>;
}

declare module "*.html" {
  import { IContainer } from "aurelia";
  export const name: string;
  export const template: string;
  export default template;
  export const dependencies: string[];
  export const containerless: boolean | undefined;
  export const bindables: Record<string, Partial<BindableDefinition>>;
  export const shadowOptions: { mode: "open" | "closed" } | undefined;
  export function register(container: IContainer): void;
}

declare module "*.css";
declare module "*.scss";
