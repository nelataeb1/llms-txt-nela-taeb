import { NextResponse } from "next/server";
import { crawlToCompletion, trackSite } from "@/lib/monitor";
import { generateRequestSchema, resolveOptions } from "@/lib/schema";
import { getStore, isPersistent } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const store = getStore();
  const sites = await store.listSites();
  const withStatus = await Promise.all(
    sites.map(async (site) => {
      const snapshot = await store.latestSnapshot(site.id);
      return {
        ...site,
        latestSnapshotAt: snapshot?.createdAt ?? null,
        changeCount: snapshot?.changes.length ?? 0,
        pageCount: snapshot?.pages.length ?? 0,
      };
    }),
  );
  return NextResponse.json({ sites: withStatus, persistent: isPersistent() });
}

/** Adds a site to monitoring, crawling it once to store the baseline snapshot. */
export async function POST(request: Request) {
  const parsed = generateRequestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const options = resolveOptions(parsed.data.options);
  const result = await crawlToCompletion(parsed.data.url, options);
  const { site, snapshot } = await trackSite(parsed.data.url, options, result);
  return NextResponse.json({ site, snapshot: { ...snapshot, pages: undefined } });
}
