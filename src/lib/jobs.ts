import { randomUUID } from "node:crypto";
import { type CrawlState, crawlSlice, initCrawl } from "./crawl";
import { buildResult } from "./pipeline";
import { getStore } from "./store";
import type { Job, JobSummary } from "./store/types";
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

/** How often a running slice publishes its counters for the polling UI. */
const HEARTBEAT_MS = 2_000;

export async function advanceJob(id: string, budgetMs = 20_000): Promise<Job | null> {
  const store = getStore();
  const job = await store.getJob(id);
  if (!job || job.status !== "running") return job;

  let lastBeat = 0;
  const beat = (state: CrawlState) => {
    if (Date.now() - lastBeat < HEARTBEAT_MS) return;
    lastBeat = Date.now();
    void store
      .setJobHeartbeat(id, {
        fetched: state.pages.length,
        queued: state.frontier.length,
        at: new Date().toISOString(),
      })
      .catch(() => {});
  };

  try {
    const state = await crawlSlice(reviveState(job.state), budgetMs, beat);
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

export interface Progress {
  fetched: number;
  queued: number;
  target: number;
  percent: number;
}

export function jobProgress(job: Job): Progress {
  return progressOf({
    status: job.status,
    target: job.options.maxPages,
    fetched: job.state.pages.length,
    queued: job.state.frontier.length,
    updatedAt: job.updatedAt,
    heartbeat: null,
  });
}

/**
 * Progress from a counters-only summary. A slice publishes a heartbeat every
 * couple of seconds but only persists the job when it ends, so a heartbeat that
 * is newer than the job row is the live view of an in-flight slice.
 */
export function summaryProgress(summary: JobSummary): Progress {
  return progressOf(summary);
}

function progressOf(
  input: Pick<JobSummary, "status" | "target" | "fetched" | "queued" | "updatedAt" | "heartbeat">,
): Progress {
  const { status, target, heartbeat } = input;
  const live = status === "running" && heartbeat !== null && heartbeat.at > input.updatedAt;
  const fetched = live ? Math.max(input.fetched, heartbeat.fetched) : input.fetched;
  const queued = live ? heartbeat.queued : input.queued;
  const percent =
    status === "done"
      ? 100
      : Math.min(99, Math.round((fetched / Math.max(Math.min(target, fetched + queued), 1)) * 100));
  return { fetched, queued, target, percent };
}

/** JSON round-trips drop nothing today, but keeps state revival in one place. */
function reviveState(state: CrawlState): CrawlState {
  return state;
}
