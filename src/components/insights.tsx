"use client";

import { type Dispatch, type SetStateAction, useState } from "react";
import type { AuditReport, CheckStatus } from "@/lib/audit";
import type { EvalReport } from "@/lib/eval";

const STATUS_COLOR: Record<CheckStatus, string> = {
  pass: "text-emerald-400",
  warn: "text-amber-400",
  fail: "text-red-400",
};

/**
 * Runs a report endpoint. The report itself lives in the parent so switching
 * tabs (which unmounts the panel) does not discard it or re-spend LLM calls.
 */
function useReport<T>(
  endpoint: string,
  jobId: string,
  report: T | null,
  setReport: Dispatch<SetStateAction<T | null>>,
) {
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Request failed");
      setReport(payload.report as T);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRunning(false);
    }
  }

  return { report, error, running, run };
}

export function ReadinessPanel({
  jobId,
  report: value,
  onReport,
}: {
  jobId: string;
  report: AuditReport | null;
  onReport: Dispatch<SetStateAction<AuditReport | null>>;
}) {
  const { report, error, running, run } = useReport<AuditReport>("/api/audit", jobId, value, onReport);

  return (
    <Panel
      title="AI readiness audit"
      blurb="Checks whether GPTBot, PerplexityBot and friends can actually reach and read this site, and what is holding it back."
      cta={report ? "Re-run audit" : "Run audit"}
      running={running}
      runningLabel="Probing crawlers…"
      error={error}
      onRun={run}
    >
      {report && (
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-2)] text-2xl font-medium">
              {report.grade}
            </div>
            <div>
              <p className="text-2xl font-medium">{report.score}/100</p>
              <p className="text-sm text-[var(--muted)]">Agent readiness score</p>
            </div>
          </div>

          <div>
            <p className="eyebrow mb-2">Crawler access</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {report.bots.map((bot) => {
                const blocked = !bot.robotsAllowed || (bot.status ?? 200) >= 400;
                return (
                  <div
                    key={bot.name}
                    className="flex items-center justify-between rounded-lg bg-[var(--surface-2)] px-3 py-2 text-sm"
                  >
                    <span>{bot.name}</span>
                    <span className={blocked ? "text-red-400" : bot.contentShrunk ? "text-amber-400" : "text-emerald-400"}>
                      {!bot.robotsAllowed
                        ? "robots.txt blocks"
                        : bot.status === null
                          ? "policy only"
                          : bot.status >= 400
                            ? `HTTP ${bot.status}`
                            : bot.contentShrunk
                              ? "thin response"
                              : `HTTP ${bot.status}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            {report.checks.map((check) => (
              <div key={check.id} className="border-t border-[var(--border)] pt-3">
                <div className="flex items-baseline gap-2">
                  <span className={`text-xs uppercase ${STATUS_COLOR[check.status]}`}>{check.status}</span>
                  <span className="text-sm font-medium">{check.label}</span>
                </div>
                <p className="mt-1 text-sm text-[var(--muted)]">{check.detail}</p>
                {check.fix && <p className="mt-1 text-sm text-[var(--foreground)]/80">Fix: {check.fix}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

export function EvalPanel({
  jobId,
  report: value,
  onReport,
}: {
  jobId: string;
  report: EvalReport | null;
  onReport: Dispatch<SetStateAction<EvalReport | null>>;
}) {
  const { report, error, running, run } = useReport<EvalReport>("/api/eval", jobId, value, onReport);

  return (
    <Panel
      title="Retrieval eval"
      blurb="Writes questions from the crawled pages, then asks a model to pick the right page using only this index. Low accuracy means the descriptions do not disambiguate."
      cta={report ? "Re-run eval" : "Run eval"}
      running={running}
      runningLabel="Scoring retrieval…"
      error={error}
      onRun={run}
    >
      {report && (
        <div className="space-y-5">
          <div>
            <p className="text-2xl font-medium">{report.accuracy}%</p>
            <p className="text-sm text-[var(--muted)]">
              {report.questions.filter((entry) => entry.correct).length}/{report.questions.length} questions
              routed to the right page
            </p>
          </div>

          <div className="space-y-3">
            {report.questions.map((entry, index) => (
              <div key={index} className="border-t border-[var(--border)] pt-3 text-sm">
                <div className="flex items-baseline gap-2">
                  <span className={entry.correct ? "text-emerald-400" : "text-red-400"}>
                    {entry.correct ? "hit" : "miss"}
                  </span>
                  <span>{entry.question}</span>
                </div>
                {!entry.correct && (
                  <p className="mt-1 font-mono text-xs text-[var(--muted)]">
                    picked {entry.chosenUrl ?? "nothing"} · expected {entry.expectedUrl}
                  </p>
                )}
              </div>
            ))}
          </div>

          {report.ambiguous.length > 0 && (
            <div className="rounded-lg bg-[var(--surface-2)] p-3 text-sm text-[var(--muted)]">
              Rewrite the notes for {report.ambiguous.length} link
              {report.ambiguous.length === 1 ? "" : "s"} that absorbed another page&apos;s question:{" "}
              {report.ambiguous.map((item) => item.title).join(", ")}.
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function Panel({
  title,
  blurb,
  cta,
  running,
  runningLabel,
  error,
  onRun,
  children,
}: {
  title: string;
  blurb: string;
  cta: string;
  running: boolean;
  runningLabel: string;
  error: string | null;
  onRun: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="max-h-[28rem] space-y-4 overflow-auto p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <p className="font-medium">{title}</p>
          <p className="text-sm text-[var(--muted)]">{blurb}</p>
        </div>
        <button className="btn btn-ghost" onClick={onRun} disabled={running}>
          {running ? runningLabel : cta}
        </button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {children}
    </div>
  );
}
