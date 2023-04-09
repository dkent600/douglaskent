import Aurelia from "aurelia";

import "arrive"; // do bmd does it's thing whenever views are attached
import "node-waves";
import "bootstrap-material-design";

import { Resume } from "./pages/resume/resume";
import { initializeMarkdown } from "./resources/value-converters/sanitizeHtml";
import { ResumeService } from "./services/resume-service";
import { ResumeStore } from "./stores/resume-store";
import * as resources from "./resources";

initializeMarkdown();

// eslint-disable-next-line prettier/prettier
void Aurelia
.register(resources)
.register(ResumeService)
.register(ResumeStore)
.app(Resume).start();
