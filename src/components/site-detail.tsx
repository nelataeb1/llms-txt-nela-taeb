"use client";

import { useState } from "react";
import { CopyButton } from "@/components/result-view";
import useFetch from "@/lib/use-fetch";
import type { PageChange } from "@/lib/store/types";

interface SnapshotRow {
  id: string;
  createdAt: string;
  llmsTxt: string;
  changes: PageChange[];
  changed: boolean;
  pageCount: number;
}

interface SiteResponse {
  site: { id: string; url: string; name: string; monitoring: boolean; lastCheckedAt: string | null };
  snapshots: SnapshotRow[];
  latest: (SnapshotRow & { pages: unknown[] }) | null;
}

export function SiteDetail({ siteId }: { siteId: string }) {
  const { data, error, loading, reload } = useFetch<SiteResponse>(`/api/sites/${siteId}`);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refreshNow() {
    setRefreshing(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/sites/${siteId}/refresh`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Refresh failed");
      setMessage(
        payload.changed
          ? `${payload.changes.length} page changes detected — new snapshot saved.`
          : "No changes since the last snapshot.",
      );
      await reload();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) return <p className="text-[var(--muted)]">Loading…</p>;
  if (error) return <p className="text-red-400">{error}</p>;
  if (!data) return null;

  const latest = data.snapshots[0] ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{data.site.name}</h1>
          <a href={data.site.url} target="_blank" rel="noreferrer" className="font-mono text-xs text-[var(--muted)] hover:underline">
            {data.site.url}
          </a>
        </div>
        <div className="flex items-center gap-2">
          <a className="btn btn-ghost text-sm" href={`/s/${siteId}/llms.txt`} target="_blank" rel="noreferrer">
            Raw file
          </a>
          <button className="btn btn-primary text-sm" onClick={refreshNow} disabled={refreshing}>
            {refreshing ? "Checking…" : "Check for changes now"}
          </button>
        </div>
      </div>

      {message && <p className="card p-3 text-sm text-[var(--muted)]">{message}</p>}

      {latest && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--border)] p-3 text-sm">
            <span>Current llms.txt · {new Date(latest.createdAt).toLocaleString()}</span>
            <CopyButton text={latest.llmsTxt} />
          </div>
          <pre className="max-h-96 overflow-auto p-4 font-mono text-[13px] whitespace-pre-wrap">
            {latest.llmsTxt}
          </pre>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-medium">History</h2>
        {data.snapshots.map((snapshot, index) => (
          <div key={snapshot.id} className="card p-4">
            <div className="flex items-center justify-between text-sm">
              <span>{new Date(snapshot.createdAt).toLocaleString()}</span>
              <span className="text-[var(--muted)]">{snapshot.pageCount} pages</span>
            </div>
            {snapshot.changes.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--muted)]">
                {index === data.snapshots.length - 1 ? "Baseline snapshot." : "Content changed."}
              </p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {snapshot.changes.slice(0, 12).map((change) => (
                  <li key={`${change.type}-${change.url}`} className="flex gap-2">
                    <span
                      className={
                        change.type === "added"
                          ? "text-emerald-400"
                          : change.type === "removed"
                            ? "text-red-400"
                            : "text-amber-400"
                      }
                    >
                      {change.type}
                    </span>
                    <span className="truncate font-mono text-xs text-[var(--muted)]">{change.url}</span>
                    {change.detail && <span className="text-xs text-[var(--muted)]">{change.detail}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
