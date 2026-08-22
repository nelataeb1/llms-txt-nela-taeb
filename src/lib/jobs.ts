import { randomUUID } from "node:crypto";
import { type CrawlState, crawlSlice, initCrawl } from "./crawl";
import { buildResult } from "./pipeline";
import { getStore } from "./store";
import type { Job } from "./store/types";
import type { CrawlOptions } from "./types";

/**
 * Crawls are executed as resumable jobs: each HTTP request advances the crawl
 * by a time-boxed slice and persists the state, so a long crawl is never cut
 * short by a serverless function timeout.
 */
export async function startJob(url: string, options: CrawlOptions): Promise<Job> {
  const state = await initCrawl(url, options);
  const now = new Date().toISOString();
  const job: Job = {
    id: randomUUID(),
    url,
    status: "running",
    options,
    state,
    result: null,
    error: null,
    createdAt: now,
    updatedAt: now,
  };
  await getStore().createJob(job);
  return job;
}

export async function advanceJob(id: string, budgetMs = 20_000): Promise<Job | null> {
  const store = getStore();
  const job = await store.getJob(id);
  if (!job || job.status !== "running") return job;

  try {
    const state = await crawlSlice(reviveState(job.state), budgetMs);
    job.state = state;
    if (state.done) {
      job.result = await buildResult(state);
      job.status = "done";
    }
  } catch (error) {
    job.status = "error";
    job.error = error instanceof Error ? error.message : String(error);
  }

  job.updatedAt = new Date().toISOString();
  await store.updateJob(job);
  return job;
}

export function jobProgress(job: Job): {
  fetched: number;
  queued: number;
  target: number;
  percent: number;
} {
  const target = job.options.maxPages;
  const fetched = job.state.pages.length;
  const queued = job.state.frontier.length;
  const percent =
    job.status === "done"
      ? 100
      : Math.min(99, Math.round((fetched / Math.max(Math.min(target, fetched + queued), 1)) * 100));
  return { fetched, queued, target, percent };
}

/** JSON round-trips drop nothing today, but keeps state revival in one place. */
function reviveState(state: CrawlState): CrawlState {
  return state;
}
