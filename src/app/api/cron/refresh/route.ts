import { NextResponse } from "next/server";
import { refreshSite } from "@/lib/monitor";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Scheduled by vercel.json. Re-crawls monitored sites oldest-check-first and
 * records a new snapshot whenever the site changed.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = request.headers.get("authorization");
    if (header !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const store = getStore();
  const sites = (await store.listSites())
    .filter((site) => site.monitoring)
    .sort((a, b) => (a.lastCheckedAt ?? "").localeCompare(b.lastCheckedAt ?? ""));

  const deadline = Date.now() + 240_000;
  const checked: { url: string; changed: boolean; changes: number }[] = [];

  for (const site of sites) {
    if (Date.now() > deadline) break;
    try {
      const { snapshot } = await refreshSite(site, 40_000);
      checked.push({ url: site.url, changed: snapshot.changed, changes: snapshot.changes.length });
    } catch (error) {
      checked.push({ url: site.url, changed: false, changes: 0 });
      console.error(`refresh failed for ${site.url}`, error);
    }
  }

  return NextResponse.json({ checked, total: sites.length });
}
