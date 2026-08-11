// Pure date helpers for the availability calendar. Native Date only — no library install.
// Single-TZ-per-group (PRD §Access Control) means all dates are treated as local clock
// values, no UTC conversion. See plan.md → "Past-slot boundary (UI-only)".

// Visible calendar window length in days. Used by GroupCalendar (render loop + nav step)
// and by groups/[id].astro (SSR initial availability fetch). Bump both consumers in one
// place if the window changes.
export const WINDOW_DAYS = 7;

export function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

export function buildWindow(start: Date, days: number): Date[] {
  const out: Date[] = [];
  for (let i = 0; i < days; i++) {
    out.push(addDays(start, i));
  }
  return out;
}

export function isPastSlot(slotDate: string, slotHour: number, now: Date = new Date()): boolean {
  const today = formatDate(now);
  if (slotDate < today) return true;
  if (slotDate > today) return false;
  return slotHour < now.getHours();
}

export function isIsoDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// Human-readable slot label, e.g. "Sat, Oct 3 · 7pm". Deterministic en-US locale
// so server-side push bodies match what the client renders in the banner + dialog.
// Uses native Date via parseDate; single-TZ-per-group means no offset math.
export function formatSlotLabel(slotDate: string, slotHour: number): string {
  const d = parseDate(slotDate);
  const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
  const monthDay = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const hour12 =
    slotHour === 0 ? "12am" : slotHour < 12 ? `${slotHour}am` : slotHour === 12 ? "12pm" : `${slotHour - 12}pm`;
  return `${dayName}, ${monthDay} · ${hour12}`;
}
