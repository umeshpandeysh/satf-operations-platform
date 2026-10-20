/**
 * SATF Operations Platform — Shared Production Operations Logic
 *
 * Deterministic, pure business logic for tour validation, creation,
 * independent issue management, cancellation safety, conflict detection,
 * and session data merging.
 */

import type {
  Tour,
  TourStatus,
  OperationalIssue,
  AssignmentStatus,
  VehicleType,
  AssignmentConflict,
  ResourceAssignment,
  ExistingComparisonDetail,
  ExistingComparisonItem,
} from "./types";
import { APPROVED_VEHICLE_TYPES } from "./types";
import { getIndiaTodayISO } from "./utils";

/**
 * Shared production lifecycle status calculator.
 *
 * Deterministically computes the operational tour status relative to the current
 * reference date in Asia/Kolkata (defaults to getIndiaTodayISO()):
 * 1. Preserves genuine cancellations unconditionally (status === "cancelled" or cancelledAt timestamp).
 * 2. Historical tours whose departure date is in the past (< referenceDate) => "completed".
 * 3. Active tours running today (arrivalDate <= referenceDate && departureDate >= referenceDate) => "active" (preserves "attention" if flagged).
 * 4. Upcoming tours (arrivalDate > referenceDate) => "upcoming" (preserves "attention" if flagged).
 * 5. Handles edge cases: missing dates, inverted dates, leap years, timezone boundaries.
 */
export function computeTourLifecycleStatus(
  tour: {
    status?: TourStatus | string | null;
    arrivalDate?: string | null;
    departureDate?: string | null;
    cancelledAt?: string | null;
    hasCancellationIndicator?: boolean | null;
  },
  referenceDate: string = getIndiaTodayISO()
): TourStatus {
  // 1. Preserve cancellations unconditionally regardless of date
  if (tour.status === "cancelled" || Boolean(tour.cancelledAt)) {
    return "cancelled";
  }

  const arrival = (tour.arrivalDate || "").trim();
  const departure = (tour.departureDate || "").trim();

  // If no date at all, fallback to existing valid status or upcoming
  if (!arrival && !departure) {
    if (tour.status === "attention" || tour.status === "completed" || tour.status === "active") {
      return tour.status as TourStatus;
    }
    return "upcoming";
  }

  const effArrival = arrival || departure;
  const effDeparture = departure || arrival;

  // Handle possible inverted dates safely
  const start = effArrival <= effDeparture ? effArrival : effDeparture;
  const end = effArrival <= effDeparture ? effDeparture : effArrival;

  // Historical tour: departure date has passed
  if (end < referenceDate) {
    return "completed";
  }

  // Active tour: current day falls within tour dates
  if (start <= referenceDate && end >= referenceDate) {
    if (tour.status === "attention") return "attention";
    return "active";
  }

  // Upcoming tour: start date is strictly in the future
  if (start > referenceDate) {
    if (tour.status === "attention") return "attention";
    return "upcoming";
  }

  return "upcoming";
}

/**
 * Mask traveller surname/given name to preserve operational privacy in preview & error logs.
 */
export function maskGuestName(name?: string): string {
  if (!name || !name.trim()) return "Valued Guest";
  const str = name.trim();
  const paxMatch = str.match(/\(?\s*(?:(?:[X*]|PAX\s*|\bx\s*)(\d{1,3})(?:\s*PAX)?|(\d{1,3})\s*PAX)\s*\)?/i);
  let paxStr = "";
  let cleaned = str;
  if (paxMatch) {
    paxStr = ` (${paxMatch[0].replace(/[()]/g, "").trim()})`;
    cleaned = str.replace(paxMatch[0], "").trim();
  }
  const parts = cleaned.split(/\s+/).filter(Boolean);
  const maskedParts = parts.map((p) => {
    if (p.length <= 2) return p;
    return `${p[0]}${"*".repeat(Math.min(p.length - 1, 4))}`;
  });
  return `${maskedParts.join(" ")}${paxStr}`.trim();
}

export interface TourFormValidationInput {
  guideStatus: AssignmentStatus;
  guideName: string;
  driverName?: string;
  driverNotes?: string;
  vehicleStatus: AssignmentStatus;
  vehicleRef?: string;
  vehicleType?: string;
  hotelConfirmation?: string;
  issues: OperationalIssue[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

export interface NewTourInput {
  bookingReference: string;
  groupName: string;
  adultCount: number;
  childCount?: number;
  nationality: string;
  language: string;
  destination: string;
  arrivalDate: string;
  departureDate: string;
  contactPerson?: string;
  guideName?: string;
  vehicleType?: string;
  driverName?: string;
  notes?: string;
  /** Set to true when intentionally registering a distinct tour sharing an existing booking reference */
  allowDuplicateReference?: boolean;
  sourceRecordId?: string;
}

/**
 * Validates tour operational edit form values according to business rules.
 */
export function validateTourForm(input: TourFormValidationInput): ValidationResult {
  const errors: Record<string, string> = {};

  // Guide validation
  if (input.guideStatus === "assigned" && !input.guideName.trim()) {
    errors.guideName = "Guide name is required when guide status is marked as 'Assigned'.";
  }

  // Vehicle type validation (if provided)
  if (
    input.vehicleType &&
    !APPROVED_VEHICLE_TYPES.includes(input.vehicleType as VehicleType)
  ) {
    errors.vehicleType = `Vehicle type must be one of: ${APPROVED_VEHICLE_TYPES.join(", ")}`;
  }

  // Issue resolution validation: explanatory notes are mandatory for every resolved issue
  for (const issue of input.issues) {
    if (issue.resolved && (!issue.resolutionNotes || !issue.resolutionNotes.trim())) {
      errors[`issue_${issue.id}_notes`] =
        "Explanatory resolution note is required before marking this issue resolved.";
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validate input for creating a new operational tour record.
 */
export function validateNewTourForm(
  input: NewTourInput,
  existingReferences: string[] = []
): ValidationResult {
  const errors: Record<string, string> = {};

  // Booking Reference
  const ref = input.bookingReference ? input.bookingReference.trim() : "";
  if (!ref) {
    errors.bookingReference = "Booking reference is required (e.g. SATF-2026-007).";
  } else if (!/^[A-Za-z0-9_-]{4,24}$/.test(ref)) {
    errors.bookingReference = "Reference must be 4–24 characters (letters, numbers, hyphens, underscores).";
  } else if (
    !input.allowDuplicateReference &&
    existingReferences.some(
      (existing) => existing.toLowerCase() === ref.toLowerCase()
    )
  ) {
    errors.bookingReference = `Booking reference '${ref}' is already in use by another tour. Enable 'allowDuplicateReference' if this is an intentional distinct tour.`;
  }

  // Group Name
  if (!input.groupName || !input.groupName.trim()) {
    errors.groupName = "Guest group name is required (e.g. Tanaka Family / Tokyo Photo Club).";
  }

  // Travellers
  if (!Number.isInteger(input.adultCount) || input.adultCount < 1) {
    errors.adultCount = "Adult travellers count must be an integer of at least 1.";
  }
  if (input.childCount !== undefined && (input.childCount < 0 || !Number.isInteger(input.childCount))) {
    errors.childCount = "Child count must be a non-negative integer.";
  }

  // Nationality & Language
  if (!input.nationality || !input.nationality.trim()) {
    errors.nationality = "Traveller nationality is required.";
  }
  if (!input.language || !input.language.trim()) {
    errors.language = "Primary group language is required.";
  }

  // Destination Circuit
  if (!input.destination || !input.destination.trim()) {
    errors.destination = "Destination circuit or route is required.";
  }

  // Dates
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!input.arrivalDate || !isoDateRegex.test(input.arrivalDate)) {
    errors.arrivalDate = "Valid arrival date in YYYY-MM-DD format is required.";
  }
  if (!input.departureDate || !isoDateRegex.test(input.departureDate)) {
    errors.departureDate = "Valid departure date in YYYY-MM-DD format is required.";
  }

  if (
    input.arrivalDate &&
    input.departureDate &&
    isoDateRegex.test(input.arrivalDate) &&
    isoDateRegex.test(input.departureDate) &&
    input.departureDate < input.arrivalDate
  ) {
    errors.departureDate = "Departure date cannot be earlier than arrival date.";
  }

  // Vehicle type (if specified)
  if (
    input.vehicleType &&
    input.vehicleType.trim() &&
    !APPROVED_VEHICLE_TYPES.includes(input.vehicleType as VehicleType)
  ) {
    errors.vehicleType = `Vehicle type must be one of: ${APPROVED_VEHICLE_TYPES.join(", ")}`;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Construct a complete, typed Tour object from validated new-tour form input.
 */
export function createNewTour(input: NewTourInput): Tour {
  const now = new Date().toISOString();
  const id = `tour-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const ref = input.bookingReference.trim().toUpperCase();

  return {
    id,
    bookingReference: ref,
    sourceRecordId: input.sourceRecordId || undefined,
    status: computeTourLifecycleStatus({
      status: "upcoming",
      arrivalDate: input.arrivalDate,
      departureDate: input.departureDate,
    }),
    destination: input.destination.trim(),
    arrivalDate: input.arrivalDate,
    departureDate: input.departureDate,
    lastUpdated: now,
    group: {
      id: `grp-${id}`,
      groupName: input.groupName.trim(),
      adultCount: input.adultCount,
      childCount: input.childCount ?? 0,
      nationality: input.nationality.trim(),
      language: input.language.trim(),
      contactPerson: input.contactPerson?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
    },
    flights: [
      {
        id: `flt-${id}-arr`,
        direction: "arrival",
        flightNumber: "TBD",
        airline: "Scheduled Arrival",
        date: input.arrivalDate,
        departureTime: "12:00",
        arrivalTime: "14:00",
        origin: "Origin Airport",
        destination: "Destination Airport",
      },
      {
        id: `flt-${id}-dep`,
        direction: "departure",
        flightNumber: "TBD",
        airline: "Scheduled Departure",
        date: input.departureDate,
        departureTime: "10:00",
        arrivalTime: "12:00",
        origin: "Destination Airport",
        destination: "Return Airport",
      },
    ],
    hotels: [
      {
        id: `htl-${id}-1`,
        hotelName: "Lodging To Be Confirmed",
        city: input.destination.split(" ")[0] || "Circuit Hub",
        checkIn: input.arrivalDate,
        checkOut: input.departureDate,
        roomType: "double",
        roomCount: Math.ceil(input.adultCount / 2),
      },
    ],
    itinerary: [
      {
        id: `itn-${id}-01`,
        date: input.arrivalDate,
        startTime: "14:30",
        type: "arrival_transfer",
        title: "Airport greeting and transfer to hotel",
        location: input.destination,
        description: "Staff greeting upon flight arrival, assistance with luggage and hotel check-in.",
      },
      {
        id: `itn-${id}-02`,
        date: input.departureDate,
        startTime: "09:00",
        type: "departure_transfer",
        title: "Hotel checkout and departure transfer",
        location: input.destination,
        description: "Transfer to airport terminal with departure flight assistance.",
      },
    ],
    assignments: [
      {
        id: `asg-${id}-guide`,
        role: "guide",
        status: input.guideName?.trim() ? "assigned" : "unassigned",
        name: input.guideName?.trim() || undefined,
      },
      {
        id: `asg-${id}-driver`,
        role: "driver",
        status: input.driverName?.trim() ? "assigned" : "unassigned",
        name: input.driverName?.trim() || undefined,
      },
      {
        id: `asg-${id}-vehicle`,
        role: "vehicle",
        status: input.vehicleType ? "assigned" : "unassigned",
        vehicleType: (input.vehicleType as VehicleType) || undefined,
      },
    ],
    specialRequests: [],
    issues: [],
    operationalNotes: input.notes?.trim() || "New operational booking record created in local session.",
    sourceProvenance: "Locally created operations record (Session storage)",
  };
}

/**
 * Safely cancels a tour with mandatory cancellation reason.
 */
export function cancelTour(
  tour: Tour,
  reason: string
): { success: boolean; tour?: Tour; error?: string } {
  if (!reason || !reason.trim() || reason.trim().length < 5) {
    return {
      success: false,
      error: "A clear operational cancellation reason is required (at least 5 characters).",
    };
  }

  if (tour.status === "cancelled") {
    return {
      success: false,
      error: "This tour record is already cancelled.",
    };
  }

  const trimmedReason = reason.trim();
  const now = new Date().toISOString();
  const existingNotes = tour.operationalNotes ? `${tour.operationalNotes}\n\n` : "";

  const updated: Tour = {
    ...tour,
    status: "cancelled",
    cancellationReason: trimmedReason,
    cancelledAt: now,
    operationalNotes: `${existingNotes}[CANCELLED ${now.slice(0, 10)}]: ${trimmedReason}`,
    lastUpdated: now,
  };

  return {
    success: true,
    tour: updated,
  };
}

/**
 * Update a specific issue by ID, preserving independence of all other issues.
 */
export function applyIssueUpdate(
  issues: OperationalIssue[],
  targetIssueId: string,
  updates: Partial<OperationalIssue>
): OperationalIssue[] {
  return issues.map((issue) => {
    if (issue.id !== targetIssueId) {
      return issue;
    }
    return {
      ...issue,
      ...updates,
      ...(updates.resolved === true && !issue.resolved
        ? { resolvedAt: new Date().toISOString() }
        : {}),
      ...(updates.resolved === false ? { resolvedAt: undefined } : {}),
    };
  });
}

/**
 * Discard draft modifications and return the authoritative saved tour unchanged.
 */
export function cancelTourEdit(savedTour: Tour): Tour {
  return { ...savedTour };
}

/**
 * Pure function to merge session-stored modifications over a baseline tour array.
 * Includes both modified baseline tours and newly created session tours.
 */
export function mergeSessionTours(
  baselineTours: Tour[],
  sessionTours: Record<string, Tour> | null | undefined
): Tour[] {
  if (!sessionTours || Object.keys(sessionTours).length === 0) {
    return baselineTours;
  }

  const baselineIds = new Set(baselineTours.map((t) => t.id));
  const merged = baselineTours.map((tour) => sessionTours[tour.id] ?? tour);

  // Append newly created tours that do not exist in baseline
  for (const [id, sessionTour] of Object.entries(sessionTours)) {
    if (!baselineIds.has(id)) {
      merged.push(sessionTour);
    }
  }

  return merged;
}

/**
 * Detect assignment conflicts across active and upcoming tours.
 * Flags overlapping schedules for the same assigned guide, driver, or vehicle.
 */
export function detectAssignmentConflicts(tours: Tour[]): AssignmentConflict[] {
  const conflicts: AssignmentConflict[] = [];

  // Exclude cancelled and completed tours from active conflict detection
  const activeTours = tours.filter(
    (t) => t.status !== "cancelled" && t.status !== "completed"
  );

  // Group tours by resource to avoid O(N^2) comparisons across thousands of tours
  const guideMap = new Map<string, Tour[]>();
  const driverMap = new Map<string, Tour[]>();
  const vehicleMap = new Map<string, Tour[]>();

  for (const tour of activeTours) {
    for (const a of tour.assignments) {
      if (a.status !== "assigned") continue;
      if (a.role === "guide" && a.name?.trim()) {
        const key = a.name.trim().toLowerCase();
        let list = guideMap.get(key);
        if (!list) {
          list = [];
          guideMap.set(key, list);
        }
        list.push(tour);
      } else if (a.role === "driver" && a.name?.trim()) {
        const key = a.name.trim().toLowerCase();
        let list = driverMap.get(key);
        if (!list) {
          list = [];
          driverMap.set(key, list);
        }
        list.push(tour);
      } else if (a.role === "vehicle" && a.reference?.trim()) {
        const key = a.reference.trim().toLowerCase();
        let list = vehicleMap.get(key);
        if (!list) {
          list = [];
          vehicleMap.set(key, list);
        }
        list.push(tour);
      }
    }
  }

  // 1. Check Guide Conflicts
  for (const [, tourList] of guideMap) {
    if (tourList.length < 2) continue;
    for (let i = 0; i < tourList.length; i++) {
      for (let j = i + 1; j < tourList.length; j++) {
        const tourA = tourList[i];
        const tourB = tourList[j];
        if (tourA.arrivalDate <= tourB.departureDate && tourA.departureDate >= tourB.arrivalDate) {
          const guideA = tourA.assignments.find((a) => a.role === "guide" && a.status === "assigned" && a.name?.trim());
          conflicts.push({
            resourceType: "guide",
            resourceIdentifier: guideA?.name?.trim() || "",
            tourA: {
              id: tourA.id,
              bookingReference: tourA.bookingReference,
              groupName: tourA.group.groupName,
              arrivalDate: tourA.arrivalDate,
              departureDate: tourA.departureDate,
            },
            tourB: {
              id: tourB.id,
              bookingReference: tourB.bookingReference,
              groupName: tourB.group.groupName,
              arrivalDate: tourB.arrivalDate,
              departureDate: tourB.departureDate,
            },
            conflictDescription: `Guide '${guideA?.name}' is double-booked on overlapping dates (${tourA.bookingReference} & ${tourB.bookingReference}).`,
          });
        }
      }
    }
  }

  // 2. Check Driver Conflicts
  for (const [, tourList] of driverMap) {
    if (tourList.length < 2) continue;
    for (let i = 0; i < tourList.length; i++) {
      for (let j = i + 1; j < tourList.length; j++) {
        const tourA = tourList[i];
        const tourB = tourList[j];
        if (tourA.arrivalDate <= tourB.departureDate && tourA.departureDate >= tourB.arrivalDate) {
          const driverA = tourA.assignments.find((a) => a.role === "driver" && a.status === "assigned" && a.name?.trim());
          conflicts.push({
            resourceType: "driver",
            resourceIdentifier: driverA?.name?.trim() || "",
            tourA: {
              id: tourA.id,
              bookingReference: tourA.bookingReference,
              groupName: tourA.group.groupName,
              arrivalDate: tourA.arrivalDate,
              departureDate: tourA.departureDate,
            },
            tourB: {
              id: tourB.id,
              bookingReference: tourB.bookingReference,
              groupName: tourB.group.groupName,
              arrivalDate: tourB.arrivalDate,
              departureDate: tourB.departureDate,
            },
            conflictDescription: `Driver '${driverA?.name}' is assigned to multiple overlapping tours (${tourA.bookingReference} & ${tourB.bookingReference}).`,
          });
        }
      }
    }
  }

  // 3. Check Vehicle Conflicts
  for (const [, tourList] of vehicleMap) {
    if (tourList.length < 2) continue;
    for (let i = 0; i < tourList.length; i++) {
      for (let j = i + 1; j < tourList.length; j++) {
        const tourA = tourList[i];
        const tourB = tourList[j];
        if (tourA.arrivalDate <= tourB.departureDate && tourA.departureDate >= tourB.arrivalDate) {
          const vehA = tourA.assignments.find((a) => a.role === "vehicle" && a.status === "assigned" && a.reference?.trim());
          conflicts.push({
            resourceType: "vehicle",
            resourceIdentifier: vehA?.reference?.trim() || "",
            tourA: {
              id: tourA.id,
              bookingReference: tourA.bookingReference,
              groupName: tourA.group.groupName,
              arrivalDate: tourA.arrivalDate,
              departureDate: tourA.departureDate,
            },
            tourB: {
              id: tourB.id,
              bookingReference: tourB.bookingReference,
              groupName: tourB.group.groupName,
              arrivalDate: tourB.arrivalDate,
              departureDate: tourB.departureDate,
            },
            conflictDescription: `Vehicle plate '${vehA?.reference}' is allocated to overlapping tours (${tourA.bookingReference} & ${tourB.bookingReference}).`,
          });
        }
      }
    }
  }

  return conflicts;
}

/**
 * Merges newly parsed/imported tour data from an Excel workbook with an existing tour record,
 * strictly preserving all coordinator-managed fields:
 * - Guide, driver, and vehicle assignments (including driver name, phone/contact, vehicle registration, notes).
 * - Extra assignments created in the platform not present in the Excel source (e.g. driver role).
 * - Hotel confirmation numbers, notes, and room details.
 * - Extra hotel bookings added by the coordinator.
 * - Operational issues and their resolutions.
 * - Coordinator notes and manual cancellation states.
 * - Resolved statuses of special requests.
 */
export function mergeCoordinatorFields(incoming: Tour, existing: Tour): Tour {
  const isExistingCancelled = existing.status === "cancelled";

  // 1. Merge assignments: preserve coordinator-assigned guide, driver, and vehicle
  const existingByRole = new Map<string, ResourceAssignment>();
  for (const a of existing.assignments || []) {
    existingByRole.set(a.role, a);
  }

  const mergedAssignments: ResourceAssignment[] = [];
  const processedRoles = new Set<string>();

  for (const incAssign of incoming.assignments || []) {
    processedRoles.add(incAssign.role);
    const existAssign = existingByRole.get(incAssign.role);
    if (!existAssign) {
      mergedAssignments.push(incAssign);
      continue;
    }

    // If coordinator manually made an assignment or notes, preserve them
    if (
      existAssign.status === "assigned" ||
      existAssign.name ||
      existAssign.reference ||
      existAssign.contact ||
      existAssign.notes
    ) {
      mergedAssignments.push({
        ...incAssign,
        id: existAssign.id || incAssign.id,
        status: existAssign.status,
        name: existAssign.name || incAssign.name,
        reference: existAssign.reference || incAssign.reference,
        contact: existAssign.contact || incAssign.contact,
        vehicleType: existAssign.vehicleType || incAssign.vehicleType,
        notes: existAssign.notes || incAssign.notes,
      });
    } else {
      mergedAssignments.push(incAssign);
    }
  }

  // Preserve coordinator-managed assignments absent in incoming Excel (e.g. driver role)
  for (const [role, existAssign] of existingByRole.entries()) {
    if (!processedRoles.has(role)) {
      mergedAssignments.push(existAssign);
    }
  }

  // 2. Merge hotels: preserve coordinator-entered confirmation numbers and notes
  const existingHotels = existing.hotels || [];
  const mergedHotels = (incoming.hotels || []).map((incHotel) => {
    const existHotel =
      existingHotels.find(
        (h) => h.hotelName.trim().toLowerCase() === incHotel.hotelName.trim().toLowerCase()
      ) ||
      existingHotels.find(
        (h) =>
          h.city.trim().toLowerCase() === incHotel.city.trim().toLowerCase() &&
          h.checkIn === incHotel.checkIn
      );

    if (existHotel) {
      return {
        ...incHotel,
        confirmationNumber: existHotel.confirmationNumber || incHotel.confirmationNumber,
        notes: existHotel.notes || incHotel.notes,
        roomType: existHotel.roomType || incHotel.roomType,
        roomCount: existHotel.roomCount || incHotel.roomCount,
      };
    }
    return incHotel;
  });

  // Preserve coordinator-added extra hotels not in incoming Excel
  for (const existHotel of existingHotels) {
    const alreadyPresent = mergedHotels.some(
      (h) =>
        h.hotelName.trim().toLowerCase() === existHotel.hotelName.trim().toLowerCase() &&
        h.checkIn === existHotel.checkIn
    );
    if (!alreadyPresent && existHotel.confirmationNumber) {
      mergedHotels.push(existHotel);
    }
  }

  // 3. Merge special requests: preserve resolved state
  const existingRequests = existing.specialRequests || [];
  const mergedSpecialRequests = (incoming.specialRequests || []).map((incReq) => {
    const existReq = existingRequests.find(
      (r) => r.id === incReq.id || r.description.trim() === incReq.description.trim()
    );
    if (existReq) {
      return {
        ...incReq,
        resolved: existReq.resolved,
      };
    }
    return incReq;
  });
  for (const existReq of existingRequests) {
    if (
      !mergedSpecialRequests.some(
        (r) => r.id === existReq.id || r.description.trim() === existReq.description.trim()
      )
    ) {
      mergedSpecialRequests.push(existReq);
    }
  }

  // 4. Merge issues: preserve coordinator issues and resolutions completely
  const existingIssues = existing.issues || [];
  const mergedIssues = [...(incoming.issues || [])];
  for (const exIssue of existingIssues) {
    const matchIdx = mergedIssues.findIndex((i) => i.id === exIssue.id);
    if (matchIdx >= 0) {
      mergedIssues[matchIdx] = exIssue;
    } else {
      mergedIssues.push(exIssue);
    }
  }

  // 5. Operational notes: preserve coordinator notes without erasing
  let finalNotes = incoming.operationalNotes;
  if (existing.operationalNotes) {
    finalNotes = existing.operationalNotes;
  }

  return {
    ...existing,
    ...incoming,
    sourceRecordId: incoming.sourceRecordId || existing.sourceRecordId,
    sourceSheet: incoming.sourceSheet || existing.sourceSheet,
    sourceRow: incoming.sourceRow ?? existing.sourceRow,
    sourceSheets: incoming.sourceSheets || existing.sourceSheets,
    trainJourneys: (incoming.trainJourneys && incoming.trainJourneys.length > 0) ? incoming.trainJourneys : existing.trainJourneys,
    originalArrivalDate: incoming.originalArrivalDate || existing.originalArrivalDate,
    dateCorrectionReason: incoming.dateCorrectionReason || existing.dateCorrectionReason,
    hasCancellationIndicator: incoming.hasCancellationIndicator ?? existing.hasCancellationIndicator,
    cancellationIndicatorReason: incoming.cancellationIndicatorReason || existing.cancellationIndicatorReason,
    status: isExistingCancelled ? "cancelled" : incoming.status,
    cancellationReason: isExistingCancelled ? existing.cancellationReason : incoming.cancellationReason,
    cancelledAt: isExistingCancelled ? existing.cancelledAt : incoming.cancelledAt,
    assignments: mergedAssignments,
    hotels: mergedHotels,
    specialRequests: mergedSpecialRequests,
    issues: mergedIssues,
    operationalNotes: finalNotes,
    lastUpdated: existing.lastUpdated || incoming.lastUpdated,
  };
}

/**
 * Compare incoming parsed tours against existing operational records for import preview.
 * Pure function: performs zero database mutations.
 */
export function compareIncomingWithExisting(
  incomingTours: Tour[],
  existingTours: Tour[],
  comparedAgainst: "none" | "persistent_database" | "canonical_store" = "none"
): ExistingComparisonDetail {
  const existingById = new Map<string, Tour>();
  const existingBySource = new Map<string, Tour>();
  const existingByRef = new Map<string, Tour[]>();

  for (const t of existingTours) {
    existingById.set(t.id.toLowerCase().trim(), t);
    if (t.sourceRecordId) {
      existingBySource.set(t.sourceRecordId.toLowerCase().trim(), t);
    }
    const ref = t.bookingReference.trim();
    if (!existingByRef.has(ref)) {
      existingByRef.set(ref, []);
    }
    existingByRef.get(ref)!.push(t);
  }

  let wouldInsertCount = 0;
  let wouldUpdateCount = 0;
  let wouldSkipCount = 0;
  let flaggedConflictCount = 0;
  const details: ExistingComparisonItem[] = [];

  for (const inc of incomingTours) {
    const ref = inc.bookingReference.trim();
    const sourceRecordId = inc.sourceRecordId || `${inc.sourceSheet || "SOURCE"}:R${inc.sourceRow || 0}:${ref}`;
    const guestMasked = maskGuestName(inc.group.groupName);

    // 1. Exact primary tour ID match
    let exist: Tour | undefined = existingById.get(inc.id.toLowerCase().trim());

    // 2. Exact source record ID match
    if (!exist && inc.sourceRecordId) {
      exist = existingBySource.get(inc.sourceRecordId.toLowerCase().trim());
    }

    // 3. Fallback to booking reference lookup
    const matches = existingByRef.get(ref) || [];
    if (!exist) {
      if (matches.length === 0) {
        wouldInsertCount++;
        details.push({
          sourceRecordId,
          bookingReference: ref,
          guestMasked,
          action: "insert",
          reason: "New tour record; not present in operational dataset.",
        });
        continue;
      }

      if (matches.length === 1) {
        exist = matches[0];
      } else {
        // Genuine ambiguous conflict: multiple records share bookingReference with no ID/source match
        flaggedConflictCount++;
        details.push({
          sourceRecordId,
          bookingReference: ref,
          guestMasked,
          action: "conflict",
          reason: `Multiple existing operational tours (${matches.length}) share booking reference ${ref} without exact ID match. Requires coordinator review before update.`,
        });
        continue;
      }
    }
    // Check if coordinator has overrides
    const hasDriverOverride = exist.assignments?.some((a) => a.role === "driver" && a.name);
    const hasHotelOverride = exist.hotels?.some((h) => Boolean(h.confirmationNumber));
    const hasNotesOverride = Boolean(exist.operationalNotes && exist.operationalNotes !== inc.operationalNotes);
    const hasIssues = (exist.issues?.length || 0) > 0;
    const isCancelled = exist.status === "cancelled";
    const hasCoordinatorOverrides = Boolean(
      hasDriverOverride || hasHotelOverride || hasNotesOverride || hasIssues || isCancelled
    );

    // Check if essentially identical
    const isIdentical =
      exist.arrivalDate === inc.arrivalDate &&
      exist.departureDate === inc.departureDate &&
      exist.group.adultCount === inc.group.adultCount &&
      !hasNotesOverride &&
      exist.hotels.length === inc.hotels.length;

    if (isIdentical && !hasCoordinatorOverrides) {
      wouldSkipCount++;
      details.push({
        sourceRecordId,
        bookingReference: ref,
        guestMasked,
        action: "skip",
        reason: "Identical to current operational record with no incoming changes.",
        hasCoordinatorOverrides: false,
      });
    } else {
      wouldUpdateCount++;
      const reasons: string[] = [];
      if (hasCoordinatorOverrides) reasons.push("Preserves coordinator assignments/notes");
      if (exist.arrivalDate !== inc.arrivalDate) reasons.push("Updates arrival date");
      if (exist.departureDate !== inc.departureDate) reasons.push("Updates departure date");
      if (exist.hotels.length !== inc.hotels.length) reasons.push("Updates hotel stays");

      details.push({
        sourceRecordId,
        bookingReference: ref,
        guestMasked,
        action: "update",
        reason: reasons.length > 0 ? reasons.join("; ") : "Itinerary or detail updates",
        hasCoordinatorOverrides,
      });
    }
  }

  return {
    comparedAgainst,
    wouldInsertCount,
    wouldUpdateCount,
    wouldSkipCount,
    flaggedConflictCount,
    details,
  };
}
