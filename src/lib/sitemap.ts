import { gunzipSync } from "node:zlib";
import { fetchText, mapWithConcurrency } from "./http";
import { isLikelyPage, isSameSite, normalizeUrl } from "./url";

export interface SitemapEntry {
  url: string;
  lastModified?: string;
  priority?: number;
}

const CANDIDATE_PATHS = [
  "/sitemap.xml",
  "/sitemap_index.xml",
  "/sitemap-index.xml",
  "/sitemap/sitemap.xml",
  "/wp-sitemap.xml",
  "/sitemap.txt",
];

const MAX_SITEMAPS = 25;

/**
 * Collects page URLs from a site's sitemaps, following sitemap indexes.
 * `hints` are sitemap URLs advertised by robots.txt.
 */
export async function collectSitemapUrls(
  origin: string,
  hints: string[],
  limit: number,
): Promise<SitemapEntry[]> {
  const queue = [...new Set([...hints, ...CANDIDATE_PATHS.map((path) => new URL(path, origin).toString())])];
  const seenSitemaps = new Set<string>();
  const entries = new Map<string, SitemapEntry>();

  while (queue.length > 0 && seenSitemaps.size < MAX_SITEMAPS && entries.size < limit) {
    const batch = queue.splice(0, 5).filter((url) => !seenSitemaps.has(url));
    batch.forEach((url) => seenSitemaps.add(url));

    const documents = await mapWithConcurrency(batch, 5, async (url) => {
      try {
        return { url, body: await readSitemap(url) };
      } catch {
        return { url, body: "" };
      }
    });

    for (const { url, body } of documents) {
      if (!body) continue;
      const { pages, children } = parseSitemap(body, url);
      for (const entry of pages) {
        if (!isSameSite(entry.url, origin) || !isLikelyPage(entry.url)) continue;
        if (!entries.has(entry.url)) entries.set(entry.url, entry);
      }
      for (const child of children) {
        if (isSameSite(child, origin)) queue.push(child);
      }
    }
  }

  return [...entries.values()].slice(0, limit);
}

async function readSitemap(url: string): Promise<string> {
  if (url.endsWith(".gz")) {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) return "";
    const buffer = Buffer.from(await response.arrayBuffer());
    return gunzipSync(buffer).toString("utf8");
  }
  const response = await fetchText(url, { accept: "application/xml,text/xml,text/plain" });
  if (response.status >= 400) return "";
  return response.body;
}

export function parseSitemap(
  body: string,
  baseUrl: string,
): { pages: SitemapEntry[]; children: string[] } {
  const trimmed = body.trim();
  if (!trimmed.startsWith("<")) {
    // sitemap.txt: one URL per line.
    const pages = trimmed
      .split(/\r?\n/)
      .map((line) => normalizeUrl(line.trim(), baseUrl))
      .filter((url): url is string => Boolean(url))
      .map((url) => ({ url }));
    return { pages, children: [] };
  }

  const isIndex = /<sitemapindex[\s>]/i.test(trimmed);
  const blocks = trimmed.match(/<(?:url|sitemap)\b[\s\S]*?<\/(?:url|sitemap)>/gi) ?? [];
  const pages: SitemapEntry[] = [];
  const children: string[] = [];

  for (const block of blocks) {
    const location = decodeXml(block.match(/<loc>([\s\S]*?)<\/loc>/i)?.[1]?.trim() ?? "");
    if (!location) continue;
    const normalized = normalizeUrl(location, baseUrl);
    if (!normalized) continue;

    if (isIndex) {
      children.push(normalized);
      continue;
    }
    const lastModified = block.match(/<lastmod>([\s\S]*?)<\/lastmod>/i)?.[1]?.trim();
    const priorityText = block.match(/<priority>([\s\S]*?)<\/priority>/i)?.[1]?.trim();
    pages.push({
      url: normalized,
      lastModified,
      priority: priorityText ? Number(priorityText) : undefined,
    });
  }

  return { pages, children };
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}
