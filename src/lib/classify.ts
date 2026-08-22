import type { CrawledPage, PageKind } from "./types";
import { pathSegments } from "./url";

interface KindRule {
  kind: PageKind;
  segments: RegExp;
}

/** Ordered: the first rule that matches any path segment wins. */
const KIND_RULES: KindRule[] = [
  { kind: "api", segments: /^(api|api-reference|reference|sdk|endpoints|openapi|graphql)$/ },
  { kind: "docs", segments: /^(docs?|documentation|manual|handbook|developers?|dev|learn)$/ },
  { kind: "guide", segments: /^(guides?|tutorials?|how-?tos?|getting-?started|quick-?start|recipes|cookbook|examples?)$/ },
  { kind: "blog", segments: /^(blog|news|posts?|articles?|changelog|releases?|updates?|press|newsroom)$/ },
  { kind: "product", segments: /^(products?|features?|solutions?|platform|pricing|plans|use-?cases?|integrations?)$/ },
  { kind: "company", segments: /^(about|about-us|company|team|careers?|jobs|customers?|case-stud(y|ies)|partners?|investors?)$/ },
  { kind: "support", segments: /^(support|help|faqs?|contact|community|status|troubleshooting)$/ },
  { kind: "legal", segments: /^(legal|privacy|terms|tos|cookies?|security|compliance|gdpr|dpa|licen[cs]e)$/ },
];

export function classifyPage(url: string): PageKind {
  const segments = pathSegments(url).map((segment) => segment.toLowerCase());
  if (segments.length === 0) return "home";
  for (const rule of KIND_RULES) {
    if (segments.some((segment) => rule.segments.test(segment))) return rule.kind;
  }
  return "other";
}

const KIND_WEIGHT: Record<PageKind, number> = {
  home: 100,
  docs: 40,
  api: 38,
  guide: 34,
  product: 26,
  blog: 12,
  company: 14,
  support: 16,
  legal: 2,
  other: 10,
};

/**
 * Ranks pages so the generated file leads with the pages an agent actually
 * needs. Signals: page kind, crawl depth, navigation membership, inbound links,
 * sitemap presence and content volume.
 */
export function scorePage(page: CrawledPage): number {
  let score = KIND_WEIGHT[page.kind];
  score -= page.depth * 8;
  score += Math.min(page.inboundLinks, 12) * 2.5;
  if (page.inNav) score += 18;
  if (page.fromSitemap) score += 6;
  if (page.markdownUrl) score += 10;
  if (page.description) score += 8;
  score += Math.min(page.wordCount / 300, 6);
  if (/\/(page|tag|category|author)\/\d*/.test(page.path)) score -= 20;
  if (pathSegments(page.url).length > 4) score -= 6;
  return score;
}

export function rankPages(pages: CrawledPage[]): CrawledPage[] {
  return [...pages].sort((a, b) => scorePage(b) - scorePage(a));
}
