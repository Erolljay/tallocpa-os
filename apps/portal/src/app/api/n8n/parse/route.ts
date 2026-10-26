import { NextResponse } from "next/server";
import { createServiceClient, itemPayload } from "@tallocpa/db";
import { isFromN8n, parseItem } from "@/lib/flow";

// Gemini reads can take 10–30 s.
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * n8n → portal: read an uploaded document with the AI parser.
 * Body `{ id }`. Returns the `item.parsed` payload (status, flags, validity,
 * recommendation, signed file URL for the Drive copy).
 */
export async function POST(request: Request) {
  if (!isFromN8n(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!UUID.test(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  await parseItem(id);
  return NextResponse.json(await itemPayload(createServiceClient(), id, "item.parsed"));
}
