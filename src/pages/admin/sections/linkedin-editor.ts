import { customElement, ILogger, resolve } from "aurelia";

import { type ILinkedInField, linkedInStore } from "../linkedin-store";

import template from "./linkedin-editor.html";

/** How often the "draft saved 12s ago" label is re-rendered. */
const CLOCK_MS = 5000;

@customElement({ name: "linkedin-editor", template })
export class LinkedInEditor {
  readonly store = linkedInStore;

  /**
   * Re-assigned on a timer so the relative timestamps re-render; the bindings read it only
   * to be re-evaluated. Nothing else is polled.
   */
  now = Date.now();
  private clock: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.store.useLogger(resolve(ILogger).scopeTo("LinkedInEditor"));
  }

  /**
   * Loaded once, not per visit: the tab is destroyed on every switch, but the store keeps
   * the buffers and the pending draft, and reloading would re-read the draft file from
   * under them. Reload is an explicit button.
   */
  binding(): Promise<void> | void {
    if (!this.store.loaded) {
      return this.store.load();
    }
  }

  attached(): void {
    this.clock = setInterval(() => {
      this.now = Date.now();
    }, CLOCK_MS);
  }

  detaching(): void {
    if (this.clock) {
      clearInterval(this.clock);
      this.clock = null;
    }
  }

  fieldsOf(entry: string, _revision?: number): Array<ILinkedInField> {
    return this.store.fields.filter((field) => field.entry === entry);
  }

  unapprovedIn(entry: string, _revision?: number): number {
    return this.fieldsOf(entry).filter((field) => !field.approved).length;
  }

  rows(field: ILinkedInField): number {
    if (field.id === "about") return 16;
    if (field.kind === "list") return Math.min(12, Math.max(3, field.buffer.split("\n").length + 1));
    if (field.limit === undefined) return 1;
    return field.id === "headline" ? 2 : 10;
  }

  ago(iso: string | null, _now?: number): string {
    if (!iso) return "";
    const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (Number.isNaN(seconds)) return iso;
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
    return new Date(iso).toLocaleString();
  }

  local(iso: string | null): string {
    if (!iso) return "";
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
  }
}
