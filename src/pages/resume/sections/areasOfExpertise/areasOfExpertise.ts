import { customElement, resolve } from "aurelia";

import { IAreasOfExpertise, IResumeStore } from "../../../../stores/resume-store";

import template from "./areasOfExpertise.html";

@customElement({ name: "areas-of-expertise", template })
export class AreasOfExpertise {
  readonly resumeStore = resolve(IResumeStore);
  readonly areasOfExpertise: Array<IAreasOfExpertise> = this.resumeStore.areasOfExpertise;
}
