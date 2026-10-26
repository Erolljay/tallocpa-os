"use server";

import { revalidatePath } from "next/cache";
import type { Ledger } from "@tallocpa/domain";
import {
  approveHold,
  createServiceClient,
  isPracticeLead,
  rejectItem,
  updateItemFields,
  type ItemEdits,
} from "@tallocpa/db";
import { requireStaff } from "@/lib/session";
import { clearAndPost, notify, parseItem } from "@/lib/flow";
import { LEDGERS } from "@/lib/labels";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function itemId(form: FormData): string {
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) throw new Error("Invalid item id.");
  return id;
}

function text(form: FormData, name: string, max = 300): string | null {
  const v = String(form.get(name) ?? "").trim();
  return v === "" ? null : v.slice(0, max);
}

/** A peso amount field: blank → null; otherwise a non-negative number. */
function pesos(form: FormData, name: string, label: string): number | null {
  const raw = text(form, name);
  if (raw == null) return null;
  const n = Number(raw.replace(/[₱,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be a positive number.`);
  return n;
}

/** Parse and validate the reviewer's edit form. Throws on bad input. */
function parseEdits(form: FormData): ItemEdits {
  const date = text(form, "txnDate");
  if (date && !ISO_DATE.test(date)) throw new Error("Date must be YYYY-MM-DD.");
  const ledger = String(form.get("ledger") ?? "") as Ledger;
  if (!LEDGERS.includes(ledger)) throw new Error("Pick a category.");
  return {
    txnDate: date,
    supplierName: text(form, "supplierName"),
    tin: text(form, "tin", 30),
    counterpartyAddress: text(form, "address"),
    orNumber: text(form, "orNumber", 60),
    ledger,
    grossPesos: pesos(form, "gross", "Total"),
    vatablePesos: pesos(form, "vatable", "VATable"),
    vatExemptPesos: pesos(form, "vatExempt", "VAT-exempt"),
    zeroRatedPesos: pesos(form, "zeroRated", "Zero-rated"),
    vatPesos: pesos(form, "vat", "VAT"),
    whtPesos: pesos(form, "wht", "Withholding"),
    atc: text(form, "atc", 20),
    clientNote: text(form, "clientNote", 500),
  };
}

export async function saveItem(form: FormData): Promise<void> {
  await requireStaff();
  await updateItemFields(createServiceClient(), itemId(form), parseEdits(form));
  revalidatePath("/review");
}

/** Save what the reviewer sees, then clear → post → tell n8n. */
export async function clearItemAction(form: FormData): Promise<void> {
  const { userId } = await requireStaff();
  const id = itemId(form);
  const edits = parseEdits(form);
  // Posting needs a period, and the period comes from the date.
  if (!edits.txnDate) throw new Error("Add the document date before clearing.");
  await updateItemFields(createServiceClient(), id, edits);
  await clearAndPost(id, { staffUserId: userId });
  revalidatePath("/review");
}

export async function reject(form: FormData): Promise<void> {
  await requireStaff();
  await rejectItem(createServiceClient(), itemId(form), text(form, "reason") ?? "");
  revalidatePath("/review");
}

/** Fallback when n8n is down: read an upload right now. */
export async function parseNow(form: FormData): Promise<void> {
  await requireStaff();
  await parseItem(itemId(form));
  revalidatePath("/review");
}

export async function resend(form: FormData): Promise<void> {
  await requireStaff();
  await notify(itemId(form), "item.posted");
  revalidatePath("/review");
}

/** Hard rule 3: only a practice lead signs off a deferred sale, with a reason. */
export async function approveHoldAction(form: FormData): Promise<void> {
  const { userId, role } = await requireStaff();
  if (!isPracticeLead(role)) throw new Error("Only a practice lead can approve a deferred sale.");
  await approveHold(createServiceClient(), {
    itemId: itemId(form),
    staffUserId: userId,
    reason: text(form, "reason") ?? "",
  });
  revalidatePath("/review");
}
