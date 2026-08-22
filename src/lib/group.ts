import { rankPages, scorePage } from "./classify";
import type { CrawledPage, LlmsSection, PageKind } from "./types";
import { normalizeUrl, pathSegments, titleFromPath } from "./url";

const SECTION_NAMES: Record<PageKind, string> = {
  home: "Overview",
  docs: "Documentation",
  api: "API Reference",
  guide: "Guides & Tutorials",
  product: "Product",
  blog: "Blog & Updates",
  company: "Company",
  support: "Support",
  legal: "Optional",
  other: "Other Pages",
};

const SECTION_ORDER: PageKind[] = [
  "home",
  "docs",
  "api",
  "guide",
  "product",
  "company",
  "support",
  "blog",
  "other",
  "legal",
];

export interface GroupOptions {
  maxLinksPerSection: number;
  maxLinks: number;
}

export const DEFAULT_GROUP_OPTIONS: GroupOptions = { maxLinksPerSection: 25, maxLinks: 120 };

/**
 * Buckets pages into llms.txt sections. Pages are grouped by kind, large "other"
 * buckets are split by their top-level path, and low value pages (legal,
 * overflow) land in the conventional trailing "Optional" section.
 */
export function groupPages(
  pages: CrawledPage[],
  entryUrl: string,
  options: GroupOptions = DEFAULT_GROUP_OPTIONS,
): LlmsSection[] {
  const entry = normalizeUrl(entryUrl) ?? entryUrl;
  const seen = new Set<string>();
  const ranked = rankPages(pages).filter((page) => {
    const target = page.markdownUrl ?? page.url;
    const isEntry = [page.url, target].some((url) => (normalizeUrl(url) ?? url) === entry);
    if (isEntry || seen.has(target)) return false;
    seen.add(target);
    return true;
  });
  const buckets = new Map<string, CrawledPage[]>();
  const optional: CrawledPage[] = [];

  for (const page of ranked) {
    const name = page.kind === "legal" ? "Optional" : bucketName(page);
    if (name === "Optional") {
      optional.push(page);
      continue;
    }
    const bucket = buckets.get(name) ?? [];
    bucket.push(page);
    buckets.set(name, bucket);
  }

  // Fold single page buckets that came from path splitting back into "Other Pages".
  for (const [name, bucket] of [...buckets]) {
    if (bucket.length === 1 && !Object.values(SECTION_NAMES).includes(name)) {
      buckets.delete(name);
      buckets.set(SECTION_NAMES.other, [...(buckets.get(SECTION_NAMES.other) ?? []), ...bucket]);
    }
  }

  let budget = options.maxLinks;
  const sections: LlmsSection[] = [];

  for (const name of orderedNames([...buckets.keys()])) {
    const bucket = buckets.get(name) ?? [];
    const kept = bucket.slice(0, options.maxLinksPerSection);
    optional.push(...bucket.slice(options.maxLinksPerSection));
    const withinBudget = kept.slice(0, Math.max(budget, 0));
    optional.push(...kept.slice(withinBudget.length));
    budget -= withinBudget.length;
    if (withinBudget.length > 0) {
      sections.push({ name, links: withinBudget.map(toLink) });
    }
  }

  const optionalLinks = rankPages(optional)
    .slice(0, Math.max(Math.min(options.maxLinksPerSection, budget), 0))
    .map(toLink);
  if (optionalLinks.length > 0) sections.push({ name: "Optional", links: optionalLinks });

  return sections;
}

function bucketName(page: CrawledPage): string {
  if (page.kind !== "other") return SECTION_NAMES[page.kind];
  const [first] = pathSegments(page.url);
  return first ? titleFromPath(`https://x/${first}`) : SECTION_NAMES.other;
}

function orderedNames(names: string[]): string[] {
  const canonical = SECTION_ORDER.map((kind) => SECTION_NAMES[kind]);
  return [...names].sort((a, b) => {
    const indexA = canonical.indexOf(a);
    const indexB = canonical.indexOf(b);
    if (indexA === -1 && indexB === -1) return a.localeCompare(b);
    if (indexA === -1) return canonical.indexOf(SECTION_NAMES.other) - indexB;
    if (indexB === -1) return indexA - canonical.indexOf(SECTION_NAMES.other);
    return indexA - indexB;
  });
}

function toLink(page: CrawledPage) {
  return {
    title: page.title || titleFromPath(page.url),
    // The spec prefers links that resolve to LLM friendly content.
    url: page.markdownUrl ?? page.url,
    notes: page.description || undefined,
  };
}

export function pickHighlights(pages: CrawledPage[], count: number): CrawledPage[] {
  return rankPages(pages)
    .filter((page) => scorePage(page) > 0)
    .slice(0, count);
}
