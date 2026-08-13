import { PUBLIC_VAPID_PUBLIC_KEY } from "astro:env/client";

// Browser-side push flow. All state checks are pure (no side effects) so the
// UI can render deterministically on mount and on visibilitychange.
// Reason for standalone-mode gate: iOS Safari refuses `pushManager.subscribe`
// unless launched from the home-screen icon. Attempting to subscribe outside
// standalone mode fails silently on iPhone.

export type PushStatus =
  | "unsupported"
  | "not-standalone"
  | "permission-default"
  | "permission-denied"
  | "subscribed"
  | "not-subscribed";

interface PushResult {
  ok: boolean;
  reason?: string;
}

export async function getPushStatus(): Promise<PushStatus> {
  if (typeof window === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true;
  if (!isStandalone) return "not-standalone";

  if (Notification.permission === "denied") return "permission-denied";
  if (Notification.permission === "default") return "permission-default";

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub ? "subscribed" : "not-subscribed";
  } catch {
    return "unsupported";
  }
}

export async function subscribeCurrentUser(): Promise<PushResult> {
  if (!PUBLIC_VAPID_PUBLIC_KEY) return { ok: false, reason: "VAPID key not configured" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "Notification permission denied" };

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_PUBLIC_KEY),
    });
    const response = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({ error: "Unknown" }))) as { error?: string };
      return { ok: false, reason: body.error ?? `HTTP ${String(response.status)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "Subscribe failed" };
  }
}

export async function unsubscribeCurrentUser(): Promise<PushResult> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return { ok: true };

    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    const response = await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({ error: "Unknown" }))) as { error?: string };
      return { ok: false, reason: body.error ?? `HTTP ${String(response.status)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "Unsubscribe failed" };
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i += 1) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}
