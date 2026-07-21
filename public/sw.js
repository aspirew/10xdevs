// GameSlot service worker — F-02 Phase 1 (install + activate only)
// Push, notificationclick, and pushsubscriptionchange handlers land in Phase 3.
// No fetch listener — offline caching is out of scope; a pass-through would
// only add a SW hop with zero benefit.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
