import { valueConverter } from "aurelia";

/**
 * Splits a string on a separator, for rendering its parts as separate elements.
 *
 * A converter rather than a getter so the binding still names the source property --
 * `basics.label | split:" · "` -- and an edit to it from the admin page re-runs the split
 * through ordinary property observation. A string without the separator comes back as one
 * part; anything that is not a string comes back as no parts, so the repeat renders nothing.
 */
@valueConverter("split")
export class SplitValueConverter {
  toView(input: unknown, separator: string): Array<string> {
    return typeof input === "string" && input !== "" ? input.split(separator) : [];
  }
}
