import { createServiceClient, seedSops, getSopForStep } from "@tallocpa/db";

/**
 * Load the seed SOP library into the database, then read one back.
 * Requires migrations 0001-0003 applied and .env set.
 */
const supabase = createServiceClient();

const res = await seedSops(supabase);
console.log(`✓ Seeded ${res.upserted} SOPs into the library`);

const sample = await getSopForStep(supabase, "bookkeeping", "review");
if (sample) {
  console.log(`\n${sample.title}  (v${sample.version})`);
  console.log(`  purpose: ${sample.purpose}`);
  console.log(`  procedure:`);
  sample.procedure.forEach((p, i) => console.log(`    ${i + 1}. ${p}`));
  console.log(`  checklist: ${sample.checklist.join(" · ")}`);
}
