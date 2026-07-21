import { useEffect, useState } from "react";
import { getPushStatus, type PushStatus } from "@/lib/push-client";

const DISMISS_KEY = "gs.installPushBanner.dismissedAt";
const DISMISS_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days — nudge again next month

// Nudges signed-in members to install + enable notifications so session confirms
// actually reach them. Renders null in most states: already subscribed, browser
// doesn't support push, permission denied, or previously dismissed within TTL.

function readDismissedFromStorage(): boolean {
  try {
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    return dismissedAt !== null && Date.now() - Number(dismissedAt) < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

export function InstallPushBanner() {
  const [status, setStatus] = useState<PushStatus | "loading">("loading");
  // Lazy initial value avoids the set-state-in-effect anti-pattern — localStorage is
  // synchronous, so we can read it once during initial render.
  const [dismissed, setDismissed] = useState<boolean>(readDismissedFromStorage);

  useEffect(() => {
    void getPushStatus().then(setStatus);
  }, []);

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Storage may be unavailable in strict privacy modes — swallow.
    }
    setDismissed(true);
  };

  if (status === "loading" || dismissed) return null;
  if (status === "unsupported" || status === "permission-denied" || status === "subscribed") return null;

  const message =
    status === "not-standalone"
      ? "Install GameSlot to your home screen to get notified when sessions are confirmed."
      : "Enable notifications so you don't miss confirmed sessions.";

  return (
    <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/10 p-4 text-sm text-white backdrop-blur-xl">
      <div>
        <p>{message}</p>
        <a href="/install" className="mt-1 inline-block text-purple-300 underline">
          Open install page →
        </a>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        className="rounded-md px-2 py-1 text-blue-100/70 hover:bg-white/10 hover:text-white"
        aria-label="Dismiss install prompt"
      >
        ✕
      </button>
    </div>
  );
}
