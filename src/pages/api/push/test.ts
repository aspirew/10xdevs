import type { APIRoute } from "astro";
import { createAdminClient } from "@/lib/supabase-admin";
import { sendPushToUser } from "@/lib/push";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Fire a test push to every device the caller has subscribed. Scoped to
// self — no cross-user abuse vector. Kept in production so the /install
// page's "Send test notification" button works forever, and so ops can
// smoke the delivery pipeline any time without needing S-03 to run.
export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return json(401, { error: "Not authenticated" });

  const admin = createAdminClient();
  if (!admin) return json(500, { error: "Server misconfigured" });

  try {
    const result = await sendPushToUser(admin, user.id, {
      title: "GameSlot",
      body: "Test notification — this is what session confirmations will feel like.",
      url: "/groups",
    });
    return json(200, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown push error";
    return json(500, { error: message });
  }
};
