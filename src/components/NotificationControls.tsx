import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getPushStatus, subscribeCurrentUser, unsubscribeCurrentUser, type PushStatus } from "@/lib/push-client";

interface Props {
  isSignedIn: boolean;
}

export function NotificationControls({ isSignedIn }: Props) {
  const [status, setStatus] = useState<PushStatus | "loading">("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      void getPushStatus().then(setStatus);
    };
    refresh();
    document.addEventListener("visibilitychange", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const handleSubscribe = async () => {
    setBusy(true);
    setError(null);
    const result = await subscribeCurrentUser();
    if (!result.ok) setError(result.reason ?? "Subscribe failed");
    setStatus(await getPushStatus());
    setBusy(false);
  };

  const handleUnsubscribe = async () => {
    setBusy(true);
    setError(null);
    const result = await unsubscribeCurrentUser();
    if (!result.ok) setError(result.reason ?? "Unsubscribe failed");
    setStatus(await getPushStatus());
    setBusy(false);
  };

  if (status === "loading") {
    return <p className="text-muted-foreground text-sm">Loading notification status…</p>;
  }

  if (status === "unsupported") {
    return <p className="text-muted-foreground text-sm">This browser does not support Web Push notifications.</p>;
  }

  if (status === "not-standalone") {
    return (
      <p className="text-muted-foreground text-sm">
        Install GameSlot to your home screen first (see instructions above), then open it from the icon to enable
        notifications.
      </p>
    );
  }

  if (!isSignedIn && status !== "subscribed") {
    return (
      <p className="text-sm">
        <a href="/auth/signin?next=/settings" className="underline">
          Sign in
        </a>{" "}
        to enable notifications.
      </p>
    );
  }

  if (status === "permission-denied") {
    return (
      <p className="text-muted-foreground text-sm">
        Notifications are blocked in your browser settings. Re-enable them in the browser preferences for this site,
        then reload.
      </p>
    );
  }

  if (status === "permission-default" || status === "not-subscribed") {
    return (
      <div className="flex flex-col gap-2">
        <Button onClick={() => void handleSubscribe()} disabled={busy}>
          {busy ? "Enabling…" : "Enable notifications"}
        </Button>
        {error && <p className="text-destructive text-sm">{error}</p>}
      </div>
    );
  }

  // status === "subscribed"
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => void handleUnsubscribe()}
          disabled={busy}
          className="border border-amber-100/20 bg-amber-100/10 text-amber-50 hover:bg-amber-100/20"
        >
          Unsubscribe this device
        </Button>
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
