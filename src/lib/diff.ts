import { hashContent } from "./extract";
import type { CrawledPage } from "./types";
import type { PageChange } from "./store/types";

/** Fingerprint of a whole crawl, used to tell "nothing changed" cheaply. */
export function snapshotHash(pages: CrawledPage[]): string {
  const parts = [...pages]
    .map((page) => `${page.url}:${page.contentHash}`)
    .sort();
  return hashContent(...parts);
}

/** Page level changes between two crawls of the same site. */
export function diffPages(previous: CrawledPage[], next: CrawledPage[]): PageChange[] {
  const before = new Map(previous.map((page) => [page.url, page]));
  const after = new Map(next.map((page) => [page.url, page]));
  const changes: PageChange[] = [];

  for (const [url, page] of after) {
    const old = before.get(url);
    if (!old) {
      changes.push({ type: "added", url, title: page.title });
      continue;
    }
    if (old.contentHash === page.contentHash) continue;
    const detail =
      old.title !== page.title
        ? `Title: "${old.title}" → "${page.title}"`
        : old.description !== page.description
          ? "Description updated"
          : "Content updated";
    changes.push({ type: "changed", url, title: page.title, detail });
  }

  for (const [url, page] of before) {
    if (!after.has(url)) changes.push({ type: "removed", url, title: page.title });
  }

  return changes.sort((a, b) => a.type.localeCompare(b.type) || a.url.localeCompare(b.url));
}

/** Unified-ish line diff so the UI can show what moved in the file itself. */
export function diffText(previous: string, next: string): { added: string[]; removed: string[] } {
  const before = new Set(previous.split("\n").map((line) => line.trim()).filter(Boolean));
  const after = new Set(next.split("\n").map((line) => line.trim()).filter(Boolean));
  return {
    added: [...after].filter((line) => !before.has(line)),
    removed: [...before].filter((line) => !after.has(line)),
  };
}
