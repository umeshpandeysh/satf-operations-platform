/**
 * Utility helpers used across the SATF Operations Platform.
 */

import type { TourStatus, AssignmentStatus, ItineraryEntryType } from "./types";

// ─── Timezone and Date Arithmetic ──────────────────────────────────────────

/**
 * Return current calendar date in Asia/Kolkata timezone as an ISO date string (YYYY-MM-DD).
 * Defaults to system clock, accepts an optional reference Date for deterministic testing.
 */
export function getIndiaTodayISO(now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now);
}

/**
 * Add or subtract calendar days to/from an ISO date string (YYYY-MM-DD).
 * Uses UTC date calculations to avoid daylight-saving or local timezone offsets.
 */
export function addDaysToISO(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + days);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dt = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dt}`;
}

/**
 * Validates that a string is a strictly valid Gregorian calendar date in YYYY-MM-DD format.
 * Rejects leap year overflows (e.g. 2026-02-29) and invalid month/day ranges.
 */
export function isValidCalendarDate(dateStr: string): boolean {
  if (!dateStr || typeof dateStr !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const [y, m, day] = dateStr.split("-").map(Number);
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || day < 1 || day > 31) {
    return false;
  }
  const d = new Date(Date.UTC(y, m - 1, day));
  return (
    d.getUTCFullYear() === y &&
    d.getUTCMonth() === m - 1 &&
    d.getUTCDate() === day
  );
}

// ─── Date formatting ─────────────────────────────────────────────────────────

/**
 * Format an ISO date string (YYYY-MM-DD) to a human-readable form.
 * Uses UTC timezone so "2026-10-17" consistently outputs "17 Oct 2026" regardless of local client time.
 * e.g. "2026-10-17" → "17 Oct 2026"
 */
export function formatDate(isoDate: string): string {
  if (!isoDate) return "—";
  const datePart = isoDate.split("T")[0];
  const [year, month, day] = datePart.split("-").map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return isoDate;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Format an ISO date string to a short form.
 * e.g. "2026-10-17" → "17 Oct"
 */
export function formatDateShort(isoDate: string): string {
  if (!isoDate) return "—";
  const datePart = isoDate.split("T")[0];
  const [year, month, day] = datePart.split("-").map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return isoDate;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
  });
}

/**
 * Return the number of nights between two ISO date strings (to - from).
 * Uses UTC timestamps to ensure consistent whole-day arithmetic across daylight-saving boundaries.
 */
export function nightsBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  const utc1 = Date.UTC(y1, m1 - 1, d1);
  const utc2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((utc2 - utc1) / (1000 * 60 * 60 * 24));
}

/**
 * Return a relative label — "Today", "Tomorrow", "Yesterday", "In N days", "N days ago".
 * Relative to the provided today string (YYYY-MM-DD).
 */
export function relativeDayLabel(isoDate: string, today: string): string {
  const diff = nightsBetween(today, isoDate);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1) return `In ${diff} days`;
  return `${Math.abs(diff)} days ago`;
}

// ─── Status display helpers ───────────────────────────────────────────────────

export const TOUR_STATUS_LABELS: Record<TourStatus, string> = {
  upcoming: "Upcoming",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
  attention: "Needs Attention",
};

export const TOUR_STATUS_CLASSES: Record<TourStatus, string> = {
  upcoming: "bg-blue-50 text-blue-700 border border-blue-200",
  active: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  completed: "bg-slate-100 text-slate-600 border border-slate-200",
  cancelled: "bg-red-50 text-red-600 border border-red-200",
  attention: "bg-amber-50 text-amber-700 border border-amber-200",
};

export const ASSIGNMENT_STATUS_CLASSES: Record<AssignmentStatus, string> = {
  assigned: "text-emerald-700",
  unassigned: "text-red-600",
  pending: "text-amber-600",
};

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  assigned: "Assigned",
  unassigned: "Unassigned",
  pending: "Pending",
};

// ─── Itinerary icon mapping ────────────────────────────────────────────────────

export const ITINERARY_TYPE_LABELS: Record<ItineraryEntryType, string> = {
  transfer: "Transfer",
  sightseeing: "Sightseeing",
  hotel_checkin: "Hotel Check-in",
  hotel_checkout: "Hotel Check-out",
  flight: "Flight",
  activity: "Activity",
  meal: "Meal",
  rest: "Rest / Free time",
  departure_transfer: "Departure Transfer",
  arrival_transfer: "Arrival Transfer",
};

// ─── CSV Security & Sanitization ───────────────────────────────────────────────

/**
 * Safely escape and sanitize a value for inclusion in a CSV file.
 * Prevents CSV formula injection (CWE-1236) by neutralizing leading triggers (=, +, -, @, \t, \r, %).
 */
export function sanitizeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return '""';
  let str = String(val).replace(/\r\n|\r|\n/g, " ");
  const trimmed = str.trimStart();
  if (/^[=+\-@\t\r%]/.test(trimmed)) {
    str = `'${str}`;
  }
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}
