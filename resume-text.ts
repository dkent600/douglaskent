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
 */
export const stripHtml = (value: string): string => value.replace(/<[^>]*>/g, "").trim();
