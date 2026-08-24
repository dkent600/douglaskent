import Aurelia, { ConsoleSink, LoggerConfiguration, LogLevel } from "aurelia";
import { RouterConfiguration } from "@aurelia/router";

import "arrive"; // do bmd does it's thing whenever views are attached
import "node-waves";
import "bootstrap-material-design";

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
    RouterConfiguration.customize({
      useUrlFragmentHash: false,
      useHref: false,
      // see App.canLoad for this
      //   title: "Douglas Kent${appTitleSeparator}${componentTitles}",
    }),
  )
  .register(resources)
  .register(ResumeService)
  .register(ResumeStore)
  .register(ResumeDependencies)
  .app(App)
  .start();
