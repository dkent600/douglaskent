import { INode, watch, customAttribute, resolve, bindable } from 'aurelia';
  
@customAttribute({ name: 'resume-type' }) 
export class WhichResumeOnly {
    // initialized in resume.ts
    static isShort = false;
    private element = resolve(INode) as HTMLElement;

    @bindable private which: "complete" | "short" = "complete";
    
    constructor() {
    } 

    bound() {
      this.showHideElement();
  }

    private showHideElement(): void
    {
      if (WhichResumeOnly.isShort && this.which === "complete" || !WhichResumeOnly.isShort && this.which === "short") {
        this.element.style.display = "none";
      }
    }
  }