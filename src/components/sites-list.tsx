"use client";

import Link from "next/link";
import useFetch from "@/lib/use-fetch";

interface SiteRow {
  id: string;
  url: string;
  name: string;
  monitoring: boolean;
  lastCheckedAt: string | null;
  latestSnapshotAt: string | null;
  changeCount: number;
  pageCount: number;
}

export function SitesList() {
  const { data, error, loading, reload } = useFetch<{ sites: SiteRow[]; persistent: boolean }>(
    "/api/sites",
  );

  if (loading) return <p className="text-[var(--muted)]">Loading…</p>;
  if (error) return <p className="text-red-400">{error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      {!data.persistent && (
        <p className="card p-4 text-sm text-amber-300/90">
          DATABASE_URL is not set, so monitored sites live in memory and disappear when the server
          restarts. Set it to a Postgres/Neon connection string to persist history.
        </p>
      )}

      {data.sites.length === 0 ? (
        <p className="card p-6 text-[var(--muted)]">
          Nothing tracked yet. Generate a file and choose “Monitor this site”.
        </p>
      ) : (
        <ul className="space-y-3">
          {data.sites.map((site) => (
            <li key={site.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <Link href={`/sites/${site.id}`} className="font-medium hover:underline">
                  {site.name}
                </Link>
                <p className="truncate font-mono text-xs text-[var(--muted)]">{site.url}</p>
              </div>
              <div className="flex items-center gap-4 text-xs text-[var(--muted)]">
                <span>{site.pageCount} pages</span>
                <span>{site.changeCount} changes last run</span>
                <span>{site.lastCheckedAt ? new Date(site.lastCheckedAt).toLocaleString() : "never checked"}</span>
                <a className="btn btn-ghost !px-3 !py-1.5" href={`/s/${site.id}/llms.txt`} target="_blank" rel="noreferrer">
                  Raw file
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}

      <button className="btn btn-ghost text-sm" onClick={reload}>
        Refresh list
      </button>
    </div>
  );
}
