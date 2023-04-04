import Aurelia from "aurelia";

import * as resources from "./resources";
import { Resume } from "./resume";
import { ResumeService } from "./resume-service";
import { ResumeStore } from "./resume-store";

// eslint-disable-next-line prettier/prettier
void Aurelia
.register(resources)
.register(ResumeService)
.register(ResumeStore)
.app(Resume).start();
