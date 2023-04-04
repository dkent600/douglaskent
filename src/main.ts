import Aurelia from "aurelia";

import { Resume } from "./resume";
import { ResumeService } from "./resume-service";
import { ResumeStore } from "./resume-store";

void Aurelia.register(ResumeService).register(ResumeStore).app(Resume).start();
