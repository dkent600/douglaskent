# douglaskent

Data-driven resume site. Aurelia 2 (`2.0.0-rc.2`) + Vite 7 SPA in TypeScript,
deployed to IIS over FTP.

## Skills

Frontend work here is covered by two skills in `.claude/skills/`:

- **`aurelia2`** — authoritative on Aurelia 2 framework usage.
- **`aurelia2-ex`** — project-specific conventions that override it.

**Always load both.** `aurelia2-ex` exists specifically to correct `aurelia2`,
so working from the base skill alone will produce code that violates this
project's conventions.

## No SSR

This is a client-rendered SPA and will stay one. Ignore the "Server-Side
Rendering and Prerendering" section of the `aurelia2` skill, do not read
`references/ssr.md`, and do not propose `aurelia2-ssr`, prerendering, or
hydration.

## Stack — do not substitute

The `aurelia2` skill documents optional tooling this project does not use.
Do not introduce it.

- **Styling is Bootstrap 4 + bootstrap-material-design + SCSS.** Not Tailwind.
- **jQuery is a real dependency.** jQuery, `arrive`, `node-waves`, and
  `popper.js` are loaded through `src/vendor-globals.ts` and required by
  bootstrap-material-design. Do not remove them or treat them as legacy cruft.
- **There is no test framework.** No Vitest, Playwright, or Storybook. Do not
  add one without asking.

## Logging

Already configured — `LoggerConfiguration` is registered in `src/main.ts` with
verbosity keyed off `import.meta.env.PROD`. Per `aurelia2-ex`, use `ILogger`
with `scopeTo(...)` and never `console.*`. `src/` currently contains zero
`console.` calls; keep it that way.

Import from the `aurelia` meta-package, **not** `@aurelia/kernel`:

```typescript
import { ILogger, resolve } from "aurelia";
```

`@aurelia/kernel` is not a direct dependency of this project. The `aurelia2-ex`
examples import from it, which is wrong here — follow `src/main.ts` instead.

## Structure

- `src/pages/<page>/` — routed pages (`app`, `resume`, `admin`, `not-found`),
  each with `.ts` / `.html` / optional `.scss`
- `src/pages/<page>/sections/` — child components, registered through a local
  `index.ts`
- `src/services/`, `src/stores/` — `ResumeService`, `ResumeStore`, registered in
  `src/main.ts`
- `src/resources/` — value converters and custom attributes, registered as a
  namespace import
- `src/static/` — generated resume artifacts (`.json`, `.docx`, `.txt`, JSON-LD)
- `resume-*-plugin.ts` at the repo root — custom Vite plugins that emit those
  artifacts during build

Follow the existing page/section shape when adding components. Do not introduce
a different scaffold layout.

## Commands

```bash
npm start          # dev server, opens browser
npm run admin      # dev server at /admin
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm run lint       # eslint + htmlhint + sass-lint
```

After any Aurelia change, run `npm run typecheck` **and** `npm run build`.
Template binding errors surface at runtime, not during typecheck, so a clean
typecheck alone does not mean the change works.

Deployment (`npm run deploy`) is FTP-based and depends on `web.config` plus a
PowerShell validation step. Do not run or modify it without being asked.

The `deploy` script reads its FTP session commands from `ftpDeploy.txt` at the
repo root. That file is listed in `.gitignore` because it contains credentials,
so it will not be present in a fresh clone and must never be committed. Do not
create, edit, or read it back into a response without explicit approval.
