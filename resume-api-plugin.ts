import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { Plugin } from "vite";

/**
 * Serves and writes `src/static/resume.json` for the `/admin` editor.
 *
 * `apply: "serve"` and `configureServer` both mean this exists only under `vite dev`.
 * There is deliberately no production counterpart: the site is static files on FTP
 * hosting, so the deployed app has nothing to write to and no business writing it.
 */
const RESUME_PATH = "src/static/resume.json";

/**
 * The document is round-tripped through `JSON.parse`/`JSON.stringify`, which matches the
 * file's existing 2-space indentation and absence of a trailing newline, so a save that
 * changes one field produces a one-field diff.
 */
const stringify = (resume: unknown): string => JSON.stringify(resume, null, 2);

/**
 * Enough of a shape check to refuse to overwrite the file with something that is
 * syntactically JSON but obviously not the resume.
 */
function isResumeShaped(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const resume = value as Record<string, unknown>;
  return Array.isArray(resume.work) && Array.isArray(resume.skills) && Array.isArray(resume.skillCategories);
}

async function readBody(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Array<Buffer> = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function resumeApi(): Plugin {
  return {
    name: "resume-api",
    apply: "serve",
    configureServer(server) {
      const file = resolve(server.config.root, RESUME_PATH);

      server.middlewares.use("/__resume", (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(body));
        };

        void (async () => {
          try {
            if (req.method === "GET") {
              send(200, JSON.parse(await readFile(file, "utf8")));
              return;
            }

            if (req.method === "PUT") {
              const raw = await readBody(req);
              let parsed: unknown;
              try {
                parsed = JSON.parse(raw);
              } catch (error) {
                send(400, { error: `body is not valid JSON: ${(error as Error).message}` });
                return;
              }
              if (!isResumeShaped(parsed)) {
                send(400, { error: "body does not look like a resume (needs work, skills and skillCategories arrays)" });
                return;
              }
              /**
               * Written in place rather than via a write-to-temp-and-rename. A rename
               * replaces the file instead of modifying it, and file watchers routinely
               * miss that -- VS Code's does on Windows, which left both an open editor
               * tab and the Source Control diff showing stale content after a save that
               * had in fact succeeded. An in-place write is what watchers notice.
               *
               * The atomicity that buys is worth little here: the body is parsed and
               * shape-checked before this point, the file is 80 KB on a local disk, and
               * it is tracked in git.
               */
              await writeFile(file, stringify(parsed), "utf8");
              server.config.logger.info(`resume-api: wrote ${RESUME_PATH}`, { timestamp: true });
              send(200, { ok: true });
              return;
            }

            send(405, { error: `${req.method ?? "?"} not supported; use GET or PUT` });
          } catch (error) {
            send(500, { error: (error as Error).message });
          }
        })();
      });
    },
  };
}
