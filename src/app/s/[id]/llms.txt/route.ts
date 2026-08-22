import { getStore } from "@/lib/store";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** Stable hosted URL for a monitored site's latest generated file. */
export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const snapshot = await getStore().latestSnapshot(id);
  if (!snapshot) return new Response("Not found", { status: 404 });

  return new Response(snapshot.llmsTxt, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=300",
      "x-generated-at": snapshot.createdAt,
    },
  });
}
