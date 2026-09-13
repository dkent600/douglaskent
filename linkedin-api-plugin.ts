import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { Plugin } from "vite";

import { gateErrors, generate, type ILinkedInState } from "./linkedin-generator";

/**
 * Serves and writes the files behind the admin page's LinkedIn tab.
 *
 * Modelled on `resume-api-plugin.ts`: `apply: "serve"` plus `configureServer`, so this
 * exists only under `vite dev` and a production build has neither the endpoint nor any
 * reference to it.
 *
 * Three files, all at the repo root and all gitignored:
 *
 *   linkedin.config.json   rules, hand-edited            read only
 *   linkedin.state.json    the approved record           written by PUT /state, gated
 *   linkedin.draft.json    work in progress              written by PUT /draft, ungated
 *
 * `resume.json` is read here and never written; the `/__resume` endpoint owns that.
 */
const CONFIG_PATH = "linkedin.config.json";
const STATE_PATH = "linkedin.state.json";
const DRAFT_PATH = "linkedin.draft.json";
const DRAFT_BACKUP_PATH = "linkedin.draft.json.bak";
const RESUME_PATH = "src/static/resume.json";

const stringify = (value: unknown): string => JSON.stringify(value, null, 2) + "\n";

const isMissing = (error: unknown): boolean => (error as NodeJS.ErrnoException).code === "ENOENT";

async function readJson(file: string, label: string): Promise<unknown> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    if (isMissing(error)) throw new Error(`${label} does not exist`);
    throw error;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${(error as Error).message}`);
  }
}

async function readJsonIfPresent(file: string, label: string): Promise<unknown> {
  try {
    return await readJson(file, label);
  } catch (error) {
    if ((error as Error).message.endsWith("does not exist")) return null;
    throw error;
  }
}

/**
 * Written to a sibling and renamed over the target, so a crash mid-write leaves the old
 * file rather than half of the new one. This is the opposite of the in-place write in
 * `resume-api-plugin.ts`, and deliberately so: that file wants watchers to notice a save,
 * while these are listed under `server.watch.ignored` precisely so that nothing does.
 */
async function writeAtomically(file: string, body: string): Promise<void> {
  const temp = `${file}.tmp`;
  await writeFile(temp, body, "utf8");
  await rename(temp, file);
}

async function readBody(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Array<Buffer> = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function linkedinApi(): Plugin {
  return {
    name: "linkedin-api",
    apply: "serve",
    configureServer(server) {
      const root = server.config.root;
      const paths = {
        config: resolve(root, CONFIG_PATH),
        state: resolve(root, STATE_PATH),
        draft: resolve(root, DRAFT_PATH),
        draftBackup: resolve(root, DRAFT_BACKUP_PATH),
        resume: resolve(root, RESUME_PATH),
      };
      const log = (message: string) => server.config.logger.info(`linkedin-api: ${message}`, { timestamp: true });

      /**
       * Writes run one at a time. Two draft saves can arrive together -- a blur flush
       * overlapping the debounced one -- and the rotate-then-rename sequence is not safe
       * to interleave: the second request's rotate finds no draft, and its rename finds no
       * `.tmp` because the first has already renamed it.
       */
      let writes: Promise<unknown> = Promise.resolve();
      const serialised = <T>(work: () => Promise<T>): Promise<T> => {
        const next = writes.then(work, work);
        writes = next.catch(() => undefined);
        return next;
      };

      server.middlewares.use("/__linkedin", (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(body));
        };
        /** `req.url` is relative to the mount point, so `/__linkedin/state` arrives as `/state`. */
        const route = `${req.method ?? "?"} ${(req.url ?? "").split("?")[0]}`;

        const parseBody = async (): Promise<unknown> => {
          const raw = await readBody(req);
          try {
            return JSON.parse(raw);
          } catch (error) {
            throw Object.assign(new Error(`body is not valid JSON: ${(error as Error).message}`), { status: 400 });
          }
        };

        void (async () => {
          try {
            switch (route) {
              case "GET /bootstrap": {
                const [config, resume, state, draft] = await Promise.all([
                  readJson(paths.config, CONFIG_PATH),
                  readJson(paths.resume, RESUME_PATH),
                  readJsonIfPresent(paths.state, STATE_PATH),
                  readJsonIfPresent(paths.draft, DRAFT_PATH),
                ]);
                send(200, { config, resume, state, draft });
                return;
              }

              case "PUT /state": {
                const body = (await parseBody()) as { fields?: unknown };
                /**
                 * The gate is decided here from the files on disk, not trusted from the
                 * client. A client bug must not be able to write an unapproved state.
                 */
                const [config, resume] = await Promise.all([readJson(paths.config, CONFIG_PATH), readJson(paths.resume, RESUME_PATH)]);
                const generated = generate(resume as Record<string, unknown>, config);
                const errors = gateErrors(body.fields, generated.fields);
                if (errors.length > 0) {
                  send(409, { error: `${errors.length} field(s) not approved; nothing written`, errors });
                  return;
                }
                const state: ILinkedInState = {
                  savedAt: new Date().toISOString(),
                  inputSnapshot: generated.inputSnapshot,
                  configSnapshot: config as ILinkedInState["configSnapshot"],
                  fields: body.fields as ILinkedInState["fields"],
                };
                await serialised(() => writeAtomically(paths.state, stringify(state)));
                log(`wrote ${STATE_PATH}`);
                send(200, state);
                return;
              }

              case "PUT /draft": {
                const body = (await parseBody()) as { fields?: unknown };
                if (typeof body.fields !== "object" || body.fields === null) {
                  send(400, { error: "body does not look like a draft (needs a fields object)" });
                  return;
                }
                const draft = { ...body, savedAt: new Date().toISOString() };
                /**
                 * The previous draft is rotated aside before every write. Under autosave the
                 * draft is the only copy of unfinished work, so one bad write must not be
                 * able to take both the new text and the old.
                 */
                await serialised(async () => {
                  try {
                    await rename(paths.draft, paths.draftBackup);
                  } catch (error) {
                    if (!isMissing(error)) throw error;
                  }
                  await writeAtomically(paths.draft, stringify(draft));
                });
                send(200, { ok: true, savedAt: draft.savedAt });
                return;
              }

              case "DELETE /draft": {
                await serialised(async () => {
                  try {
                    await unlink(paths.draft);
                    log(`cleared ${DRAFT_PATH}`);
                  } catch (error) {
                    if (!isMissing(error)) throw error;
                  }
                });
                send(200, { ok: true });
                return;
              }

              default:
                send(405, { error: `${route} not supported` });
            }
          } catch (error) {
            const status = (error as { status?: number }).status ?? 500;
            send(status, { error: (error as Error).message });
          }
        })();
      });
    },
  };
}
