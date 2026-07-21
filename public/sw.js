// GameSlot service worker — F-02.
// Handlers: install, activate, push, notificationclick, pushsubscriptionchange.
// No fetch listener — offline caching is out of scope.
//
// `pushsubscriptionchange` is load-bearing: iOS silently rotates subscriptions
// over time, and if we don't re-subscribe + POST the new endpoint, delivery
// dies without a signal. The re-subscribe path fetches the VAPID public key
// from /api/push/vapid-public-key (the SW is a static file, no build-time env),
// then POSTs to /api/push/subscribe — which accepts the anonymous continuity
// path (no session cookie needed when the endpoint already exists in the DB).
// See context/changes/pwa-shell-and-push-delivery/plan.md → F2 for the rationale.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = { title: "GameSlot", body: "" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    payload.body = event.data ? event.data.text() : "";
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      data: { url: payload.url ?? "/" },
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(targetUrl) && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    fetch("/api/push/vapid-public-key")
      .then((r) => r.json())
      .then((body) =>
        self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(body.key),
        }),
      )
      .then((sub) =>
        fetch("/api/push/subscribe", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sub),
        }),
      )
      .catch(() => {
        // Best effort — nothing to surface here. Next successful subscribe
        // from the client tab will heal the state.
      }),
  );
});

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}
