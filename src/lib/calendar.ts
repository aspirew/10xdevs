// Pure date helpers for the availability calendar. Native Date only — no library install.
// Single-TZ-per-group (PRD §Access Control) means all dates are treated as local clock
// values, no UTC conversion. See plan.md → "Past-slot boundary (UI-only)".

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
