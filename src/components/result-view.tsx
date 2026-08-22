"use client";

import { useMemo, useState } from "react";
import { EvalPanel, ReadinessPanel } from "@/components/insights";
import type { AuditReport } from "@/lib/audit";
import type { EvalReport } from "@/lib/eval";
import { validateLlmsTxt } from "@/lib/validate";
import type { CrawlOptions, GenerationResult } from "@/lib/types";

type Tab = "file" | "full" | "pages" | "checks" | "readiness" | "eval";

export function ResultView({
  result,
  url,
  options,
  jobId,
}: {
  result: GenerationResult;
  url: string;
  options: CrawlOptions;
  jobId: string;
}) {
  const [tab, setTab] = useState<Tab>("file");
  const [source, setSource] = useState(result.llmsTxt);
  const [monitorState, setMonitorState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [monitorMessage, setMonitorMessage] = useState("");
  const [audit, setAudit] = useState<AuditReport | null>(null);
  const [retrieval, setRetrieval] = useState<EvalReport | null>(null);

  const validation = useMemo(() => validateLlmsTxt(source), [source]);
  const errors = validation.issues.filter((issue) => issue.level === "error");
  const warnings = validation.issues.filter((issue) => issue.level === "warning");

  const tabs: { id: Tab; label: string }[] = [
    { id: "file", label: "llms.txt" },
    ...(result.llmsFullTxt ? [{ id: "full" as Tab, label: "llms-full.txt" }] : []),
    { id: "pages", label: `Pages (${result.pages.length})` },
    { id: "checks", label: `Spec checks (${errors.length + warnings.length})` },
    { id: "readiness", label: "AI readiness" },
    { id: "eval", label: "Retrieval eval" },
  ];

  async function monitor() {
    setMonitorState("saving");
    try {
      const response = await fetch("/api/sites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, options }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not start monitoring");
      setMonitorState("saved");
      setMonitorMessage(`Tracking. Hosted at /s/${payload.site.id}/llms.txt`);
    } catch (error) {
      setMonitorState("error");
      setMonitorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Pages indexed" value={String(result.stats.fetched)} />
        <Stat label="Discovery" value={result.stats.discoveredVia} />
        <Stat label="Sections" value={String(result.document.sections.length)} />
        <Stat label="Descriptions" value={result.enrichedByLlm ? "LLM written" : "From page metadata"} />
      </div>

      {result.warnings.length > 0 && (
        <ul className="card space-y-1 p-4 text-sm text-amber-300/90">
          {result.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-1 border-b border-[var(--border)] p-2">
          {tabs.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                tab === item.id ? "bg-[var(--surface-2)] text-[var(--foreground)]" : "text-[var(--muted)]"
              }`}
            >
              {item.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 p-1">
            <span className={`tag ${errors.length === 0 ? "text-emerald-400" : "text-red-400"}`}>
              {errors.length === 0 ? "Spec compliant" : `${errors.length} errors`}
            </span>
            <CopyButton text={tab === "full" ? (result.llmsFullTxt ?? source) : source} />
            <DownloadButton
              text={tab === "full" ? (result.llmsFullTxt ?? source) : source}
              filename={tab === "full" ? "llms-full.txt" : "llms.txt"}
            />
          </div>
        </div>

        {tab === "file" && (
          <textarea
            value={source}
            onChange={(event) => setSource(event.target.value)}
            spellCheck={false}
            className="h-[28rem] w-full resize-y bg-transparent p-4 font-mono text-[13px] leading-relaxed outline-none"
          />
        )}

        {tab === "full" && (
          <pre className="h-[28rem] overflow-auto p-4 font-mono text-[13px] whitespace-pre-wrap">
            {result.llmsFullTxt}
          </pre>
        )}

        {tab === "pages" && <PagesTable result={result} />}

        {tab === "readiness" && <ReadinessPanel jobId={jobId} report={audit} onReport={setAudit} />}

        {tab === "eval" && <EvalPanel jobId={jobId} report={retrieval} onReport={setRetrieval} />}

        {tab === "checks" && (
          <div className="max-h-[28rem] space-y-2 overflow-auto p-4 text-sm">
            {validation.issues.length === 0 && (
              <p className="text-emerald-400">No issues. The file matches the llmstxt.org structure.</p>
            )}
            {validation.issues.map((issue, index) => (
              <div key={index} className="flex gap-2">
                <span className={issue.level === "error" ? "text-red-400" : "text-amber-400"}>
                  {issue.level}
                </span>
                <span className="text-[var(--muted)]">{issue.line ? `line ${issue.line}` : ""}</span>
                <span>{issue.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="text-sm">
          <p className="font-medium">Keep this file up to date</p>
          <p className="text-[var(--muted)]">
            Re-crawls on a schedule, diffs the pages and regenerates when the site changes.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {monitorMessage && (
            <span className={`text-xs ${monitorState === "error" ? "text-red-400" : "text-[var(--muted)]"}`}>
              {monitorMessage}
            </span>
          )}
          <button className="btn btn-ghost" onClick={monitor} disabled={monitorState === "saving"}>
            {monitorState === "saving" ? "Setting up…" : monitorState === "saved" ? "Monitoring" : "Monitor this site"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PagesTable({ result }: { result: GenerationResult }) {
  return (
    <div className="max-h-[28rem] overflow-auto">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-[var(--surface)] text-xs uppercase text-[var(--muted)]">
          <tr>
            <th className="p-3">Title</th>
            <th className="p-3">Path</th>
            <th className="p-3">Kind</th>
            <th className="p-3">Words</th>
          </tr>
        </thead>
        <tbody>
          {result.pages.map((page) => (
            <tr key={page.url} className="border-t border-[var(--border)]">
              <td className="max-w-xs truncate p-3" title={page.title}>
                <a href={page.url} target="_blank" rel="noreferrer" className="hover:underline">
                  {page.title}
                </a>
              </td>
              <td className="max-w-xs truncate p-3 font-mono text-xs text-[var(--muted)]">{page.path}</td>
              <td className="p-3 text-[var(--muted)]">{page.kind}</td>
              <td className="p-3 text-[var(--muted)]">{page.wordCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="mt-1 truncate text-lg font-medium">{value}</p>
    </div>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn btn-ghost !px-3 !py-1.5 text-xs"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function DownloadButton({ text, filename }: { text: string; filename: string }) {
  return (
    <button
      className="btn btn-ghost !px-3 !py-1.5 text-xs"
      onClick={() => {
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const href = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = href;
        anchor.download = filename;
        anchor.click();
        URL.revokeObjectURL(href);
      }}
    >
      Download
    </button>
  );
}
