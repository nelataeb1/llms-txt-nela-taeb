import { classifyPage } from "./classify";
import { extractPage } from "./extract";
import { FetchError, describeError, fetchText, mapWithConcurrency } from "./http";
import { type Robots, loadRobots } from "./robots";
import { collectSitemapUrls } from "./sitemap";
import type { CrawlOptions, CrawlStats, CrawledPage } from "./types";
import { basePathOf, isLikelyPage, isSameSite, normalizeUrl } from "./url";

const CONCURRENCY = 6;

/**
 * Serializable crawl state. The crawl runs in bounded slices so it survives
 * serverless request timeouts: each slice fetches a batch of URLs and returns
 * the updated state, which the caller persists and feeds back in.
 */
export interface CrawlState {
  entryUrl: string;
  origin: string;
  basePath: string;
  options: CrawlOptions;
  frontier: { url: string; depth: number }[];
  visited: string[];
  pages: CrawledPage[];
  inbound: Record<string, number>;
  navUrls: string[];
  siteName?: string;
  sitemapCount: number;
  usedSitemap: boolean;
  usedLinks: boolean;
  failed: number;
  skipped: number;
  robots?: { sitemaps: string[]; crawlDelayMs: number; body: string };
  done: boolean;
  log: string[];
}

export async function initCrawl(rawEntryUrl: string, options: CrawlOptions): Promise<CrawlState> {
  const entryUrl = normalizeUrl(rawEntryUrl) ?? rawEntryUrl;
  const origin = new URL(entryUrl).origin;
  const basePath = basePathOf(entryUrl);
  const robots = options.respectRobots ? await loadRobots(origin) : undefined;

  const sitemapEntries = await collectSitemapUrls(
    origin,
    robots?.sitemaps ?? [],
    options.maxPages * 4,
  );

  const state: CrawlState = {
    entryUrl,
    origin,
    basePath,
    options,
    frontier: [{ url: entryUrl, depth: 0 }],
    visited: [],
    pages: [],
    inbound: {},
    navUrls: [],
    sitemapCount: sitemapEntries.length,
    usedSitemap: sitemapEntries.length > 0,
    usedLinks: false,
    failed: 0,
    skipped: 0,
    robots: robots ? { sitemaps: robots.sitemaps, crawlDelayMs: robots.crawlDelayMs, body: "" } : undefined,
    done: false,
    log: [],
  };

  const scoped = sitemapEntries.filter((entry) => inScope(entry.url, state));
  for (const entry of scoped) {
    state.frontier.push({ url: entry.url, depth: 1 });
  }

  state.log.push(
    scoped.length > 0
      ? `Found ${scoped.length} URLs in sitemaps`
      : "No usable sitemap, falling back to link crawling",
  );
  return state;
}

/** Crawls until the page budget is hit or `budgetMs` elapses. */
export async function crawlSlice(state: CrawlState, budgetMs = 20_000): Promise<CrawlState> {
  const deadline = Date.now() + budgetMs;
  const robots = state.options.respectRobots ? await loadRobots(state.origin) : undefined;
  const visited = new Set(state.visited);

  while (
    state.frontier.length > 0 &&
    state.pages.length < state.options.maxPages &&
    Date.now() < deadline
  ) {
    const batch: { url: string; depth: number }[] = [];
    while (
      batch.length < CONCURRENCY &&
      state.frontier.length > 0 &&
      visited.size + batch.length < state.options.maxPages * 3
    ) {
      const next = state.frontier.shift();
      if (!next) break;
      if (visited.has(next.url)) continue;
      if (!allowed(next.url, state, robots)) {
        state.skipped++;
        continue;
      }
      visited.add(next.url);
      batch.push(next);
    }
    if (batch.length === 0) break;

    const results = await mapWithConcurrency(batch, CONCURRENCY, (item) => visit(item, state));

    for (const result of results) {
      if (!result) {
        state.failed++;
        continue;
      }
      if (result.skipped) {
        state.skipped++;
        continue;
      }
      const { page, links, navLinks } = result;
      visited.add(page.url);
      if (state.pages.length < state.options.maxPages && !state.pages.some((seen) => seen.url === page.url)) {
        state.pages.push(page);
      }
      if (!state.siteName && result.siteName) state.siteName = result.siteName;
      for (const url of navLinks) {
        if (!state.navUrls.includes(url)) state.navUrls.push(url);
      }
      for (const url of links) {
        state.inbound[url] = (state.inbound[url] ?? 0) + 1;
        if (visited.has(url) || page.depth + 1 > state.options.maxDepth) continue;
        if (!inScope(url, state)) continue;
        state.usedLinks = true;
        state.frontier.push({ url, depth: page.depth + 1 });
      }
    }

    if (robots?.crawlDelayMs) await sleep(robots.crawlDelayMs);
  }

  state.visited = [...visited];
  state.done = state.frontier.length === 0 || state.pages.length >= state.options.maxPages;
  if (state.done) {
    for (const page of state.pages) {
      page.inboundLinks = state.inbound[page.url] ?? 0;
      page.inNav = state.navUrls.includes(page.url);
    }
  }
  return state;
}

type VisitResult =
  | { skipped: true }
  | {
      skipped: false;
      page: CrawledPage;
      links: string[];
      navLinks: string[];
      siteName?: string;
    };

const SKIPPED: VisitResult = { skipped: true };

async function visit(
  item: { url: string; depth: number },
  state: CrawlState,
): Promise<VisitResult | null> {
  try {
    const response = await fetchText(item.url);
    if (response.status >= 400 || !response.contentType.includes("html")) return null;

    const finalUrl = normalizeUrl(response.url) ?? item.url;
    // A redirect can land on another host or on a page we already have.
    if (!isSameSite(finalUrl, state.origin) || !inScope(finalUrl, state)) return SKIPPED;
    if (finalUrl !== item.url && state.pages.some((page) => page.url === finalUrl)) return SKIPPED;

    const extracted = extractPage(response.body, finalUrl);
    if (extracted.noindex) return SKIPPED;

    const markdownUrl =
      extracted.markdownUrl ?? markdownFromLinkHeader(response.headers.get("link"), finalUrl);

    const page: CrawledPage = {
      url: finalUrl,
      path: new URL(finalUrl).pathname,
      title: extracted.title,
      description: extracted.description,
      kind: classifyPage(finalUrl),
      depth: item.depth,
      fromSitemap: item.depth === 1 && state.usedSitemap,
      inboundLinks: 0,
      inNav: false,
      wordCount: extracted.wordCount,
      markdownUrl,
      contentHash: extracted.contentHash,
      text: state.options.includeFullText ? extracted.text.slice(0, 20_000) : undefined,
    };

    const internal = extracted.links.filter(
      (url) => isSameSite(url, state.origin) && isLikelyPage(url),
    );
    return {
      skipped: false,
      page,
      links: internal,
      navLinks: extracted.navLinks.filter((url) => isSameSite(url, state.origin)),
      siteName: extracted.siteName,
    };
  } catch (error) {
    state.log.push(
      `Failed ${item.url}: ${error instanceof FetchError ? error.message : describeError(error)}`,
    );
    return null;
  }
}

function markdownFromLinkHeader(header: string | null, base: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(",")) {
    if (!/rel="?alternate"?/i.test(part) || !/type="?text\/markdown"?/i.test(part)) continue;
    const target = part.match(/<([^>]+)>/)?.[1];
    const normalized = target ? normalizeUrl(target, base) : null;
    if (normalized) return normalized;
  }
  return undefined;
}

function allowed(url: string, state: CrawlState, robots?: Robots): boolean {
  if (!isSameSite(url, state.origin) || !isLikelyPage(url)) return false;
  if (robots && !robots.isAllowed(url)) return false;
  return inScope(url, state);
}

function inScope(url: string, state: CrawlState): boolean {
  if (!isSameSite(url, state.origin)) return false;
  if (!state.options.scopeToPath || state.basePath === "/") return true;
  return new URL(url).pathname.startsWith(state.basePath.replace(/\/$/, ""));
}

export function crawlStats(state: CrawlState): CrawlStats {
  return {
    fetched: state.pages.length,
    failed: state.failed,
    skipped: state.skipped,
    sitemapUrls: state.sitemapCount,
    discoveredVia:
      state.usedSitemap && state.usedLinks ? "sitemap+links" : state.usedSitemap ? "sitemap" : "links",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
