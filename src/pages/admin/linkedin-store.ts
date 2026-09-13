/**
 * State for the LinkedIn tab of the dev-only admin page.
 *
 * A module singleton for the same reason `admin-store.ts` is: nothing outside
 * `src/pages/admin` may reference it, which is what lets Rollup drop the whole editor from
 * a production build. It is a separate store because it reads different files -- the
 * LinkedIn config, state and draft -- through its own dev-server endpoint, and it never
 * writes `resume.json`.
 *
 * Every field carries three texts, kept apart on purpose:
 *
 *   storedOverride   the override in `linkedin.state.json`, if any        (last approved)
 *   storedDefault    the computed default recorded there at approval      (last approved)
 *   buffer           what the textarea holds now                          (live, autosaved)
 *
 * and `currentDefault`, recomputed from `resume.json` and the config on every load. A field
 * is approved when the default it was approved against is the current one; the moment the
 * computation moves, the field is flagged and nothing on screen changes until the user
 * chooses. The draft file is the only persistence for unsaved work -- no `localStorage`,
 * because a second copy can disagree with the first.
 */
import type { ILogger } from "aurelia";

import {
  type FieldKind,
  type FieldValue,
  generate,
  type IComputedField,
  type IDraftField,
  type ILinkedInDraft,
  type ILinkedInState,
  type IStateField,
  outputOf,
  sameValue,
  valueLength,
} from "../../../linkedin-generator";

const ENDPOINT = "/__linkedin";
/** How long after the last keystroke the draft is written. */
const DRAFT_DEBOUNCE_MS = 1000;

export interface IDiffSegment {
  kind: "same" | "ins" | "del";
  text: string;
}

export interface ILinkedInField {
  id: string;
  kind: FieldKind;
  limit?: number;
  label: string;
  entry: string;
  requiresOverride: boolean;
  /** From the config, read-only; never part of a value, buffer, draft or state. */
  guidance?: string;

  currentDefault: FieldValue;
  storedDefault?: FieldValue;
  storedOverride?: FieldValue;
  storedHasOverride: boolean;
  storedApprovedAt?: string;

  /** Textarea text. A list is one item per line. */
  buffer: string;
  hasOverride: boolean;
  /** The computed default the user approved against; `undefined` until they do. */
  approvedDefault?: FieldValue;
  approvedAt?: string;

  // Derived by `refresh`, so templates bind to plain properties.
  approved: boolean;
  /** Approved, but there was nothing stored to compare against -- a new field or first run. */
  isNew: boolean;
  length: number;
  over: boolean;
  /** What would go to LinkedIn now: the override when one stands, else the current default. */
  output: FieldValue;
  outputChanged: boolean;
  defaultChanged: boolean;
  outputDiff: Array<IDiffSegment>;
  defaultDiff: Array<IDiffSegment>;
}

/**
 * A field that the state or the draft still carries but the output no longer computes --
 * its entry stopped being notable, or a group dropped it. Kept whole, shown read-only, and
 * removed only by an explicit discard. Outside the gate.
 */
export interface IOrphanField {
  id: string;
  /** What is preserved: the draft buffer if there is one, else the state's output. */
  text: string;
  hasOverride: boolean;
  orphanedAt: string | null;
  /** Carried through Save untouched (the server re-stamps it). */
  state?: IStateField;
  /** Carried through every draft write untouched. */
  draft?: IDraftField;
}

interface IBootstrap {
  config: unknown;
  resume: Record<string, unknown>;
  state: ILinkedInState | null;
  draft: ILinkedInDraft | null;
}

const toText = (value: FieldValue | undefined): string => (value === undefined ? "" : Array.isArray(value) ? value.join("\n") : value);

const fromText = (kind: FieldKind, text: string): FieldValue =>
  kind === "list"
    ? text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "")
    : text;

// ------------------------------------------------------------------------------------ diff

/** Words and the whitespace between them, so a diff of prose lands on word boundaries. */
const tokenise = (text: string): Array<string> => text.split(/(\s+)/).filter((token) => token !== "");

/**
 * A word-level diff by longest common subsequence. Quadratic, which is fine at the sizes
 * here -- the largest field is 2,600 characters -- and worth no dependency.
 */
export function diff(before: string, after: string): Array<IDiffSegment> {
  const a = tokenise(before);
  const b = tokenise(after);
  const table: Array<Uint16Array> = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const segments: Array<IDiffSegment> = [];
  const push = (kind: IDiffSegment["kind"], text: string) => {
    const last = segments[segments.length - 1];
    if (last?.kind === kind) {
      last.text += text;
    } else {
      segments.push({ kind, text });
    }
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push("same", a[i]);
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      push("del", a[i]);
      i++;
    } else {
      push("ins", b[j]);
      j++;
    }
  }
  while (i < a.length) push("del", a[i++]);
  while (j < b.length) push("ins", b[j++]);
  return segments;
}

// ----------------------------------------------------------------------------------- store

export class LinkedInStore {
  private log: ILogger | null = null;

  public useLogger(logger: ILogger): void {
    this.log = logger;
  }

  public fields: Array<ILinkedInField> = [];
  /** Entry labels in display order, for grouping the panes. */
  public entries: Array<string> = [];
  public orphans: Array<IOrphanField> = [];
  public notes: Array<string> = [];
  /**
   * `_settingsChecklist` from the config: account settings to handle before and after a
   * transfer session. Not field data and not validated -- read straight off the raw file,
   * the way `validateConfig` ignores it -- and shown once at the top, read-only.
   */
  public settingsChecklist: Array<string> = [];
  public loaded = false;
  public busy = false;
  public status = "";
  /** A config or data problem that stopped the generator; there are no fields while it stands. */
  public generatorError: string | null = null;

  public stateSavedAt: string | null = null;
  /** The draft file's timestamp as found on load, so the user knows buffered text is on screen. */
  public draftLoadedAt: string | null = null;
  public draftSavedAt: string | null = null;
  /** Edits not yet written to the draft file -- inside the debounce window, or a write in flight. */
  public draftPending = false;
  private draftTimer: ReturnType<typeof setTimeout> | null = null;

  /** Bumped on every mutation so method-call bindings in the template re-evaluate. */
  public revision = 0;

  // ------------------------------------------------------------------------------- load

  public async load(): Promise<void> {
    if (this.draftPending) {
      await this.flushDraft();
    }
    this.busy = true;
    this.status = "loading...";
    try {
      const response = await fetch(`${ENDPOINT}/bootstrap`);
      const body = (await response.json()) as IBootstrap & { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? `${response.status} ${response.statusText}`);
      }
      this.apply(body);
      this.loaded = true;
      this.status = this.generatorError ? "generator failed" : `loaded ${this.fields.length} fields, ${this.unapprovedCount} unapproved`;
    } catch (error) {
      this.status = `load failed: ${(error as Error).message}`;
      this.log?.error("load failed", error);
    } finally {
      this.busy = false;
    }
  }

  private apply(bootstrap: IBootstrap): void {
    this.generatorError = null;
    this.stateSavedAt = bootstrap.state?.savedAt ?? null;
    this.draftLoadedAt = bootstrap.draft ? (bootstrap.draft.savedAt ?? "(no timestamp)") : null;
    this.draftSavedAt = null;
    this.draftPending = false;
    const checklist = (bootstrap.config as { _settingsChecklist?: unknown } | null)?._settingsChecklist;
    this.settingsChecklist = Array.isArray(checklist) ? checklist.filter((item): item is string => typeof item === "string") : [];

    let computed: Array<IComputedField>;
    try {
      const generated = generate(bootstrap.resume, bootstrap.config);
      computed = generated.fields;
      this.notes = generated.notes;
    } catch (error) {
      this.generatorError = (error as Error).message;
      this.fields = [];
      this.entries = [];
      this.orphans = [];
      this.notes = [];
      this.revision++;
      return;
    }

    const stateFields = bootstrap.state?.fields ?? {};
    const draftFields = bootstrap.draft?.fields ?? {};
    this.fields = computed.map((field) => this.build(field, stateFields[field.id], draftFields[field.id]));
    this.entries = [...new Set(this.fields.map((field) => field.entry))];

    /**
     * Anything stored or drafted under an id the output no longer has. Both files are
     * consulted: a seed can name an entry that is not in the output today, and that text is
     * as much worth keeping as an override in the state.
     */
    const live = new Set(computed.map((field) => field.id));
    const orphanIds = [...new Set([...Object.keys(stateFields), ...Object.keys(draftFields)])].filter((id) => !live.has(id));
    this.orphans = orphanIds.map((id) => {
      const state = stateFields[id];
      const draft = draftFields[id];
      return {
        id,
        text: toText(draft?.buffer ?? (state ? outputOf(state) : undefined)),
        hasOverride: draft?.hasOverride ?? (draft?.buffer !== undefined || state?.hasOverride === true),
        orphanedAt: state?.orphanedAt ?? null,
        ...(state ? { state } : {}),
        ...(draft ? { draft } : {}),
      };
    });
    this.revision++;
  }

  /**
   * The screen shows the stored value, not the recomputed one: a flagged field's textarea
   * holds what was approved last time, and the current default sits in the diff until the
   * user accepts it. With no state at all there is nothing stored, so the default shows.
   */
  private build(computed: IComputedField, stored: IStateField | undefined, draft: IDraftField | undefined): ILinkedInField {
    const storedHasOverride = stored?.hasOverride === true;
    const baseline: FieldValue = stored ? (storedHasOverride && stored.override !== undefined ? stored.override : stored.default) : computed.default;
    const field: ILinkedInField = {
      id: computed.id,
      kind: computed.kind,
      limit: computed.limit,
      label: computed.label,
      entry: computed.entry,
      requiresOverride: computed.requiresOverride,
      ...(computed.guidance !== undefined ? { guidance: computed.guidance } : {}),
      currentDefault: computed.default,
      storedDefault: stored?.default,
      storedOverride: storedHasOverride ? stored?.override : undefined,
      storedHasOverride,
      storedApprovedAt: stored?.approvedAt,
      buffer: toText(draft?.buffer ?? baseline),
      /** A hand-written draft that supplies text but says nothing about it is an override. */
      hasOverride: draft ? (draft.hasOverride ?? draft.buffer !== undefined) : storedHasOverride,
      approvedDefault: draft?.approvedDefault ?? stored?.default,
      approvedAt: draft?.approvedAt ?? stored?.approvedAt,
      approved: false,
      isNew: false,
      length: 0,
      over: false,
      output: computed.default,
      outputChanged: false,
      defaultChanged: false,
      outputDiff: [],
      defaultDiff: [],
    };
    this.refresh(field);
    return field;
  }

  private refresh(field: ILinkedInField): void {
    field.approved = field.approvedDefault !== undefined && sameValue(field.approvedDefault, field.currentDefault);
    field.isNew = field.storedDefault === undefined;
    field.output = field.hasOverride ? fromText(field.kind, field.buffer) : field.currentDefault;
    /** Counts the buffer -- what is on screen -- so the number moves as the user types. */
    field.length = valueLength(field.kind, fromText(field.kind, field.buffer));
    field.over = field.limit !== undefined && field.length > field.limit;

    const lastOutput: FieldValue | undefined = field.storedHasOverride ? field.storedOverride : field.storedDefault;
    field.outputChanged = lastOutput !== undefined && !sameValue(lastOutput, field.output);
    field.defaultChanged = field.storedDefault !== undefined && !sameValue(field.storedDefault, field.currentDefault);
    field.outputDiff = field.outputChanged ? diff(toText(lastOutput), toText(field.output)) : [];
    field.defaultDiff = field.defaultChanged ? diff(toText(field.storedDefault), toText(field.currentDefault)) : [];
    this.revision++;
  }

  // ------------------------------------------------------------------------------ edits

  /** Any keystroke makes the buffer an override, even one that types the default back in. */
  public edit(field: ILinkedInField, text: string): void {
    if (field.buffer === text) {
      return;
    }
    field.buffer = text;
    field.hasOverride = true;
    this.refresh(field);
    this.scheduleDraft();
  }

  /** Approve the current default, or keep the override against it. Either way it is reviewed. */
  public approve(field: ILinkedInField): void {
    field.approvedDefault = field.currentDefault;
    field.approvedAt = new Date().toISOString();
    if (!field.hasOverride) {
      field.buffer = toText(field.currentDefault);
    }
    this.refresh(field);
    void this.flushDraft();
  }

  public acceptAll(): void {
    const now = new Date().toISOString();
    for (const field of this.fields) {
      if (field.approved) continue;
      field.approvedDefault = field.currentDefault;
      field.approvedAt = now;
      if (!field.hasOverride) {
        field.buffer = toText(field.currentDefault);
      }
      this.refresh(field);
    }
    void this.flushDraft();
  }

  /** Back to the override in the state file, discarding unsaved typing. */
  public resetToOverride(field: ILinkedInField): void {
    if (!field.storedHasOverride) {
      return;
    }
    field.buffer = toText(field.storedOverride);
    field.hasOverride = true;
    this.refresh(field);
    void this.flushDraft();
  }

  /**
   * To the *current computed* default -- not the stored one -- and the override is dropped.
   * Approval is a separate click: taking the default is not the same as having read it.
   */
  public resetToDefault(field: ILinkedInField): void {
    field.buffer = toText(field.currentDefault);
    field.hasOverride = false;
    this.refresh(field);
    void this.flushDraft();
  }

  public canResetToDefault(field: ILinkedInField): boolean {
    return field.hasOverride || field.buffer !== toText(field.currentDefault);
  }

  public copy(field: ILinkedInField): Promise<void> {
    return this.copyText(field.buffer, `${field.entry} › ${field.label}`);
  }

  public async copyText(text: string, label: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.status = `copied ${label}`;
    } catch (error) {
      this.status = `copy failed: ${(error as Error).message}`;
      this.log?.error("copy failed", error);
    }
  }

  /**
   * The one way an orphan leaves the files. Explicit, per field, and confirmed in the tab;
   * the tool never discards on its own. Takes effect in the draft at once and in the state
   * at the next Save.
   */
  public discardOrphan(id: string): void {
    const at = this.orphans.findIndex((orphan) => orphan.id === id);
    if (at < 0) {
      return;
    }
    this.orphans.splice(at, 1);
    this.revision++;
    void this.flushDraft();
  }

  // ------------------------------------------------------------------------------- gate

  public get unapprovedCount(): number {
    return this.fields.filter((field) => !field.approved).length;
  }

  public get overLimitCount(): number {
    return this.fields.filter((field) => field.over).length;
  }

  public get missingOverrideCount(): number {
    return this.fields.filter((field) => field.requiresOverride && !field.hasOverride).length;
  }

  /** Empty when Save may proceed; otherwise why not, naming the counts. */
  public get saveBlockedBy(): string {
    if (!this.loaded || this.generatorError) return "nothing to save";
    const reasons: Array<string> = [];
    if (this.unapprovedCount > 0) reasons.push(`${this.unapprovedCount} unapproved`);
    if (this.overLimitCount > 0) reasons.push(`${this.overLimitCount} over limit`);
    if (this.missingOverrideCount > 0) reasons.push(`${this.missingOverrideCount} need an override`);
    return reasons.join(", ");
  }

  public get canSave(): boolean {
    return this.saveBlockedBy === "" && !this.busy;
  }

  public async save(): Promise<void> {
    if (!this.canSave) {
      return;
    }
    if (this.draftTimer) {
      clearTimeout(this.draftTimer);
      this.draftTimer = null;
    }
    this.busy = true;
    this.status = "saving...";
    try {
      const fields: Record<string, IStateField> = {};
      for (const field of this.fields) {
        fields[field.id] = {
          default: field.currentDefault,
          ...(field.hasOverride ? { override: fromText(field.kind, field.buffer) } : {}),
          hasOverride: field.hasOverride,
          approvedAt: field.approvedAt ?? field.storedApprovedAt ?? new Date().toISOString(),
        };
      }
      /**
       * Orphans ride along so the state keeps them. One that exists only in the draft has no
       * stored default to carry; it is written as an override over an empty default, so that
       * the text survives the draft being cleared and, should the entry return, is flagged
       * for review rather than silently taken as approved.
       */
      for (const orphan of this.orphans) {
        fields[orphan.id] = orphan.state ?? {
          default: "",
          override: orphan.draft?.buffer ?? orphan.text,
          hasOverride: true,
          approvedAt: new Date().toISOString(),
        };
      }
      const response = await fetch(`${ENDPOINT}/state`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fields }),
      });
      const body = (await response.json()) as ILinkedInState & { error?: string; errors?: Array<string> };
      if (!response.ok) {
        throw new Error([body.error, ...(body.errors ?? [])].filter(Boolean).join("\n"));
      }
      /** The server's copy is authoritative: adopt it as the new stored baseline. */
      for (const field of this.fields) {
        const stored = body.fields[field.id];
        field.storedDefault = stored.default;
        field.storedHasOverride = stored.hasOverride;
        field.storedOverride = stored.hasOverride ? stored.override : undefined;
        field.storedApprovedAt = stored.approvedAt;
        field.approvedDefault = stored.default;
        this.refresh(field);
      }
      for (const orphan of this.orphans) {
        const stored = body.fields[orphan.id];
        orphan.state = stored;
        orphan.orphanedAt = stored.orphanedAt ?? null;
        orphan.draft = undefined;
      }
      this.stateSavedAt = body.savedAt;
      await this.clearDraft();
      this.status = `saved at ${new Date().toLocaleTimeString()}`;
    } catch (error) {
      this.status = `save failed: ${(error as Error).message}`;
      this.log?.error("save failed", error);
    } finally {
      this.busy = false;
    }
  }

  // ------------------------------------------------------------------------------ draft

  private scheduleDraft(): void {
    this.draftPending = true;
    if (this.draftTimer) {
      clearTimeout(this.draftTimer);
    }
    this.draftTimer = setTimeout(() => void this.flushDraft(), DRAFT_DEBOUNCE_MS);
  }

  private flushing: Promise<void> = Promise.resolve();

  /**
   * Writes the whole draft now: every buffer, override and approval state. Calls are
   * chained, so a blur flush that lands while the debounced one is in flight waits for it
   * rather than racing it -- and then writes whatever the buffers hold by that time.
   */
  public flushDraft(): Promise<void> {
    if (this.draftTimer) {
      clearTimeout(this.draftTimer);
      this.draftTimer = null;
    }
    if (!this.loaded || this.generatorError) {
      return Promise.resolve();
    }
    this.flushing = this.flushing.then(() => this.writeDraft());
    return this.flushing;
  }

  private async writeDraft(): Promise<void> {
    const draft: ILinkedInDraft = { fields: {} };
    for (const field of this.fields) {
      draft.fields[field.id] = {
        buffer: fromText(field.kind, field.buffer),
        hasOverride: field.hasOverride,
        ...(field.approvedDefault !== undefined ? { approvedDefault: field.approvedDefault } : {}),
        ...(field.approvedAt !== undefined ? { approvedAt: field.approvedAt } : {}),
      };
    }
    /** Orphans the draft already carried are written back as they were, until discarded. */
    for (const orphan of this.orphans) {
      if (orphan.draft) {
        draft.fields[orphan.id] = orphan.draft;
      }
    }
    try {
      const response = await fetch(`${ENDPOINT}/draft`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body = (await response.json()) as { savedAt?: string; error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? `${response.status} ${response.statusText}`);
      }
      this.draftSavedAt = body.savedAt ?? new Date().toISOString();
      /** Only clear if nothing was typed while the write was in flight. */
      if (this.draftTimer === null) {
        this.draftPending = false;
      }
    } catch (error) {
      this.status = `draft save failed: ${(error as Error).message}`;
      this.log?.error("draft save failed", error);
    }
  }

  private async clearDraft(): Promise<void> {
    const response = await fetch(`${ENDPOINT}/draft`, { method: "DELETE" });
    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      throw new Error(body.error ?? `${response.status} ${response.statusText}`);
    }
    this.draftLoadedAt = null;
    this.draftSavedAt = null;
    this.draftPending = false;
  }
}

export const linkedInStore = new LinkedInStore();
