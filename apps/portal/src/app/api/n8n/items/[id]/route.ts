import { NextResponse } from "next/server";
import { createServiceClient, setDriveFile } from "@tallocpa/db";
import { clearAndPost, isFromN8n } from "@/lib/flow";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * n8n → portal actions on one item:
 *   { action: "clear" }               the auto-clear rule; guarded by canAutoClear
 *   { action: "drive", fileId: "…" }  record the Drive copy of the source file
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isFromN8n(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { action?: unknown; fileId?: unknown } | null;

  if (body?.action === "clear") {
    const cleared = await clearAndPost(id, { rule: true });
    return cleared
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ ok: false, error: "not eligible for auto-clear" }, { status: 409 });
  }
  if (body?.action === "drive" && typeof body.fileId === "string" && body.fileId.length <= 200) {
    await setDriveFile(createServiceClient(), id, body.fileId);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
