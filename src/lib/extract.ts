import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import { normalizeUrl, titleFromPath } from "./url";

export interface ExtractedPage {
  title: string;
  description: string;
  text: string;
  wordCount: number;
  links: string[];
  navLinks: string[];
  canonical?: string;
  markdownUrl?: string;
  noindex: boolean;
  siteName?: string;
  language?: string;
  contentHash: string;
}

const BOILERPLATE = "script, style, noscript, template, svg, iframe, form";
const CHROME = "nav, header, footer, aside, [role=navigation], [role=banner], [role=contentinfo]";
const MAIN_CANDIDATES = ["main", "article", "[role=main]", "#main", "#content", ".content", ".markdown", ".prose"];

/**
 * Pulls the pieces of a page an llms.txt entry needs: a human title, a one line
 * description, outbound links and enough text to summarise or diff the page.
 */
export function extractPage(html: string, url: string): ExtractedPage {
  const $ = cheerio.load(html);
  $(BOILERPLATE).remove();

  const meta = (selector: string) => $(selector).attr("content")?.trim() || "";
  const jsonLd = readJsonLd($);

  const title = cleanTitle(
    meta('meta[property="og:title"]') ||
      meta('meta[name="twitter:title"]') ||
      $("title").first().text().trim() ||
      $("h1").first().text().trim() ||
      jsonLd.name ||
      titleFromPath(url),
    meta('meta[property="og:site_name"]') || jsonLd.siteName,
  );

  const navLinks = collectLinks($, url, CHROME);
  const main = pickMain($);
  const text = normalizeWhitespace(main.text());

  const description = firstSentences(
    meta('meta[name="description"]') ||
      meta('meta[property="og:description"]') ||
      meta('meta[name="twitter:description"]') ||
      jsonLd.description ||
      firstParagraph(main) ||
      text,
  );

  const robots = `${meta('meta[name="robots"]')} ${meta('meta[name="googlebot"]')}`.toLowerCase();

  return {
    title,
    description,
    text,
    wordCount: text ? text.split(/\s+/).length : 0,
    links: collectLinks($, url, "body"),
    navLinks,
    canonical: resolve($('link[rel="canonical"]').attr("href"), url),
    markdownUrl: resolve($('link[rel="alternate"][type="text/markdown"]').attr("href"), url),
    noindex: robots.includes("noindex"),
    siteName: meta('meta[property="og:site_name"]') || jsonLd.siteName || undefined,
    language: $("html").attr("lang")?.split("-")[0],
    contentHash: hashContent(title, description, text),
  };
}

/** Resolves an optional href against the page URL; an empty href is not a link. */
function resolve(href: string | undefined, base: string): string | undefined {
  if (!href || !href.trim()) return undefined;
  return normalizeUrl(href, base) ?? undefined;
}

function pickMain($: cheerio.CheerioAPI): cheerio.Cheerio<never> {
  for (const selector of MAIN_CANDIDATES) {
    const node = $(selector).first();
    if (node.length && normalizeWhitespace(node.text()).length > 200) {
      return node as unknown as cheerio.Cheerio<never>;
    }
  }
  const body = $("body").clone();
  body.find(CHROME).remove();
  return body as unknown as cheerio.Cheerio<never>;
}

function collectLinks($: cheerio.CheerioAPI, base: string, scope: string): string[] {
  const links = new Set<string>();
  $(scope)
    .find("a[href]")
    .each((_, element) => {
      const href = $(element).attr("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      const normalized = normalizeUrl(href, base);
      if (normalized) links.add(normalized);
    });
  return [...links];
}

function readJsonLd($: cheerio.CheerioAPI): {
  name?: string;
  description?: string;
  siteName?: string;
} {
  const result: { name?: string; description?: string; siteName?: string } = {};
  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).contents().text();
    if (!raw.trim()) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    for (const node of flattenJsonLd(parsed)) {
      const type = String(node["@type"] ?? "");
      if (type === "WebSite" || type === "Organization") {
        result.siteName ??= asText(node.name);
        result.description ??= asText(node.description);
      } else {
        result.name ??= asText(node.headline) ?? asText(node.name);
        result.description ??= asText(node.description);
      }
    }
  });
  return result;
}

function flattenJsonLd(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (value && typeof value === "object") {
    const node = value as Record<string, unknown>;
    const graph = node["@graph"];
    return graph ? flattenJsonLd(graph) : [node];
  }
  return [];
}

function asText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function firstParagraph(node: cheerio.Cheerio<never>): string {
  let found = "";
  node.find("p").each((_, element) => {
    if (found) return;
    const text = normalizeWhitespace(cheerio.load(element).text());
    if (text.length > 60) found = text;
  });
  return found;
}

/** Drops the trailing " | Site Name" suffix that most pages carry. */
function cleanTitle(title: string, siteName?: string): string {
  let cleaned = normalizeWhitespace(title);
  if (siteName) {
    cleaned = cleaned.replace(new RegExp(`\\s*[|\\-–—·]\\s*${escapeRegExp(siteName)}\\s*$`, "i"), "");
  }
  const parts = cleaned.split(/\s+[|·—–]\s+/);
  if (parts.length > 1 && parts[0].length >= 3) cleaned = parts[0];
  return cleaned.slice(0, 120).trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function firstSentences(text: string, maxLength = 180): string {
  const clean = normalizeWhitespace(text);
  if (clean.length <= maxLength) return clean;
  const truncated = clean.slice(0, maxLength);
  const boundary = Math.max(truncated.lastIndexOf(". "), truncated.lastIndexOf("? "));
  return `${(boundary > 60 ? truncated.slice(0, boundary) : truncated).trim()}…`;
}

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function hashContent(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 16);
}
