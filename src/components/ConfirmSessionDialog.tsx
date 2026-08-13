import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

interface SlotInfo {
  slot_date: string;
  slot_hour: number;
  countAtSlot: number;
  groupSize: number;
}

interface Props {
  groupId: string;
  slot: SlotInfo | null;
  onCancel: () => void;
  onConfirmed: () => void;
}

// Confirm-session modal. Opens whenever `slot` is non-null; closes via `onCancel`
// (Cancel button, Esc, click outside, or the corner X). On successful POST the
// parent's `onConfirmed` is called — the caller reloads the page, so the banner
// and cell badge re-render from SSR truth (matches S-02's page-load convention).
export function ConfirmSessionDialog({ groupId, slot, onCancel, onConfirmed }: Props) {
  const [location, setLocation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form-state reset on slot change is handled by remounting: the caller passes
  // a `key` derived from the slot identity, so opening the dialog for a new slot
  // gives us a fresh component instance (empty location, cleared error). This
  // avoids a useEffect that would trip react-hooks/set-state-in-effect.

  async function handleConfirm() {
    if (!slot) return;
    const trimmed = location.trim();
    if (trimmed.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot_date: slot.slot_date, slot_hour: slot.slot_hour, location: trimmed }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Confirm failed: ${res.status}`);
      }
      onConfirmed();
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={slot !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm session</DialogTitle>
          <DialogDescription>
            {slot
              ? `${formatSlotLabel(slot.slot_date, slot.slot_hour)} · ${slot.countAtSlot}/${slot.groupSize} available`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="session-location">Location</Label>
          <Input
            id="session-location"
            placeholder="e.g. Anna's place"
            value={location}
            onChange={(e) => {
              setLocation(e.target.value);
            }}
            autoFocus
            disabled={submitting}
          />
        </div>
        {error && (
          <p role="alert" className="rounded-md border border-red-500/40 bg-red-100 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={submitting || location.trim().length === 0}
          >
            {submitting ? "Confirming…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
