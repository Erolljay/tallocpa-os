import { readFile } from "node:fs/promises";
import { createServiceClient, ingestParsedBatch } from "@tallocpa/db";
import { fileToRows } from "@tallocpa/template-io";
import { parseTemplateRows } from "@tallocpa/template-parser";

/**
 * One-shot proof that the template lane persists end to end:
 *   schema check -> ensure a Test Client -> ingest the sample CSV -> read back.
 * Reads Supabase creds from .env via `node --env-file`.
 */
const supabase = createServiceClient();

// 0. Schema present?
const schema = await supabase
  .from("intake_items")
  .select("id", { count: "exact", head: true });
if (schema.error) {
  console.error(
    "✗ Schema check failed — did you run supabase/migrations/0001_init.sql (step 2)?",
  );
  console.error("  detail:", schema.error.message);
  process.exit(1);
}
console.log("✓ Connected, schema present");

// 1. Ensure a Test Client exists (reuse if already there).
let clientId: string;
const existing = await supabase
  .from("clients")
  .select("id")
  .eq("name", "Test Client")
  .limit(1)
  .maybeSingle();
if (existing.data?.id) {
  clientId = existing.data.id as string;
  console.log("✓ Reusing Test Client:", clientId);
} else {
  const created = await supabase
    .from("clients")
    .insert({ name: "Test Client", tin: "123-456-789-000" })
    .select("id")
    .single();
  if (created.error) {
    console.error("✗ Could not create client:", created.error.message);
    process.exit(1);
  }
  clientId = created.data.id as string;
  console.log("✓ Created Test Client:", clientId);
}

// 2. Ingest the sample template.
const text = await readFile("docs/templates/intake-template.csv", "utf8");
const rows = await fileToRows({ name: "intake-template.csv", data: text });
const parsed = parseTemplateRows(rows);
const result = await ingestParsedBatch(supabase, {
  clientId,
  fileName: "intake-template.csv",
  parsed,
});
console.log(
  `✓ Ingested batch ${result.batchId}: ${result.inserted} item(s)`,
  result.summary,
);

// 3. Read them back.
const readback = await supabase
  .from("intake_items")
  .select("supplier_name, gross, vat, review_status, review_notes")
  .eq("batch_id", result.batchId);
if (readback.error) {
  console.error("✗ Read-back failed:", readback.error.message);
  process.exit(1);
}
console.log("\nRows now in your database:");
console.table(readback.data);
