import type { SupabaseClient } from "@supabase/supabase-js";
import { SEED_SOPS, sopKey, type Sop } from "@tallocpa/sop";
import type { ServiceType } from "@tallocpa/routes";

/**
 * Load (upsert) the seed SOP library into the database. Idempotent on `key`, so
 * re-seeding refreshes content without creating duplicates. Firm edits after
 * seeding are preserved by bumping version via reviseSop (later).
 */
export async function seedSops(
  supabase: SupabaseClient,
  sops: Sop[] = SEED_SOPS,
): Promise<{ upserted: number }> {
  const rows = sops.map((s) => ({
    key: s.key,
    service_type: s.serviceType,
    step_key: s.stepKey,
    title: s.title,
    purpose: s.purpose,
    procedure: s.procedure,
    checklist: s.checklist,
    version: s.version,
    status: "active",
  }));
  const { error } = await supabase.from("sops").upsert(rows, { onConflict: "key" });
  if (error) throw error;
  return { upserted: rows.length };
}

/** Fetch the current SOP for a route step, or null if none is stored. */
export async function getSopForStep(
  supabase: SupabaseClient,
  serviceType: ServiceType,
  stepKey: string,
): Promise<Sop | null> {
  const { data, error } = await supabase
    .from("sops")
    .select("service_type, step_key, title, purpose, procedure, checklist, version")
    .eq("key", sopKey(serviceType, stepKey))
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as {
    service_type: ServiceType;
    step_key: string;
    title: string;
    purpose: string;
    procedure: string[];
    checklist: string[];
    version: number;
  };
  return {
    key: sopKey(row.service_type, row.step_key),
    serviceType: row.service_type,
    stepKey: row.step_key,
    title: row.title,
    purpose: row.purpose,
    procedure: row.procedure,
    checklist: row.checklist,
    version: row.version,
  };
}
