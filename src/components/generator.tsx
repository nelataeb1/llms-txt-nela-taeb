"use client";

import { useCallback, useRef, useState } from "react";
import { ResultView } from "@/components/result-view";
import { DEFAULT_CRAWL_OPTIONS, type CrawlOptions, type GenerationResult } from "@/lib/types";

interface Progress {
  fetched: number;
  queued: number;
  target: number;
  percent: number;
}

interface JobResponse {
  jobId: string;
  status: "running" | "done" | "error";
  progress: Progress;
  log: string[];
  result: GenerationResult | null;
  error: string | null;
}

/** The status poll runs while a slice is in flight, so counters tick between slices. */
const POLL_MS = 2_000;

const EXAMPLES = ["https://tryprofound.com", "https://nextjs.org/docs", "https://docs.stripe.com"];

export function Generator() {
  const [url, setUrl] = useState("");
  const [options, setOptions] = useState<CrawlOptions>(DEFAULT_CRAWL_OPTIONS);
  const [showOptions, setShowOptions] = useState(false);
  const [job, setJob] = useState<JobResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [live, setLive] = useState<Progress | null>(null);
  const cancelled = useRef(false);

  const watch = useCallback((jobId: string) => {
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}`);
        if (!response.ok) return;
        const payload = (await response.json()) as { progress: Progress };
        setLive(payload.progress);
      } catch {
        // A dropped status poll is harmless; the next tick retries.
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  const poll = useCallback(async (jobId: string) => {
    let current: JobResponse | null = null;
    while (!cancelled.current) {
      const response = await fetch(`/api/jobs/${jobId}`, { method: "POST" });
      const payload = (await response.json()) as JobResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Crawl failed");
      current = payload;
      setJob(payload);
      if (payload.status !== "running") break;
    }
    if (current?.status === "error") throw new Error(current.error ?? "Crawl failed");
    return current;
  }, []);

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    if (!url.trim() || running) return;

    cancelled.current = false;
    setRunning(true);
    setError(null);
    setJob(null);
    setLive(null);

    let stopWatching: (() => void) | undefined;
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, options }),
      });
      const payload = (await response.json()) as JobResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not start the crawl");
      setJob(payload);
      if (payload.status === "running") {
        stopWatching = watch(payload.jobId);
        await poll(payload.jobId);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      stopWatching?.();
      setRunning(false);
    }
  }

  function stop() {
    cancelled.current = true;
    setRunning(false);
  }

  const result = job?.result ?? null;

  return (
    <div className="space-y-6">
      <form onSubmit={generate} className="card p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            className="input font-mono text-sm"
            placeholder="https://example.com"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            aria-label="Website URL"
          />
          <button type="submit" className="btn btn-primary whitespace-nowrap" disabled={running || !url.trim()}>
            {running ? "Crawling…" : "Generate"}
          </button>
          {running && (
            <button type="button" className="btn btn-ghost" onClick={stop}>
              Stop
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
          <span>Try:</span>
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              className="tag hover:text-[var(--foreground)]"
              onClick={() => setUrl(example)}
            >
              {example.replace("https://", "")}
            </button>
          ))}
          <button
            type="button"
            className="ml-auto underline"
            onClick={() => setShowOptions((value) => !value)}
          >
            {showOptions ? "Hide options" : "Options"}
          </button>
        </div>

        {showOptions && <OptionsPanel options={options} onChange={setOptions} />}
      </form>

      {error && (
        <div className="card border-red-500/40 bg-red-500/5 p-4 text-sm text-red-300">{error}</div>
      )}

      {job && !result && <ProgressCard job={job} live={live} />}

      {result && job && (
        <ResultView result={result} url={url} options={options} jobId={job.jobId} />
      )}
    </div>
  );
}

function ProgressCard({ job, live }: { job: JobResponse; live: Progress | null }) {
  // Whichever view saw more pages is the fresher one.
  const progress = live && live.fetched >= job.progress.fetched ? live : job.progress;
  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span>
          <strong>{progress.fetched.toLocaleString()}</strong> pages crawled out of{" "}
          {progress.target}
          {" · "}
          {progress.queued.toLocaleString()} discovered
        </span>
        <span className="text-[var(--muted)]">{progress.percent}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-all"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      {job.log.length > 0 && (
        <ul className="max-h-32 space-y-1 overflow-auto font-mono text-xs text-[var(--muted)]">
          {job.log.slice(-8).map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OptionsPanel({
  options,
  onChange,
}: {
  options: CrawlOptions;
  onChange: (options: CrawlOptions) => void;
}) {
  const set = <K extends keyof CrawlOptions>(key: K, value: CrawlOptions[K]) =>
    onChange({ ...options, [key]: value });

  return (
    <div className="grid gap-4 border-t border-[var(--border)] pt-4 sm:grid-cols-2">
      <label className="space-y-1 text-sm">
        <span className="text-[var(--muted)]">Max pages ({options.maxPages})</span>
        <input
          type="range"
          min={10}
          max={500}
          step={10}
          value={options.maxPages}
          onChange={(event) => set("maxPages", Number(event.target.value))}
          className="w-full accent-[var(--accent)]"
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-[var(--muted)]">Max crawl depth ({options.maxDepth})</span>
        <input
          type="range"
          min={1}
          max={6}
          value={options.maxDepth}
          onChange={(event) => set("maxDepth", Number(event.target.value))}
          className="w-full accent-[var(--accent)]"
        />
      </label>
      <Toggle
        label="Use an LLM to name sections and write descriptions"
        checked={options.useLlm}
        onChange={(value) => set("useLlm", value)}
      />
      <Toggle
        label="Only crawl below the URL's path"
        checked={options.scopeToPath}
        onChange={(value) => set("scopeToPath", value)}
      />
      <Toggle
        label="Also build llms-full.txt (page text inline)"
        checked={options.includeFullText}
        onChange={(value) => set("includeFullText", value)}
      />
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-[var(--accent)]"
      />
      <span className="text-[var(--muted)]">{label}</span>
    </label>
  );
}
