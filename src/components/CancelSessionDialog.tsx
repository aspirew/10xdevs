import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatSlotLabel } from "@/lib/calendar";

// React is imported explicitly — under `jsx: "react-jsx"` + Astro 6 + Vite,
// omitting it can cause `jsxDEV is not a function` after a build→dev switch.
void React;

interface CancelTarget {
  id: string;
  slot_date: string;
  slot_hour: number;
  location: string;
}

interface Props {
  groupId: string;
  session: CancelTarget | null;
  onCancel: () => void;
  onConfirmed: () => void;
}

// Host-only cancellation dialog. Opens whenever `session` is non-null; closes
// via `onCancel` (Keep session button, Esc, click outside, or the corner X).
// On successful DELETE the parent calls `onConfirmed`, which reloads the page
// so the banner + calendar re-render from SSR truth (matches S-03's confirm
// dialog handoff). Component remount for state reset is via `key` from the
// caller (matches ConfirmSessionDialog pattern).
export function CancelSessionDialog({ groupId, session, onCancel, onConfirmed }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!session) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/sessions/${session.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Cancel failed: ${res.status}`);
      }
      onConfirmed();
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={session !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel session</DialogTitle>
          <DialogDescription>
            {session ? `${formatSlotLabel(session.slot_date, session.slot_hour)} · ${session.location}` : ""}
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm">Everyone in the group will get a notification.</p>
        {error && (
          <p role="alert" className="rounded-md border border-red-500/40 bg-red-100 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onCancel} disabled={submitting}>
            Keep session
          </Button>
          <Button variant="destructive" type="button" onClick={() => void handleConfirm()} disabled={submitting}>
            {submitting ? "Cancelling…" : "Cancel session"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
