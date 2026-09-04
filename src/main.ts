import Aurelia, { ConsoleSink, LoggerConfiguration, LogLevel } from "aurelia";
import { RouterConfiguration } from "@aurelia/router";

import "./vendor-globals";

import { App } from "./pages/app/app";
import { ResumeDependencies } from "./pages/resume/resume";
import { initializeMarkdown } from "./resources/value-converters/sanitizeHtml";
import { ResumeService } from "./services/resume-service";
import { ResumeStore } from "./stores/resume-store";
import * as resources from "./resources";

initializeMarkdown();

// eslint-disable-next-line prettier/prettier
void Aurelia
  /**
   * Application logging goes through `ILogger`, never `console`. Verbosity is set here
   * rather than by commenting calls in and out. The logger API is re-exported by the
   * `aurelia` meta-package, so it does not need `@aurelia/kernel` as a direct dependency.
   */
  .register(
    LoggerConfiguration.create({
      level: import.meta.env.PROD ? LogLevel.warn : LogLevel.debug,
      sinks: [ConsoleSink],
    }),
  )
  .register(
    /**
     * No global `title` template. It used to sit here commented out as
     * `"Douglas Kent${appTitleSeparator}${componentTitles}"`, above a note pointing at
     * `App.canLoad` -- a method that does not exist and never has; the hook it meant is
     * `Resume.canLoad`, which decides which `resume/*rest` values are valid and has
     * nothing to do with titles.
     *
     * The option is moot now regardless. The route titles in `src/pages/app/app.ts` are
     * built from `basics.metaTitle`, which already begins with the name, so prefixing it
     * again would publish "Douglas Kent - Douglas Kent — ...".
     */
    RouterConfiguration.customize({
      useUrlFragmentHash: false,
      useHref: false,
    }),
  )
  .register(resources)
  .register(ResumeService)
  .register(ResumeStore)
  .register(ResumeDependencies)
  .app(App)
  .start();
