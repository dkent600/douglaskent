# Douglas Kent Resume

The data-driven resume behind [www.douglaskent.com](https://www.douglaskent.com). All content lives in
`src/static/resume.json` (validated against `src/static/schema.json`); the application is the renderer.
Aurelia 2 and TypeScript, bundled by Vite.

This project was bootstrapped by [aurelia/new](https://github.com/aurelia/new), updated to Aurelia version rc.2.

## Prerequisites

Node `^20.19.0 || >=22.12.0`, as required by Vite 7.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm start` | Dev server on port 9000, opens a browser |
| `npm run debug` | Same dev server, without opening a browser |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the built `dist/` to check it before deploying |
| `npm run typecheck` | `tsc --noEmit`, using the TypeScript version this project pins |
| `npm run lint` | eslint, htmlhint and sass-lint (`lint:js`, `lint:html`, `lint:css` individually) |
| `npm run lint:js.fix` | eslint with `--fix` |
| `npm run clean` | Delete `node_modules` and the lockfile, then reinstall |
| `npm run deploy` | FTP upload driven by `ftpDeploy.txt` |

## Routes

| URL | Shows |
| --- | --- |
| `/` | Redirects to `/resume` |
| `/resume` | The complete resume |
| `/resume/short` | The condensed resume: anything marked `resume-type="complete"` is hidden, and short-only passages appear instead |
| `/resume/expanded` | Starts with the collapsible sections already open: skills pills, the full work history, and publications |
| `/expanded` | Redirects to `/resume/expanded` |
| `/resume/short/expanded` | Redirects to `/resume/expanded` -- `short` and `expanded` are mutually exclusive |
| `/techresume` | Redirects to `/resume` |
| anything else | The not-found page, which reports the address that failed and links to the three real ones |

The canonical link in `index.html` uses `/resume/expanded`. The older
`?expanded=<anything non-empty>` query string still turns expansion on, so links already indexed
against the previous canonical URL keep working -- but only on the complete resume. On
`/resume/short` it is ignored, the same as any other unrecognised query parameter, because
`short` and `expanded` are mutually exclusive and the query string is not a way around that.

The root path is served by the `default` attribute on `<au-viewport>` rather than by an `""`
route path, because the router warns (`AUR3176`) on any empty path. The visible effect is that
`/` normalises to `/resume` in the address bar.

### Why the resume route uses a star segment

`resume/*rest` looks heavier than `resume/:option?`, and the difference matters. The router
matches hierarchically: `resume/:option?` matches `/resume/a/b` as `resume/a` and leaves `b`
over, which it then tries to resolve as a *child* route of `resume`. `resume.html` has no child
viewport, so that throws `AUR3401` and renders a blank page -- and it cannot be caught, because
the router deliberately does not raise a navigation-error event for an unknown route. A star
segment consumes every trailing segment, so nothing is ever left over, and `Resume.canLoad`
decides which values are valid and redirects the rest to `not-found`.

The short and complete variants are driven by the `resume-type` custom attribute in
`src/resources/attributes/whichResumeOnly.ts`.

## Build output and deploying

`npm run build` writes `dist/index.html` (generated from the root `index.html`) plus hashed bundles in
`dist/assets/`. It also emits `dist/stats.html`, a bundle size report that does not need deploying.

The asset hashes change whenever their contents change, and `dist/index.html` is what points at them, so
**always deploy `index.html` together with `dist/assets`** -- shipping one without the other leaves the
site referencing bundles that are not there.

Copy to the production root folder:

```
base.css
favicon.ico
dist/index.html
dist/assets
```

## Dependency notes

Aurelia and TypeScript versions are pinned exactly rather than floating on `latest`, so an install cannot
change the framework version underneath the app.

Two things worth knowing before changing dependencies:

* **Prefer `npm run clean` over an incremental install when Aurelia versions change.** npm sometimes
  nests duplicate copies of the `@aurelia/*` packages under individual dependents instead of hoisting
  one copy. Two copies means two module instances, which breaks dependency injection at runtime while
  still building successfully.
* **`vite.config.ts` passes `useDev` to the Aurelia plugin deliberately.** Without it, production builds
  resolve Aurelia's `development` export condition and bundle the development builds, error message text
  and all. See [aurelia/aurelia#2463](https://github.com/aurelia/aurelia/issues/2463); the comment in
  `vite.config.ts` explains it in place.

## App data flow

In this **Aurelia** application, data flows through a structured pipeline involving **Views**, **ViewModels**, **Stores**, and **Services**.

### 1. Views (`.html`)

* **Role:** The presentation layer of the application.
* **Interaction:** Views are paired with ViewModels and bind to their public properties and methods using Aurelia’s binding system.
* **Responsibility:**

  * Handle display logic only.
  * Apply formatting (e.g., currency, dates, numbers) to data provided by the ViewModel.

### 2. ViewModels (`.ts`)

* **Role:** UI controllers that connect Views to application logic.
* **Interaction:** ViewModels are paired one-to-one with Views and are responsible for orchestrating UI behavior.
* **Responsibility:**

  * Inject Stores as needed.
  * Delegate data retrieval, transformation, and business logic to Stores.
  * Expose observable properties for the View to bind to.
  * Handle user interaction and lifecycle events (`binding`, `attached`, etc.).

### 3. Stores (Independent State & Logic Managers)

* **Role:** Centralized modules that manage state, business logic, and coordination of data.
* **Interaction:** Injected into ViewModels (or other Stores if needed).
* **Responsibility:**

  * Act as the middle layer between ViewModels and Services.
  * Call Services to fetch raw data.
  * Apply business rules and transformations.
  * Cache and manage shared application state.

### 4. Services (Data Access Layer)

* **Role:** Interface with external resources like APIs, databases, or smart contracts.
* **Interaction:** Injected into Stores.
* **Responsibility:**

  * Make HTTP requests or contract calls.
  * Return raw, unformatted data.
  * Remain stateless and reusable.

---

### Summary of Flow

```
[ View ] → binds to → [ ViewModel ] → uses → [ Store ] → calls → [ Service ]
```

This separation supports:

* **Reusability** of Stores across different ViewModels
* **Testability** by isolating logic in Stores and Services
* **Clean UI logic** by keeping ViewModels slim and focused

### Where that lives in this repo

| Layer | Location |
| --- | --- |
| Views and ViewModels | `src/pages/`, one folder per section under `src/pages/resume/sections/` |
| Stores | `src/stores/resume-store.ts` |
| Services | `src/services/resume-service.ts` |
| Value converters and custom attributes | `src/resources/` |
| Content | `src/static/resume.json` |

The model types are derived from the JSON rather than declared by hand: `IResume` is `typeof resumeJson`,
and the store exposes aliases off it such as `ICompany = IResume["work"][0]`. Adding a field to
`resume.json` therefore makes it available to the templates with no type changes. Because those types
describe stored data, view state has no place in them -- see `ICompanyView` in
`src/pages/resume/sections/history/history.ts` for how that is layered on.

Since the resume is a static JSON import, the Service layer here is a thin one: it imports the JSON and
re-exports it along with its inferred types. It exists to keep the seam in place should the content ever
move behind an API.
