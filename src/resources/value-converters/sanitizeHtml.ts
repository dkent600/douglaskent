import { valueConverter } from "aurelia";

import DOMPurify from "dompurify";

export const initializeMarkdown = () => {
  // For temporarily saving original target value
  const TEMP_TARGET_ATTRIBUTE = "data-target-temp";

  DOMPurify.addHook("beforeSanitizeAttributes", function (node) {
    let targetValue;
    // Preserve default target attribute value
    if (node.tagName === "A") {
      targetValue = node.getAttribute("target");

      if (targetValue) {
        node.setAttribute(TEMP_TARGET_ATTRIBUTE, targetValue);
      }
      // else {
      //   // set default value
      //   node.setAttribute("target", "_self");
      // }
    }
  });

  DOMPurify.addHook("afterSanitizeAttributes", function (node) {
    if (node.tagName === "A" && node.hasAttribute(TEMP_TARGET_ATTRIBUTE)) {
      node.setAttribute("target", node.getAttribute(TEMP_TARGET_ATTRIBUTE) ?? "");
      node.removeAttribute(TEMP_TARGET_ATTRIBUTE);

      // set `rel="noopener"` to prevent another security issue.
      if (node.getAttribute("target") === "_blank") {
        node.setAttribute("rel", "noopener noreferrer");
      }
    }
  });
};

/**
 * Html Sanitizer to prevent script injection.
 */
@valueConverter("sanitizeHTML")
export class sanitizeHTMLValueConverter {
  toView(input: string): string {
    return DOMPurify.sanitize(input, { USE_PROFILES: { html: true } });
  }
}
