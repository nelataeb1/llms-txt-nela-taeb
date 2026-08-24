import { NextResponse } from "next/server";
import { advanceJob, jobProgress, summaryProgress } from "@/lib/jobs";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

/** Advances a running crawl by one slice; the client polls this until done. */
export async function POST(_request: Request, context: Context) {
  const { id } = await context.params;
  const job = await advanceJob(id, 20_000);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    progress: jobProgress(job),
    log: job.state.log,
    result: job.result,
    error: job.error,
  });
}

/**
 * Counters-only status poll. It never advances the crawl and never reads the
 * crawl state or result back, so the UI can call it every couple of seconds
 * while a slice is still running.
 */
export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const summary = await getStore().getJobSummary(id);
  if (!summary) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  return NextResponse.json({
    jobId: summary.id,
    status: summary.status,
    progress: summaryProgress(summary),
    error: summary.error,
  });
}
