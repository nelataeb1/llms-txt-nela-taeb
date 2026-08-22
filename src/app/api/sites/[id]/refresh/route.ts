import { NextResponse } from "next/server";
import { refreshSite } from "@/lib/monitor";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const { id } = await context.params;
  const site = await getStore().getSite(id);
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const { snapshot } = await refreshSite(site);
  return NextResponse.json({
    changed: snapshot.changed,
    changes: snapshot.changes,
    llmsTxt: snapshot.llmsTxt,
    checkedAt: snapshot.createdAt,
  });
}
