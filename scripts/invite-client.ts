import { createServiceClient } from "@tallocpa/db";

/**
 * Give a client's contact person portal access: send a Supabase invite email
 * and link the new user to the client. The portal's login is invite-only, so
 * this is the only way a client account gets created.
 *
 *   npm run invite-client -- owner@acme.ph <client-uuid>
 *
 * Requires migration 0005_portal.sql applied and .env set.
 */
const [email, clientId] = process.argv.slice(2);
if (!email || !clientId) {
  console.error("Usage: npm run invite-client -- <email> <client-id>");
  process.exit(1);
}

const supabase = createServiceClient();

const client = await supabase.from("clients").select("id, name").eq("id", clientId).maybeSingle();
if (client.error) throw client.error;
if (!client.data) {
  console.error(`No client with id ${clientId}.`);
  process.exit(1);
}

const redirectTo = process.env.PORTAL_URL ? `${process.env.PORTAL_URL}/auth/callback` : undefined;
const invite = await supabase.auth.admin.inviteUserByEmail(email, { redirectTo });
if (invite.error) throw invite.error;

const link = await supabase
  .from("client_users")
  .upsert({ user_id: invite.data.user.id, client_id: clientId }, { onConflict: "user_id" });
if (link.error) throw link.error;

console.log(`✓ Invited ${email} to the portal for ${client.data.name}`);
