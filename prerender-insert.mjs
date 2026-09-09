import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Splices the prerendered resume captured by `prerender-capture.mjs` into the built
 * shell, so that the served `dist/index.html` carries the resume as markup rather than
 * as an empty mount point waiting for JavaScript.
 *
 * Every check here throws. This runs against build output, and a half-applied splice is
 * worse than no splice: the failure modes are a shell that looks complete but is missing
 * work entries, or a double insertion. Both are invisible in a browser that runs the app
 * normally, because Aurelia renders over the top of whatever is already there.
 */

const RESUME_PATH = "src/static/resume.json";

const CAPTURE_PATH = "index-prerender.html";

const SHELL_PATH = "dist/index.html";

/**
 * Matched literally, and it must appear exactly once in the shell. `index.html` carries a
 * comment above it explaining as much; that comment deliberately does not reproduce the
 * delimited form of this string, because the replacement below takes the first match and
 * a second occurrence would splice the block into the middle of a comment.
 */
const MARKER = "<!-- prerender:insert -->";

/**
 * The wrapper element's attributes.
 *
 * Whether this block should be visible or hidden to a reader without JavaScript is an
 * open decision. It ships visible: adding `hidden` to this constant is the one change
 * that makes it invisible.
 *
 * The id is also the guard against inserting twice, so it has to stay in whatever this
 * becomes.
 */
const WRAPPER_ATTRS = 'id="prerendered-resume"';

/**
 * A floor, not a target. The capture is around 113 KB; anything under this means the
 * capture failed in a way that still produced a file, and the entry count below will
 * usually have caught it first. Both guards are cheap and they fail differently.
 */
const MINIMUM_BYTES = 20000;

const resume = JSON.parse(await readFile(resolve(process.cwd(), RESUME_PATH), "utf8"));

/**
 * Taken from the source rather than hardcoded, so adding a job to `resume.json` does not
 * leave a stale number here asserting the wrong thing.
 */
const expected = resume.work.length;

const capture = await readFile(resolve(process.cwd(), CAPTURE_PATH), "utf8");

/**
 * Only the body is taken. The capture's `<head>` exists to make that file viewable on its
 * own and holds stylesheet paths rewritten to reach `dist/assets` from the repo root --
 * correct there, wrong in anything served from the site root.
 */
const open = capture.indexOf("<body>");
const close = capture.lastIndexOf("</body>");
if (open === -1 || close === -1) {
  throw new Error(`${CAPTURE_PATH} has no body tags; it is not a capture document`);
}

const markup = capture.slice(open + "<body>".length, close).trim();

const bytes = Buffer.byteLength(markup, "utf8");
if (bytes < MINIMUM_BYTES) {
  throw new Error(`prerendered markup is ${bytes} bytes, below the ${MINIMUM_BYTES} byte minimum`);
}

const entries = (markup.match(/data-work-entry/g) || []).length;
if (entries !== expected) {
  throw new Error(`prerendered markup has ${entries} work entries, expected ${expected}`);
}

const shellPath = resolve(process.cwd(), SHELL_PATH);
const shell = await readFile(shellPath, "utf8");
const before = Buffer.byteLength(shell, "utf8");

/**
 * Running twice against one build is a mistake rather than something to repair. The
 * marker is gone after the first pass, so the second would have nothing to match anyway;
 * this reports the actual cause instead of the missing marker further down.
 */
if (shell.includes(WRAPPER_ATTRS)) {
  throw new Error(`${SHELL_PATH} is already prerendered; rebuild before inserting again`);
}

if (!shell.includes(MARKER)) {
  throw new Error(`${SHELL_PATH} does not contain the marker ${MARKER}`);
}

const block = `<div ${WRAPPER_ATTRS}>\n${markup}\n</div>`;

/**
 * The replacement is a function, and that is load bearing rather than a style choice.
 * `String.prototype.replace` with a string replacement interprets `$&`, `` $` ``, `$'`
 * and `$1` in the replacement as substitution patterns. The markup here is 113 KB of
 * resume prose and URLs, so a `$&` anywhere in it would silently expand to the matched
 * marker and corrupt the output with no error. A function replacement is returned
 * verbatim.
 */
const inserted = shell.replace(MARKER, () => block);
const after = Buffer.byteLength(inserted, "utf8");

await writeFile(shellPath, inserted, "utf8");

console.log(
  `prerender insert: ${bytes} bytes of markup, ${entries} work entries; ` +
    `${SHELL_PATH} ${before} -> ${after} bytes`,
);
