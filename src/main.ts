import Aurelia from "aurelia";
import { RouterConfiguration } from "@aurelia/router-lite";

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
  .register(RouterConfiguration.customize({ useUrlFragmentHash: false, useHref: false }))
  .register(resources)
  .register(ResumeService)
  .register(ResumeStore)
  .register(ResumeDependencies)
  .app(App)
  .start();
