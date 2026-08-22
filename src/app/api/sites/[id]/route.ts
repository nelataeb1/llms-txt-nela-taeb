import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const store = getStore();
  const site = await store.getSite(id);
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });
  const snapshots = await store.listSnapshots(id, 20);
  return NextResponse.json({
    site,
    snapshots: snapshots.map(({ pages, ...snapshot }) => ({ ...snapshot, pageCount: pages.length })),
    latest: snapshots[0] ?? null,
  });
}

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  if (typeof body.monitoring === "boolean") {
    await getStore().setSiteMonitoring(id, body.monitoring);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  await getStore().deleteSite(id);
  return NextResponse.json({ ok: true });
}
