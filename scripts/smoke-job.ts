import { createServiceClient, createJob } from "@tallocpa/db";

/**
 * Create a bookkeeping job for the Test Client and print its steps.
 * Requires migrations 0001 + 0002 applied and .env set.
 */
const supabase = createServiceClient();

const client = await supabase
  .from("clients")
  .select("id")
  .eq("name", "Test Client")
  .limit(1)
  .maybeSingle();
if (!client.data?.id) {
  console.error("No Test Client found — run smoke-template first (scripts/smoke-template.ts).");
  process.exit(1);
}
const clientId = client.data.id as string;

const res = await createJob(supabase, {
  clientId,
  serviceType: "bookkeeping",
  period: "2026-07",
});
console.log(`✓ Created bookkeeping job ${res.jobId} — status: ${res.status}`);

const steps = await supabase
  .from("job_steps")
  .select("step_order, name, owner_role, is_review_gate, status")
  .eq("job_id", res.jobId)
  .order("step_order");
if (steps.error) {
  console.error("✗ Read-back failed:", steps.error.message);
  process.exit(1);
}
console.log("\nRoute steps now in your database:");
console.table(steps.data);
