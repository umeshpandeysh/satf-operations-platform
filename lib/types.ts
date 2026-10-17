/**
 * SATF Operations Platform — Core TypeScript types
 *
 * These interfaces model the operational concepts used at South Asia Travel
 * Factory. They are intentionally separate from any persistence layer so the
 * frontend can connect to a real API in a later phase without restructuring.
 */

// ─── Enums / union types ────────────────────────────────────────────────────

export type TourStatus =
  | "upcoming"
  | "active"
  | "completed"
  | "cancelled"
  | "attention";

export type AssignmentStatus = "assigned" | "unassigned" | "pending";

export type FlightDirection = "arrival" | "departure";

export type ItineraryEntryType =
  | "transfer"
  | "sightseeing"
  | "hotel_checkin"
  | "hotel_checkout"
  | "flight"
  | "activity"
  | "meal"
  | "rest"
  | "departure_transfer"
  | "arrival_transfer";

export type RoomType = "single" | "double" | "twin" | "triple" | "suite";

// ─── Sub-entities ────────────────────────────────────────────────────────────

export interface FlightLeg {
  id: string;
  direction: FlightDirection;
  flightNumber: string;
  airline: string;
  /** ISO date string YYYY-MM-DD */
  date: string;
  /** HH:mm local time */
  departureTime: string;
  arrivalTime: string;
  origin: string;
  destination: string;
  terminal?: string;
  notes?: string;
}

export interface HotelStay {
  id: string;
  hotelName: string;
  city: string;
  /** ISO date string YYYY-MM-DD */
  checkIn: string;
  /** ISO date string YYYY-MM-DD */
  checkOut: string;
  roomType: RoomType;
  roomCount: number;
  confirmationNumber?: string;
  notes?: string;
}

export interface ItineraryEntry {
  id: string;
  /** ISO date string YYYY-MM-DD */
  date: string;
  /** HH:mm */
  startTime?: string;
  type: ItineraryEntryType;
  title: string;
  description?: string;
  location?: string;
  durationMinutes?: number;
  notes?: string;
}

export interface ResourceAssignment {
  id: string;
  role: "guide" | "driver" | "vehicle" | "coordinator";
  status: AssignmentStatus;
  name?: string;
  /** e.g. vehicle registration, guide ID */
  reference?: string;
  notes?: string;
}

export interface SpecialRequest {
  id: string;
  category:
    | "dietary"
    | "accessibility"
    | "accommodation"
    | "transport"
    | "other";
  description: string;
  resolved: boolean;
}

export interface GuestGroup {
  id: string;
  groupName: string;
  /** Number of adult travellers */
  adultCount: number;
  /** Number of child travellers */
  childCount: number;
  nationality: string;
  language: string;
  contactPerson?: string;
  notes?: string;
}

// ─── Primary Tour entity ─────────────────────────────────────────────────────

export interface Tour {
  id: string;
  /** Human-readable reference shown in all UIs */
  bookingReference: string;
  status: TourStatus;
  group: GuestGroup;
  /** Primary destination or route label */
  destination: string;
  /** ISO date string YYYY-MM-DD */
  arrivalDate: string;
  /** ISO date string YYYY-MM-DD */
  departureDate: string;
  flights: FlightLeg[];
  hotels: HotelStay[];
  itinerary: ItineraryEntry[];
  assignments: ResourceAssignment[];
  specialRequests: SpecialRequest[];
  /** Free-text internal notes for operations staff */
  operationalNotes?: string;
  /** ISO datetime of last record update */
  lastUpdated: string;
}

// ─── Dashboard-derived types ──────────────────────────────────────────────────

export interface DashboardMetrics {
  arrivalsToday: number;
  departuresToday: number;
  activeToday: number;
  requireAttention: number;
}

export interface AttentionItem {
  tourId: string;
  bookingReference: string;
  groupName: string;
  reason: string;
}
