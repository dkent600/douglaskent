import Aurelia from "aurelia";

import "arrive"; // do bmd does it's thing whenever views are attached
import "node-waves";
import "bootstrap-material-design";

import { ResumeDependencies } from "./pages/resume/resume";
import { initializeMarkdown } from "./resources/value-converters/sanitizeHtml";
import { ResumeService } from "./services/resume-service";
import { ResumeStore } from "./stores/resume-store";
import * as resources from "./resources";
import { App } from "./pages/app/app";
import { RouterConfiguration } from "@aurelia/router";

initializeMarkdown();

// eslint-disable-next-line prettier/prettier
void Aurelia
.register(resources)
  .register(ResumeService)
  .register(ResumeStore)
  .register(ResumeDependencies)
  .register(RouterConfiguration.customize({ useUrlFragmentHash: false, useHref: false}))
  .app(App)
  .start();
