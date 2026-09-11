/**
 * Text helpers shared by the transformers that derive a published artifact from
 * `src/static/resume.json`.
 *
 * What lives here is only what more than one transformer needs. Normalization that is
 * particular to one output format -- ASCII folding for the plain-text resume, HTML
 * escaping for the JSON-LD block -- stays with that transformer, because `resume.json`
 * keeps its own typography and each format is responsible for rendering it.
 */

/**
 * Removes tags from a field that carries markup.
 *
 * Several `work` summaries and highlights are authored as HTML because the page renders
 * them as HTML; any consumer that is not the page has to take the text out. This is a tag
 * strip and nothing more -- it does not decode entities, so a caller that needs plain
 * characters decodes them itself.
 *
 * NOT A SANITIZER. It is a normalizer for turning authored markup into readable text, and it
 * happens to remove most tags, which is exactly what makes it tempting to lean on. Do not.
 * The pattern is `/<[^>]*>/g`, so it needs a closing `>` to match: a well-formed `</script>`
 * is removed, and an unclosed `</script` passes through untouched. HTML ends a script element
 * on `</script` followed by whitespace, `/` or `>`, so the form that survives this function is
 * the dangerous one -- stripping is not a defence, it is a near-miss.
 *
 * What actually protects the JSON-LD block is `escapeForScript` in `resume-jsonld-plugin.ts`,
 * which escapes `<` in the inlined copy. That is load-bearing rather than belt-and-braces:
 * remove it and the summaries become able to close their own `<script>` tag. It is covered by
 * a synthetic fixture in `check-jsonld.test.mjs`, because the real resume has no `<` anywhere
 * and therefore cannot exercise it.
 */
export const stripHtml = (value: string): string => value.replace(/<[^>]*>/g, "").trim();
