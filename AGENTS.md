# douglaskent

Data-driven resume site. Aurelia 2 (`2.0.0-rc.2`) + Vite 7 SPA in TypeScript,
deployed to IIS over FTP.

## How it fits together

`src/static/resume.json` is the only place resume content is written (schema:
`src/static/schema.json`). Everything else renders it or is generated from it on
every build:

| Output | Produced by |
|---|---|
| The SPA: `/resume`, `/resume/short`, `/resume/expanded` | `src/pages/` |
| Head SEO tags and `dist/sitemap.xml` | `resume-head-plugin.ts` |
| JSON-LD in `<head>`, plus `src/static/resume-json-ld.json` | `resume-jsonld-plugin.ts` |
| `src/static/resume.txt` and `resume.docx` | `resume-txt-plugin.ts`, `resume-docx-plugin.ts`, sharing `resume-content.ts` |
| Prerendered snapshot in `dist/index.html` | `prerender-capture.mjs`, `prerender-insert.mjs` |

The head tags, JSON-LD and snapshot are for readers that don't run JavaScript:
search and AI crawlers, and link previewers. `web.config` lets three crawlers
back in past the host's server-level block list.

`npm run admin` opens `/admin`, a dev-server-only editor for `resume.json` plus a
LinkedIn field generator. None of it reaches a build.

Ship with `npm run release` (build, prerender, deploy). `README.md` has the detail
on routes, deployment and the snapshot. The source comments are thorough and
explain why things are done as they are; read them before changing anything.

## Skills

Frontend work here is covered by two skills in `.agents/skills/`:

- **`aurelia2`** — authoritative on Aurelia 2 framework usage.
- **`aurelia2-ex`** — project-specific conventions that override it.

**Read both before editing `index.html` or any file under `src/` other than
`src/static/`.** This holds however small the edit is or however unrelated to
Aurelia it seems. If they are not offered as skills, read
`.agents/skills/<name>/SKILL.md` directly. `aurelia2-ex` exists specifically to
correct `aurelia2`, so working from the base skill alone will produce code that
violates this project's conventions.

## No SSR

This is a client-rendered SPA and will stay one. Ignore the "Server-Side
Rendering and Prerendering" section of the `aurelia2` skill, do not read
`references/ssr.md`, and do not propose `aurelia2-ssr`, server rendering, or
hydration.

That does not rule out the prerendered snapshot the project already has, which
is a deliberate part of it. `prerender-capture.mjs` loads the built
`/resume/expanded` in headless Chromium and writes a JavaScript-free copy to
`index-prerender.html`; `prerender-insert.mjs` splices that into
`dist/index.html`, so crawlers that do not run JavaScript still get the resume.
The app removes the block when it boots — nothing hydrates it. Maintain it as
it is; see "The prerendered snapshot" in `README.md`.

## Stack — do not substitute

The `aurelia2` skill documents optional tooling this project does not use.
Do not introduce it.

- **Styling is Bootstrap 4 + bootstrap-material-design + SCSS.** Not Tailwind.
- **jQuery is a real dependency.** jQuery, `arrive`, `node-waves`, and
  `popper.js` are loaded through `src/vendor-globals.ts` and required by
  bootstrap-material-design. Do not remove them or treat them as legacy cruft.
- **There is no test framework.** No Vitest, Playwright Test, or Storybook. Do
  not add one without asking. `npm test` runs Node's built-in runner
  (`node --test`) over `check-jsonld.test.mjs`. The `playwright` package is a
  dev dependency only to drive headless Chromium for the prerender capture; it
  is not a licence to write Playwright tests.

## Logging

Already configured — `LoggerConfiguration` is registered in `src/main.ts` with
verbosity keyed off `import.meta.env.PROD`. Use `ILogger` with `scopeTo(...)`
and never `console.*`. `src/` currently contains zero `console.` calls; keep it
that way.

`@aurelia/kernel` is not a direct dependency. Import the logging API from the
`aurelia` meta-package, which re-exports it:

```typescript
import { ILogger, resolve } from "aurelia";
```

## Conventions

Follow the existing page/section shape when adding components: routed pages live
in `src/pages/<page>/` as `.ts` / `.html` / optional `.scss`, with child
components under `sections/` registered through a local `index.ts`. Do not
introduce a different scaffold layout.

Generated resume artifacts in `src/static/` are emitted at build time by the
`resume-*-plugin.ts` Vite plugins at the repo root. Do not hand-edit them.

## Commands

```bash
npm start          # dev server, opens browser
npm run admin      # dev server at /admin
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm run lint       # eslint + htmlhint + sass-lint
npm test           # node --test: JSON-LD checks
npm run prerender  # capture + splice the snapshot into dist/; run after build
npm run release    # build + prerender + deploy (deploys: see Deployment)
```

After any Aurelia change, run `npm run typecheck` **and** `npm run build`.
Template binding errors surface at runtime, not during typecheck, so a clean
typecheck alone does not mean the change works.

## Deployment

`npm run deploy` is FTP-based and depends on `web.config` plus a PowerShell
validation step. Do not run or modify it without being asked. The same goes for
`npm run release`, which ends in it.

The `deploy` script reads its FTP session commands from `ftpDeploy.txt` at the
repo root. That file is gitignored because it contains credentials, so it will
not be present in a fresh clone. Reading it is fine. Do not edit it, do not
recreate it if it is missing, and never commit it or paste its contents into a
file that would be committed.
