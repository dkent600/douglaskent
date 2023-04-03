import { valueConverter } from "aurelia";
import DOMPurify from "dompurify";

/**
 * Html Sanitizer to prevent script injection.
 */
@valueConverter('sanitizeHTML')
export class sanitizeHTML {

  constructor(
    private domPurify: DOMPurify,
  ) { }

  toView(input: string): string {
    return this.domPurify.sanitize(input, { USE_PROFILES: { html: true } });
  }
}