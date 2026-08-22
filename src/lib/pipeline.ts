import { type CrawlState, crawlStats } from "./crawl";
import { buildDocument, buildSiteProfile, renderLlmsFullTxt, renderLlmsTxt } from "./generate";
import { enrichWithLlm, llmAvailable } from "./llm";
import type { GenerationResult } from "./types";
import { validateLlmsTxt } from "./validate";

/** Turns a finished crawl into the generated files plus their validation report. */
export async function buildResult(state: CrawlState): Promise<GenerationResult> {
  const warnings: string[] = [];
  const site = buildSiteProfile(state.entryUrl, state.pages, state.siteName);
  let document = buildDocument(site, state.pages);
  let enrichedByLlm = false;

  if (state.options.useLlm) {
    if (!llmAvailable()) {
      warnings.push("OPENAI_API_KEY is not set — used heuristic grouping and descriptions.");
    } else {
      const enrichment = await enrichWithLlm(document, state.pages, state.entryUrl);
      document = enrichment.document;
      enrichedByLlm = enrichment.enriched;
      if (enrichment.warning) warnings.push(enrichment.warning);
    }
  }

  const llmsTxt = renderLlmsTxt(document);
  const validation = validateLlmsTxt(llmsTxt);
  for (const issue of validation.issues) {
    if (issue.level === "error") warnings.push(`Spec error: ${issue.message}`);
  }
  if (state.pages.length === 0) {
    warnings.push("No pages could be fetched — the site may block automated requests.");
  }

  return {
    site: { ...site, name: document.title, summary: document.summary ?? site.summary },
    document,
    llmsTxt,
    llmsFullTxt: state.options.includeFullText
      ? renderLlmsFullTxt(document, state.pages)
      : undefined,
    pages: state.pages,
    stats: crawlStats(state),
    enrichedByLlm,
    warnings,
  };
}
