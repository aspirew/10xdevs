import type { APIRoute } from "astro";
import { createAdminClient } from "@/lib/supabase-admin";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Two auth paths (per plan-review F2):
//   - Authenticated: upsert keyed by endpoint. Owns user_id assignment.
//   - Anonymous continuity: if the SW's `pushsubscriptionchange` handler wakes
//     without a fresh session cookie, we still let it refresh encryption keys
//     on an existing endpoint. Never allows anon INSERT of new endpoints.
// Endpoint URLs are opaque per-device tokens; delivery still lands on the
// original device even if an attacker somehow obtained one — refresh-only is
// therefore a defensible relaxation.
export const POST: APIRoute = async (context) => {
  let body: { endpoint?: unknown; keys?: unknown; expirationTime?: unknown };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const endpoint = body.endpoint;
  const keys = body.keys as { p256dh?: unknown; auth?: unknown } | undefined;
  const expirationTime = body.expirationTime;

  if (typeof endpoint !== "string" || endpoint.length === 0) {
    return json(400, { error: "endpoint must be a non-empty string" });
  }
  if (!keys || typeof keys.p256dh !== "string" || typeof keys.auth !== "string" || !keys.p256dh || !keys.auth) {
    return json(400, { error: "keys.p256dh and keys.auth are required non-empty strings" });
  }
  const p256dh = keys.p256dh;
  const auth = keys.auth;
  const expiration_time = Number.isFinite(expirationTime) ? new Date(expirationTime as number).toISOString() : null;

  const admin = createAdminClient();
  if (!admin) return json(500, { error: "Server misconfigured" });

  const user = context.locals.user;
  const userAgent = context.request.headers.get("user-agent") ?? null;

  if (user) {
    // Authenticated path: full upsert. Owns user_id, resets failure counters.
    const { error } = await admin.from("push_subscriptions").upsert(
      {
        user_id: user.id,
        endpoint,
        p256dh,
        auth,
        expiration_time,
        user_agent: userAgent,
        last_success_at: null,
        last_failure_at: null,
        failure_count: 0,
      },
      { onConflict: "endpoint" },
    );
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true });
  }

  // Anonymous continuity path: only refresh keys on an existing endpoint.
  const { data: existing } = await admin.from("push_subscriptions").select("id").eq("endpoint", endpoint).maybeSingle();
  if (!existing) return json(401, { error: "Not authenticated" });

  const { error: updateError } = await admin
    .from("push_subscriptions")
    .update({ p256dh, auth, expiration_time })
    .eq("endpoint", endpoint);
  if (updateError) return json(500, { error: updateError.message });

  // Log anonymous-continuity updates so we can see churn volume in Vercel logs.
  // eslint-disable-next-line no-console -- intentional operational signal per F2 plan fix
  console.info(`[push] anon-continuity refresh for endpoint ${endpoint.slice(0, 40)}…`);
  return json(200, { ok: true });
};
