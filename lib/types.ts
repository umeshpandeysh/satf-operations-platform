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

export type VehicleType =
  | "Urbania"
  | "Innova"
  | "Tempo Traveller"
  | "Sedan"
  | "Gatiman/train"
  | "Other";

export const APPROVED_VEHICLE_TYPES: readonly VehicleType[] = [
  "Urbania",
  "Innova",
  "Tempo Traveller",
  "Sedan",
  "Gatiman/train",
  "Other",
] as const;

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

export type AssignmentRole = "guide" | "driver" | "vehicle" | "coordinator";

export interface ResourceAssignment {
  id: string;
  role: AssignmentRole;
  status: AssignmentStatus;
  name?: string;
  /** e.g. vehicle registration, guide ID */
  reference?: string;
  /** Contact phone number or direct line */
  contact?: string;
  /** Approved structured vehicle type */
  vehicleType?: VehicleType;
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

export interface OperationalIssue {
  id: string;
  category:
    | "vehicle"
    | "guide"
    | "hotel"
    | "flight"
    | "permit"
    | "special_request"
    | "other";
  description: string;
  resolved: boolean;
  resolutionNotes?: string;
  /** Prototype assumption: recorded resolution timestamp */
  resolvedAt?: string;
}

export interface TrainJourney {
  id: string;
  date: string;
  trainName: string;
  trainNumber?: string;
  fromStation?: string;
  toStation?: string;
  travelClass?: string;
  departureTime?: string;
  arrivalTime?: string;
  pnr?: string;
  rawText: string;
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
  /** Structured railway journeys extracted from itinerary cells without altering original text */
  trainJourneys?: TrainJourney[];
  /** Discrete operational issues tracking independent blockers */
  issues?: OperationalIssue[];
  /** Provenance reference to legacy Excel sheet & row where applicable */
  sourceProvenance?: string;
  sourceSheet?: string;
  sourceRow?: number;
  sourceSheets?: string[];
  /** Stable source record coordinate distinguishing repeated booking references */
  sourceRecordId?: string;
  rawArrivalSerial?: number | string;
  hasDateAmbiguity?: boolean;
  dateAmbiguityReason?: string;
  originalArrivalDate?: string;
  dateCorrectionReason?: string;
  /** Flag for suspected cancellation without mutating operational status */
  hasCancellationIndicator?: boolean;
  cancellationIndicatorReason?: string;
  agency?: string;
  packageCode?: string;
  isImported?: boolean;
  /** Free-text internal notes for operations staff */
  operationalNotes?: string;
  /** Explanatory cancellation reason if tour status is cancelled */
  cancellationReason?: string;
  /** ISO datetime of cancellation */
  cancelledAt?: string;
  /** ISO datetime of last record update */
  lastUpdated: string;
}

// ─── Import & Reconciliation Interfaces ──────────────────────────────────────

export interface SheetImportDetail {
  sheetName: string;
  season: string;
  rowsCount: number;
  toursCount: number;
}

export interface ExcludedSheetDetail {
  sheetName: string;
  reason: string;
  rowCount: number;
}

export interface CorrectedDateItem {
  bookingReference: string;
  sourceRecordId?: string;
  sheet: string;
  row: number;
  originalDate: string;
  correctedDate: string;
  rule: string;
  reason: string;
}

export interface PossibleCancellationItem {
  bookingReference: string;
  sourceRecordId?: string;
  sheet: string;
  row: number;
  guestMasked: string;
  reason: string;
  rawText: string;
}

export interface SeasonGroupSummary {
  season: string;
  tourCount: number;
  sheetsCount: number;
}

export interface ExistingComparisonItem {
  sourceRecordId: string;
  bookingReference: string;
  guestMasked: string;
  action: "insert" | "update" | "skip" | "conflict";
  reason: string;
  hasCoordinatorOverrides?: boolean;
}

export interface ExistingComparisonDetail {
  comparedAgainst: "none" | "persistent_database" | "canonical_store";
  wouldInsertCount: number;
  wouldUpdateCount: number;
  wouldSkipCount: number;
  flaggedConflictCount: number;
  details: ExistingComparisonItem[];
}

export interface ImportSummary {
  workbookName: string;
  importTimestamp: string;
  totalSheetsFound: number;
  operationalSheetsCount: number;
  totalTourBlocks: number;
  canonicalToursCount: number;
  spanningToursCount: number;
  amendedToursCount: number;
  duplicateRowsCount: number;
  dateAmbiguityCount: number;
  unassignedGuidesCount: number;
  sheetsSummary: SheetImportDetail[];
  excludedSheetsCount?: number;
  excludedSheets?: ExcludedSheetDetail[];
  correctedDatesCount?: number;
  possibleCancellationsCount?: number;
  preservedDistinctCount?: number;
  seasons?: SeasonGroupSummary[];
  existingComparison?: ExistingComparisonDetail;
}

export interface ImportAmbiguityItem {
  bookingReference: string;
  sourceRecordId?: string;
  sheet: string;
  row: number;
  reason: string;
  rawSerial?: number | string;
  guestMasked?: string;
}

export type DateAmbiguity = ImportAmbiguityItem;

export interface CoordinatorDateDecision {
  bookingReference: string;
  sourceRecordId?: string;
  decision: "confirm_inferred" | "override";
  confirmedArrivalDate: string; // YYYY-MM-DD
  notes?: string;
  approvalSource?: "manual_coordinator" | "batch_confirmed" | "simulated";
  approvedBy?: string;
  approvedAt?: string;
}

export interface ImportDuplicateItem {
  bookingReference: string;
  sheets: string[];
  rows: number[];
  resolution: "merged_spanning" | "amended" | "skipped_duplicate" | "preserved_distinct";
  guestMasked?: string;
  reason?: string;
}

export interface ImportErrorItem {
  sheet: string;
  row: number;
  message: string;
}

export interface ImportPreviewResult {
  success: boolean;
  summary: ImportSummary;
  tours: Tour[];
  ambiguities: ImportAmbiguityItem[];
  duplicates: ImportDuplicateItem[];
  errors: ImportErrorItem[];
  excludedSheets?: ExcludedSheetDetail[];
  correctedDates?: CorrectedDateItem[];
  possibleCancellations?: PossibleCancellationItem[];
  existingComparison?: ExistingComparisonDetail;
}


// ─── Resource Conflict Detection ─────────────────────────────────────────────

export interface AssignmentConflict {
  resourceType: "guide" | "driver" | "vehicle";
  resourceIdentifier: string;
  tourA: { id: string; bookingReference: string; groupName: string; arrivalDate: string; departureDate: string };
  tourB: { id: string; bookingReference: string; groupName: string; arrivalDate: string; departureDate: string };
  conflictDescription: string;
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
