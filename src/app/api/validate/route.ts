import { NextResponse } from "next/server";
import { validateLlmsTxt } from "@/lib/validate";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const source = typeof body.source === "string" ? body.source : "";
  if (!source.trim()) {
    return NextResponse.json({ error: "Provide llms.txt content in `source`" }, { status: 400 });
  }
  return NextResponse.json(validateLlmsTxt(source));
}
