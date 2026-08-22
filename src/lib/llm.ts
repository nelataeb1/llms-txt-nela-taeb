import OpenAI from "openai";
import { firstSentences } from "./extract";
import type { CrawledPage, LlmsDocument, LlmsLink, LlmsSection } from "./types";

const MAX_PAGES = 120;

export function openaiModel(): string {
  return process.env.OPENAI_MODEL ?? "gpt-4o-mini";
}

export function llmAvailable(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

const SYSTEM_PROMPT = `You curate llms.txt files (see llmstxt.org) that help AI agents navigate a website.
You receive the site's crawled pages, each with a numeric id. Return JSON only:
{"title": string, "summary": string, "sections": [{"name": string, "items": [{"id": number, "title": string, "notes": string}]}]}

Rules:
- title: the product or organisation name, no tagline, no marketing punctuation.
- summary: one sentence (max 40 words) stating what the site/product is and who it serves. Never start with "This site".
- Group pages into 3-7 sections ordered by usefulness to an agent (documentation and reference first, marketing and legal last).
- Put low-value pages (legal, careers, duplicate landing pages) in a final section named exactly "Optional", or drop them.
- notes: max 15 words, concrete and factual, describing what the page contains. No filler like "Learn more".
- title for each item: short, specific, no site-name suffix.
- Only use ids that were provided; never invent pages. Keep at most 100 items in total.`;

/**
 * Rewrites the heuristically generated document with an LLM. Only ids that were
 * sent are accepted back, so URLs can never be hallucinated. Any failure falls
 * back to the heuristic document.
 */
export async function enrichWithLlm(
  document: LlmsDocument,
  pages: CrawledPage[],
  siteUrl: string,
): Promise<{ document: LlmsDocument; enriched: boolean; warning?: string }> {
  if (!llmAvailable()) return { document, enriched: false };

  const linked = new Map<string, CrawledPage>();
  for (const page of pages) linked.set(page.markdownUrl ?? page.url, page);

  const candidates = document.sections
    .flatMap((section) => section.links.map((link) => ({ link, page: linked.get(link.url) })))
    .filter((entry): entry is { link: (typeof entry)["link"]; page: CrawledPage } => Boolean(entry.page))
    .slice(0, MAX_PAGES);

  if (candidates.length === 0) return { document, enriched: false };

  const payload = {
    site: siteUrl,
    heuristicTitle: document.title,
    heuristicSummary: document.summary ?? "",
    pages: candidates.map((entry, id) => ({
      id,
      url: entry.link.url,
      path: entry.page.path,
      title: entry.link.title,
      description: firstSentences(entry.link.notes ?? "", 160),
      kind: entry.page.kind,
    })),
  };

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: openaiModel(),
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(payload) },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return { document, enriched: false, warning: "LLM returned an empty response" };
    return { document: applyLlmPlan(JSON.parse(raw), candidates, document), enriched: true };
  } catch (error) {
    return {
      document,
      enriched: false,
      warning: `LLM enrichment skipped: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

interface LlmPlan {
  title?: unknown;
  summary?: unknown;
  sections?: unknown;
}

function applyLlmPlan(
  plan: LlmPlan,
  candidates: { link: { title: string; url: string; notes?: string }; page: CrawledPage }[],
  fallback: LlmsDocument,
): LlmsDocument {
  const sections = Array.isArray(plan.sections) ? plan.sections : [];
  const used = new Set<number>();
  const rebuilt: LlmsSection[] = [];

  for (const rawSection of sections) {
    const section = rawSection as { name?: unknown; items?: unknown };
    const name = typeof section.name === "string" ? section.name.trim() : "";
    const items = Array.isArray(section.items) ? section.items : [];
    if (!name) continue;

    const links: LlmsLink[] = [];
    for (const rawItem of items) {
      const item = rawItem as { id?: unknown; title?: unknown; notes?: unknown };
      const id = typeof item.id === "number" ? item.id : Number(item.id);
      const candidate = candidates[id];
      if (!candidate || used.has(id)) continue;
      used.add(id);
      links.push({
        title: text(item.title) || candidate.link.title,
        url: candidate.link.url,
        notes: text(item.notes) || candidate.link.notes,
      });
    }
    if (links.length > 0) rebuilt.push({ name, links });
  }

  if (rebuilt.length === 0) return fallback;

  // Anything the model dropped stays reachable in the Optional section.
  const leftovers = candidates
    .map((candidate, id) => ({ candidate, id }))
    .filter(({ id }) => !used.has(id))
    .map(({ candidate }) => candidate.link);
  if (leftovers.length > 0) {
    const optional = rebuilt.find((section) => section.name.toLowerCase() === "optional");
    if (optional) optional.links.push(...leftovers.slice(0, 25));
    else rebuilt.push({ name: "Optional", links: leftovers.slice(0, 25) });
  }

  // "Optional" is conventionally last.
  rebuilt.sort((a, b) => Number(a.name.toLowerCase() === "optional") - Number(b.name.toLowerCase() === "optional"));

  return {
    title: text(plan.title) || fallback.title,
    summary: text(plan.summary) || fallback.summary,
    details: fallback.details,
    sections: rebuilt,
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
