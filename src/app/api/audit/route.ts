import { NextResponse } from "next/server";
import { z } from "zod";
import { auditSite } from "@/lib/audit";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({ jobId: z.string().min(1) });

/** Runs the AI-readiness audit for a finished crawl job. */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "jobId is required" }, { status: 400 });

  const job = await getStore().getJob(parsed.data.jobId);
  if (!job?.result) return NextResponse.json({ error: "No finished crawl for that job" }, { status: 404 });

  try {
    return NextResponse.json({ report: await auditSite(job.result) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Audit failed: ${message}` }, { status: 502 });
  }
}
