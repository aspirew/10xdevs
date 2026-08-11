import React, { useState } from "react";
import type { AvailabilityWindow, MemberMark } from "@/lib/availability";
import { addDays, formatDate, parseDate, isPastSlot, WINDOW_DAYS } from "@/lib/calendar";
import { ConfirmSessionDialog } from "@/components/ConfirmSessionDialog";

// React is imported to mirror SignInForm.tsx — under `jsx: "react-jsx"` + Astro 6 + Vite,
// omitting it can cause `jsxDEV is not a function` during dev hydration when the JSX
// dev-runtime resolution loses its grip after a build→dev switch.
void React;

interface ConfirmedSessionSlot {
  slot_date: string;
  slot_hour: number;
  // True iff the current viewer is the host of this confirmed session. Gates the
  // per-row ✓ confirm button: once a session exists, only its host may propose
  // additional sessions (non-hosts hide the button entirely). Computed SSR-side
  // in groups/[id].astro from nextSession.host_user_id vs Astro.locals.user.id.
  iAmHost: boolean;
}

interface DialogSlot {
  slot_date: string;
  slot_hour: number;
  countAtSlot: number;
  groupSize: number;
}

interface Props {
  groupId: string;
  initial: AvailabilityWindow;
  initialStart: string;
  confirmedSession?: ConfirmedSessionSlot | null;
}

// Window length lives in @/lib/calendar so groups/[id].astro's SSR fetch shares it.
// Nav step derives from WINDOW_DAYS so Prev/Next always slides by exactly one window.
// Mobile-first NFR: default to 10:00–20:00 inclusive (11 columns). The data model still
// allows hours 0–23; this is purely a render choice — pre-existing marks outside this
// range keep contributing to overlap counts under the start-hour semantic but have no
// visible cell to toggle.
const VISIBLE_HOUR_START = 10;
const VISIBLE_HOUR_END = 21;

// Start-hour semantic (PRD FR-006): one row per (group, user, slot_date) — `slot_hour`
// is the member's START time for that day; availability lasts to end-of-day. The wedge
// surfaces "from what hour onward does most of the group overlap?" — overlap count at
// (date, hour) = members whose start_hour <= hour on that date.

export default function GroupCalendar({ groupId, initial, initialStart, confirmedSession }: Props) {
  const [start, setStart] = useState(initialStart);
  const [data, setData] = useState<AvailabilityWindow>(initial);
  const [loading, setLoading] = useState(false);
  const [failedDates, setFailedDates] = useState<Set<string>>(new Set());
  const [dialogSlot, setDialogSlot] = useState<DialogSlot | null>(null);

  const startDate = parseDate(start);
  const endStr = formatDate(addDays(startDate, WINDOW_DAYS - 1));

  // Whole confirm column disappears for non-hosts once a session exists. Before
  // any session is confirmed anyone can propose one (they'd become the host);
  // once someone has, only that host retains the affordance.
  const showConfirmColumn = confirmedSession == null || confirmedSession.iAmHost;

  // Derived lookups. The wire shape gives "mine" vs "others" already split — no
  // user_ids on the client. We just need fast date-keyed lookups for render.
  const myStartByDate = new Map<string, number>(data.myMarks.map((m) => [m.slot_date, m.slot_hour]));
  const othersByDate = new Map<string, number[]>();
  for (const m of data.othersMarks) {
    const arr = othersByDate.get(m.slot_date) ?? [];
    arr.push(m.slot_hour);
    othersByDate.set(m.slot_date, arr);
  }

  const myStartOn = (date: string): number | undefined => myStartByDate.get(date);
  const countAt = (date: string, hour: number): number => {
    let n = 0;
    const my = myStartByDate.get(date);
    if (my !== undefined && my <= hour) n++;
    const others = othersByDate.get(date);
    if (others) for (const oh of others) if (oh <= hour) n++;
    return n;
  };

  const days: string[] = [];
  for (let i = 0; i < WINDOW_DAYS; i++) days.push(formatDate(addDays(startDate, i)));
  const hours: number[] = [];
  for (let h = VISIBLE_HOUR_START; h < VISIBLE_HOUR_END; h++) hours.push(h);

  async function navTo(newStart: string) {
    setLoading(true);
    try {
      const newEnd = formatDate(addDays(parseDate(newStart), WINDOW_DAYS - 1));
      const res = await fetch(`/api/groups/${groupId}/availability?start=${newStart}&end=${newEnd}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `GET failed: ${res.status}`);
      }
      const next = (await res.json()) as AvailabilityWindow;
      setData(next);
      setStart(newStart);
    } catch (e) {
      console.warn("Calendar nav failed:", e);
    } finally {
      setLoading(false);
    }
  }

  function applyOptimisticMark(myMarks: MemberMark[], date: string, hour: number): MemberMark[] {
    const others = myMarks.filter((m) => m.slot_date !== date);
    return [...others, { slot_date: date, slot_hour: hour }];
  }

  function applyOptimisticUnmark(myMarks: MemberMark[], date: string): MemberMark[] {
    return myMarks.filter((m) => m.slot_date !== date);
  }

  async function toggle(slotDate: string, slotHour: number) {
    if (isPastSlot(slotDate, slotHour)) return;
    const currentStart = myStartOn(slotDate);
    const willUnmark = currentStart === slotHour;

    setData((prev) => ({
      ...prev,
      myMarks: willUnmark
        ? applyOptimisticUnmark(prev.myMarks, slotDate)
        : applyOptimisticMark(prev.myMarks, slotDate, slotHour),
    }));

    const endpoint = willUnmark ? "unmark" : "mark";
    const body = willUnmark ? { slot_date: slotDate } : { slot_date: slotDate, slot_hour: slotHour };

    try {
      const res = await fetch(`/api/groups/${groupId}/availability/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error ?? `${endpoint} failed: ${res.status}`);
      }
    } catch (e) {
      console.warn(`Failed to ${endpoint} ${slotDate}${willUnmark ? "" : ` @ ${slotHour}`}:`, e);
      // Inverse revert: restore THIS date's pre-toggle state against current marks
      // (which may include concurrent successful ops on other dates/cells). The
      // applyOptimistic* helpers are date-scoped — they only touch (slotDate)
      // entries in myMarks — so this composes correctly without a full-state snapshot.
      setData((prev) => ({
        ...prev,
        myMarks:
          currentStart === undefined
            ? applyOptimisticUnmark(prev.myMarks, slotDate)
            : applyOptimisticMark(prev.myMarks, slotDate, currentStart),
      }));
      setFailedDates((prev) => {
        const next = new Set(prev);
        next.add(slotDate);
        return next;
      });
      setTimeout(() => {
        setFailedDates((prev) => {
          if (!prev.has(slotDate)) return prev;
          const next = new Set(prev);
          next.delete(slotDate);
          return next;
        });
      }, 2000);
    }
  }

  return (
    <div className="rounded-2xl border border-amber-100/10 bg-amber-100/5 p-6 text-amber-50 backdrop-blur-xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Availability</h2>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => void navTo(formatDate(addDays(parseDate(start), -WINDOW_DAYS)))}
            disabled={loading}
            className="rounded-md border border-amber-100/20 bg-amber-100/10 px-3 py-1 text-xs font-medium text-amber-50 transition-colors hover:bg-amber-100/20 disabled:opacity-50"
          >
            ← Prev
          </button>
          <button
            type="button"
            onClick={() => void navTo(formatDate(new Date()))}
            disabled={loading}
            className="rounded-md border border-amber-100/20 bg-amber-100/10 px-3 py-1 text-xs font-medium text-amber-50 transition-colors hover:bg-amber-100/20 disabled:opacity-50"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => void navTo(formatDate(addDays(parseDate(start), WINDOW_DAYS)))}
            disabled={loading}
            className="rounded-md border border-amber-100/20 bg-amber-100/10 px-3 py-1 text-xs font-medium text-amber-50 transition-colors hover:bg-amber-100/20 disabled:opacity-50"
          >
            Next →
          </button>
        </div>
      </div>
      <p className="mb-3 text-xs text-amber-100/60">
        {start} → {endStr} · {data.groupSize} {data.groupSize === 1 ? "member" : "members"} · highlight at ≥{" "}
        {data.threshold}/{data.groupSize} available
      </p>
      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 bg-amber-100/5 px-1 py-0.5"></th>
              {hours.map((h) => (
                <th key={h} className="px-1 py-0.5 text-center font-normal text-amber-100/60">
                  {h}
                </th>
              ))}
              {showConfirmColumn && <th className="px-1 py-0.5 text-center font-normal text-amber-100/60">✓</th>}
            </tr>
          </thead>
          <tbody>
            {days.map((day) => {
              const d = parseDate(day);
              // Pin locale so SSR and CSR render identical strings; en-US matches the
              // rest of the UI which is in English (v1 single-locale assumption).
              const dayLabel = d.toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              });
              const myStart = myStartOn(day);
              const dayFailed = failedDates.has(day);
              return (
                <tr key={day}>
                  <th className="sticky left-0 z-10 bg-amber-100/5 px-2 py-0.5 text-right font-normal whitespace-nowrap text-amber-100/70">
                    {dayLabel}
                  </th>
                  {hours.map((h) => {
                    const key = `${day}|${h}`;
                    const count = countAt(day, h);
                    const past = isPastSlot(day, h);
                    const isHot = count > 0 && count >= data.threshold;
                    const isMyStart = myStart === h;
                    const iAmAvailable = myStart !== undefined && myStart <= h;
                    const isConfirmed = confirmedSession?.slot_date === day && confirmedSession.slot_hour === h;
                    // Color channels are separated so the eye can read them independently:
                    //   amber   = YOU (your start + your range from start to end-of-day)
                    //   emerald = GROUP overlap met (FR-008 wedge signal)
                    // Priority is exclusive (no background-class clashes): isMyStart wins
                    // over isHot wins over iAmAvailable wins over plain count.
                    let bgClass = "";
                    let ringClass = "";
                    let weightClass = "";
                    if (isMyStart) {
                      bgClass = "bg-amber-300/45";
                      ringClass = "ring-2 ring-amber-200 ring-inset";
                      weightClass = "font-bold";
                    } else if (isHot) {
                      bgClass = "bg-emerald-500/35";
                      ringClass = "ring-1 ring-emerald-300 ring-inset";
                    } else if (iAmAvailable) {
                      bgClass = "bg-amber-300/15";
                    } else if (count > 0) {
                      bgClass = "bg-amber-50/8";
                    }
                    const cellClass = [
                      "h-9 w-11 border border-amber-100/8 text-center select-none text-amber-50/80",
                      past ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-amber-100/10",
                      bgClass,
                      ringClass,
                      weightClass,
                      dayFailed ? "ring-2 ring-red-500 ring-inset" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    const label = past
                      ? `${day} ${h}:00 (past)`
                      : isMyStart
                        ? `${day} ${h}:00 · your start · tap to clear`
                        : myStart !== undefined && myStart < h
                          ? `${day} ${h}:00 · you're available · ${count}/${data.groupSize}`
                          : `${day} ${h}:00 · ${count}/${data.groupSize} available · tap to mark`;
                    return (
                      <td
                        key={key}
                        onClick={past ? undefined : () => void toggle(day, h)}
                        className={cellClass}
                        aria-label={isConfirmed ? `${label} · session confirmed` : label}
                      >
                        {isConfirmed ? (
                          <span className="flex flex-col items-center leading-none">
                            <span aria-hidden="true" className="text-amber-100">
                              ★
                            </span>
                            {count > 0 && (
                              <span className="text-[10px] text-amber-100/70">
                                {count}/{data.groupSize}
                              </span>
                            )}
                          </span>
                        ) : count > 0 ? (
                          `${count}/${data.groupSize}`
                        ) : (
                          ""
                        )}
                      </td>
                    );
                  })}
                  {showConfirmColumn && (
                    <td className="px-1 py-0.5 text-center">
                      {myStart !== undefined && !isPastSlot(day, myStart) ? (
                        <button
                          type="button"
                          onClick={() => {
                            setDialogSlot({
                              slot_date: day,
                              slot_hour: myStart,
                              countAtSlot: countAt(day, myStart),
                              groupSize: data.groupSize,
                            });
                          }}
                          aria-label={`Confirm session on ${day} at ${myStart}:00`}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-amber-100/20 bg-amber-100/10 text-xs text-amber-50 transition-colors hover:border-emerald-300 hover:bg-emerald-500/30 focus:ring-2 focus:ring-emerald-400 focus:outline-none"
                        >
                          ✓
                        </button>
                      ) : (
                        <span className="inline-block h-6 w-6" aria-hidden="true" />
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {loading && <p className="mt-2 text-center text-xs text-amber-100/40">Loading…</p>}
      <ConfirmSessionDialog
        key={dialogSlot ? `${dialogSlot.slot_date}|${dialogSlot.slot_hour}` : "closed"}
        groupId={groupId}
        slot={dialogSlot}
        onCancel={() => {
          setDialogSlot(null);
        }}
        onConfirmed={() => {
          window.location.reload();
        }}
      />
    </div>
  );
}
