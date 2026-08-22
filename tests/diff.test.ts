import { describe, expect, it } from "vitest";
import { diffPages, snapshotHash } from "@/lib/diff";
import type { CrawledPage } from "@/lib/types";

const base: CrawledPage = {
  url: "https://acme.com/a",
  path: "/a",
  title: "A",
  description: "first",
  kind: "docs",
  depth: 1,
  fromSitemap: true,
  inboundLinks: 0,
  inNav: false,
  wordCount: 10,
  contentHash: "hash-a",
};

describe("diffPages", () => {
  it("detects additions, removals and content changes", () => {
    const previous = [base, { ...base, url: "https://acme.com/gone", path: "/gone", title: "Gone" }];
    const next = [
      { ...base, title: "A renamed", contentHash: "hash-b" },
      { ...base, url: "https://acme.com/new", path: "/new", title: "New" },
    ];

    expect(diffPages(previous, next)).toEqual([
      { type: "added", url: "https://acme.com/new", title: "New" },
      { type: "changed", url: "https://acme.com/a", title: "A renamed", detail: 'Title: "A" → "A renamed"' },
      { type: "removed", url: "https://acme.com/gone", title: "Gone" },
    ]);
  });

  it("reports nothing when the crawl is identical", () => {
    expect(diffPages([base], [base])).toEqual([]);
  });
});

describe("snapshotHash", () => {
  it("ignores page ordering", () => {
    const other = { ...base, url: "https://acme.com/b", contentHash: "hash-b" };
    expect(snapshotHash([base, other])).toBe(snapshotHash([other, base]));
  });

  it("changes when any page content changes", () => {
    expect(snapshotHash([base])).not.toBe(snapshotHash([{ ...base, contentHash: "other" }]));
  });
});
