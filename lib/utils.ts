/**
 * Utility helpers used across the SATF Operations Platform.
 */

import type { TourStatus, AssignmentStatus } from "./types";

// ─── Date formatting ─────────────────────────────────────────────────────────

/**
 * Format an ISO date string (YYYY-MM-DD) to a human-readable form.
 * e.g. "2025-11-13" → "13 Nov 2025"
 */
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Format an ISO date string to a short form.
 * e.g. "2025-11-13" → "13 Nov"
 */
export function formatDateShort(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

/**
 * Return the number of nights between two ISO date strings.
 */
export function nightsBetween(from: string, to: string): number {
  const a = new Date(from);
  const b = new Date(to);
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Return a relative label — "Today", "Tomorrow", "In N days", "N days ago".
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
  upcoming:
    "bg-blue-50 text-blue-700 border border-blue-200",
  active:
    "bg-emerald-50 text-emerald-700 border border-emerald-200",
  completed:
    "bg-slate-100 text-slate-600 border border-slate-200",
  cancelled:
    "bg-red-50 text-red-600 border border-red-200",
  attention:
    "bg-amber-50 text-amber-700 border border-amber-200",
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

import type { ItineraryEntryType } from "./types";

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
