import { randomUUID } from "node:crypto";
import { crawlSlice, initCrawl } from "./crawl";
import { diffPages, snapshotHash } from "./diff";
import { buildResult } from "./pipeline";
import { getStore } from "./store";
import type { Site, Snapshot } from "./store/types";
import type { CrawlOptions, GenerationResult } from "./types";

/** Runs a crawl start to finish within a single request budget. */
export async function crawlToCompletion(
  url: string,
  options: CrawlOptions,
  budgetMs = 45_000,
): Promise<GenerationResult> {
  const deadline = Date.now() + budgetMs;
  let state = await initCrawl(url, options);
  while (!state.done && Date.now() < deadline) {
    state = await crawlSlice(state, Math.min(15_000, deadline - Date.now()));
  }
  return buildResult(state);
}

export async function trackSite(
  url: string,
  options: CrawlOptions,
  result: GenerationResult,
): Promise<{ site: Site; snapshot: Snapshot }> {
  const store = getStore();
  const now = new Date().toISOString();
  const site = await store.upsertSite({
    id: randomUUID(),
    url,
    name: result.site.name,
    options,
    monitoring: true,
    createdAt: now,
    lastCheckedAt: now,
  });

  const previous = await store.latestSnapshot(site.id);
  const snapshot = buildSnapshot(site.id, result, previous);
  await store.addSnapshot(snapshot);
  await store.markSiteChecked(site.id, now);
  return { site, snapshot };
}

/** Re-crawls a tracked site and records a snapshot when anything moved. */
export async function refreshSite(
  site: Site,
  budgetMs = 45_000,
): Promise<{ snapshot: Snapshot; result: GenerationResult }> {
  const store = getStore();
  const result = await crawlToCompletion(site.url, site.options, budgetMs);
  const previous = await store.latestSnapshot(site.id);
  const snapshot = buildSnapshot(site.id, result, previous);

  if (snapshot.changed || !previous) await store.addSnapshot(snapshot);
  await store.markSiteChecked(site.id, new Date().toISOString());
  return { snapshot, result };
}

function buildSnapshot(
  siteId: string,
  result: GenerationResult,
  previous: Snapshot | null,
): Snapshot {
  const contentHash = snapshotHash(result.pages);
  const changes = previous ? diffPages(previous.pages, result.pages) : [];
  return {
    id: randomUUID(),
    siteId,
    createdAt: new Date().toISOString(),
    llmsTxt: result.llmsTxt,
    contentHash,
    // Page text is only needed for llms-full.txt; snapshots stay small without it.
    pages: result.pages.map((page) => ({ ...page, text: undefined })),
    changes,
    changed: previous ? previous.contentHash !== contentHash : true,
  };
}
