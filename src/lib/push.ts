import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } from "astro:env/server";

// The single source-of-truth for Web Push wiring. Keep the `web-push` import
// in this one file so future replacement / version bump is a one-file change.
// S-03 imports `sendPushToUser` from here for the confirm-session flow.

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export interface SendResult {
  sent: number;
  failed: number;
  deleted: number;
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

let vapidConfigured = false;
function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) return false;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidConfigured = true;
  return true;
}

// Read all push_subscriptions for `userId` and send `payload` to each. Dead
// endpoints (410 / 404) are DELETEd inline; other errors bump failure_count.
// Returns per-call counts so callers can log churn.
export async function sendPushToUser(admin: SupabaseClient, userId: string, payload: PushPayload): Promise<SendResult> {
  if (!ensureVapidConfigured()) {
    throw new Error("VAPID keys not configured");
  }

  const { data: rows, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const subs = rows as SubscriptionRow[];

  let sent = 0;
  let failed = 0;
  let deleted = 0;

  const serialized = JSON.stringify(payload);

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        serialized,
      );
      sent += 1;
      await admin.from("push_subscriptions").update({ last_success_at: new Date().toISOString() }).eq("id", sub.id);
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await admin.from("push_subscriptions").delete().eq("id", sub.id);
        deleted += 1;
      } else {
        failed += 1;
        await admin
          .from("push_subscriptions")
          .update({
            last_failure_at: new Date().toISOString(),
            failure_count: (await getCurrentFailureCount(admin, sub.id)) + 1,
          })
          .eq("id", sub.id);
      }
    }
  }

  return { sent, failed, deleted };
}

async function getCurrentFailureCount(admin: SupabaseClient, id: string): Promise<number> {
  const { data } = await admin.from("push_subscriptions").select("failure_count").eq("id", id).maybeSingle();
  return (data as { failure_count?: number } | null)?.failure_count ?? 0;
}
