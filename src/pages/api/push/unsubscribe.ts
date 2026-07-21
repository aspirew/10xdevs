import type { APIRoute } from "astro";
import { createAdminClient } from "@/lib/supabase-admin";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Delete a subscription by endpoint. Requires auth. Scoped to the caller's own
// rows as defense-in-depth against a signed-in user posting someone else's
// endpoint. Idempotent — deleting a non-existent row returns 200.
export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return json(401, { error: "Not authenticated" });

  let body: { endpoint?: unknown };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }
  const endpoint = body.endpoint;
  if (typeof endpoint !== "string" || endpoint.length === 0) {
    return json(400, { error: "endpoint must be a non-empty string" });
  }

  const admin = createAdminClient();
  if (!admin) return json(500, { error: "Server misconfigured" });

  const { error } = await admin.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", user.id);
  if (error) return json(500, { error: error.message });

  return json(200, { ok: true });
};
