import { ingestTemplateFile } from "@tallocpa/db";

/**
 * CLI: ingest a filled template into Supabase for review.
 *   npm run ingest -- <path-to-csv-or-xlsx> <clientId>
 */
const [filePath, clientId] = process.argv.slice(2);

if (!filePath || !clientId) {
  console.error("Usage: npm run ingest -- <path-to-csv-or-xlsx> <clientId>");
  process.exit(1);
}

try {
  const result = await ingestTemplateFile({ filePath, clientId });
  console.log("✓ Ingested template");
  console.log(`  batch:    ${result.batchId}`);
  console.log(`  inserted: ${result.inserted} item(s) (all as needs_review)`);
  console.log(
    `  summary:  ok=${result.summary.ok} needsFix=${result.summary.needsFix} duplicates=${result.summary.duplicates}`,
  );
} catch (err) {
  console.error(
    "✗ Ingest failed:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
}
