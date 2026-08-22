import { NextResponse } from "next/server";
import { advanceJob, jobProgress, startJob } from "@/lib/jobs";
import { generateRequestSchema, resolveOptions } from "@/lib/schema";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Starts a crawl job and runs the first slice so the client gets fast feedback. */
export async function POST(request: Request) {
  const parsed = generateRequestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const options = resolveOptions(parsed.data.options);
  try {
    const started = await startJob(parsed.data.url, options);
    const job = (await advanceJob(started.id, 12_000)) ?? started;
    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      progress: jobProgress(job),
      log: job.state.log,
      result: job.result,
      error: job.error,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Could not start crawl: ${message}` }, { status: 502 });
  }
}
