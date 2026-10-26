import { redirect } from "next/navigation";
import type { StaffRole } from "@tallocpa/domain";
import {
  createServiceClient,
  getPortalClient,
  getStaffRole,
  type PortalClient,
} from "@tallocpa/db";
import { createSessionClient } from "./supabase";

/** The signed-in user's id, or null. `getUser()` re-validates the JWT with Supabase. */
export async function currentUserId(): Promise<string | null> {
  const supabase = await createSessionClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Gate for client pages and actions: signed in AND linked to a client. */
export async function requireClient(): Promise<{ userId: string; client: PortalClient }> {
  const userId = await currentUserId();
  if (!userId) redirect("/login");
  const client = await getPortalClient(createServiceClient(), userId);
  if (!client) redirect("/");
  return { userId, client };
}

/** Gate for staff pages and actions. */
export async function requireStaff(): Promise<{ userId: string; role: StaffRole }> {
  const userId = await currentUserId();
  if (!userId) redirect("/login");
  const role = await getStaffRole(createServiceClient(), userId);
  if (!role) redirect("/");
  return { userId, role };
}
