import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * A Supabase client using the **service-role** key. This bypasses RLS and must
 * only ever run server-side (the ingest worker), never in the browser. The key
 * is read from the environment — it is never committed or logged.
 */
export function createServiceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.example).",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
