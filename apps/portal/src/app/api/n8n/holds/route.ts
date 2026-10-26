import { NextResponse } from "next/server";
import { createServiceClient, listAgingHolds, releaseDueHolds } from "@tallocpa/db";
import { isFromN8n } from "@/lib/flow";

/** Held purchases older than this get an aging alert (hard rule 3). */
const AGING_DAYS = 30;

/**
 * n8n monthly schedule → portal: release holds whose period has arrived back
 * into the review bucket, and list aging held purchases for the alert email.
 * Body `{ period: "YYYY-MM" }` (the month being opened, Asia/Manila).
 */
export async function POST(request: Request) {
  if (!isFromN8n(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { period?: unknown } | null;
  const period = typeof body?.period === "string" ? body.period : "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    return NextResponse.json({ error: "period must be YYYY-MM" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const released = await releaseDueHolds(supabase, period);
  const aging = await listAgingHolds(supabase, AGING_DAYS);
  return NextResponse.json({ released, aging });
}
