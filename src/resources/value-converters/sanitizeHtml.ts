import { valueConverter } from "aurelia";

import { sanitize } from "dompurify";

/**
 * Html Sanitizer to prevent script injection.
 */
@valueConverter("sanitizeHTML")
export class sanitizeHTMLValueConverter {
  toView(input: string): string {
    return sanitize(input, { USE_PROFILES: { html: true } });
  }
}
