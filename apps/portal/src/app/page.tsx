import { redirect } from "next/navigation";
import { createServiceClient, getPortalClient, isStaffUser } from "@tallocpa/db";
import { currentUserId } from "@/lib/session";

/** Send each signed-in user to their side of the portal. */
export default async function Home() {
  const userId = await currentUserId();
  if (!userId) redirect("/login");

  const supabase = createServiceClient();
  if (await isStaffUser(supabase, userId)) redirect("/review");
  if (await getPortalClient(supabase, userId)) redirect("/upload");

  return (
    <div className="sheet">
      <h1>Almost there</h1>
      <p className="lede">
        Your account isn&apos;t linked to a client yet. Please ask your TalloCPA contact to finish
        setting up your access.
      </p>
    </div>
  );
}
