import { describe, expect, it } from "vitest";
import { summaryProgress } from "../src/lib/jobs";
import type { JobSummary } from "../src/lib/store/types";

const base: JobSummary = {
  id: "job",
  status: "running",
  target: 500,
  fetched: 60,
  queued: 900,
  updatedAt: "2026-01-01T00:00:00.000Z",
  error: null,
  heartbeat: null,
};

describe("summaryProgress", () => {
  it("uses persisted counters when there is no heartbeat", () => {
    expect(summaryProgress(base)).toMatchObject({
      fetched: 60,
      queued: 900,
      target: 500,
    });
  });

  it("prefers a heartbeat published after the job row was written", () => {
    const progress = summaryProgress({
      ...base,
      heartbeat: { fetched: 118, queued: 2546, at: "2026-01-01T00:00:10.000Z" },
    });
    expect(progress).toMatchObject({ fetched: 118, queued: 2546 });
  });

  it("ignores a heartbeat left over from an earlier slice", () => {
    const progress = summaryProgress({
      ...base,
      heartbeat: { fetched: 12, queued: 40, at: "2025-12-31T23:59:00.000Z" },
    });
    expect(progress).toMatchObject({ fetched: 60, queued: 900 });
  });

  it("reports 100% only when the job is done", () => {
    expect(summaryProgress({ ...base, status: "done", queued: 0 }).percent).toBe(100);
    expect(summaryProgress({ ...base, fetched: 500, queued: 0 }).percent).toBe(99);
  });
});
