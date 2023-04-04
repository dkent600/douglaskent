import Aurelia from "aurelia";

import { Resume } from "./pages/resume/resume";
import { ResumeService } from "./services/resume-service";
import { ResumeStore } from "./stores/resume-store";
import * as resources from "./resources";

// eslint-disable-next-line prettier/prettier
void Aurelia
.register(resources)
.register(ResumeService)
.register(ResumeStore)
.app(Resume).start();
