/**
 * jQuery is used as a global (`$`), loaded from a script tag in index.html. Its global
 * declaration sits in @types/jquery's misc.d.ts, reachable only through the triple-slash
 * references in that package's index.d.ts -- which TypeScript 6 no longer follows on its own.
 */
/// <reference types="jquery" />

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
