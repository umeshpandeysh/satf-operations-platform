/**
 * SATF Operations Platform — Shared Production Operations Logic
 *
 * Deterministic, pure business logic for tour validation, creation,
 * independent issue management, cancellation safety, conflict detection,
 * and session data merging.
 */

import type {
  Tour,
  OperationalIssue,
  AssignmentStatus,
  VehicleType,
  AssignmentConflict,
} from "./types";
import { APPROVED_VEHICLE_TYPES } from "./types";

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
    existingReferences.some(
      (existing) => existing.toLowerCase() === ref.toLowerCase()
    )
  ) {
    errors.bookingReference = `Booking reference '${ref}' is already in use by another tour.`;
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
    status: "upcoming",
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

  for (let i = 0; i < activeTours.length; i++) {
    for (let j = i + 1; j < activeTours.length; j++) {
      const tourA = activeTours[i];
      const tourB = activeTours[j];

      // Check if dates overlap
      const overlap =
        tourA.arrivalDate <= tourB.departureDate &&
        tourA.departureDate >= tourB.arrivalDate;

      if (!overlap) continue;

      // 1. Check Guide Conflict
      const guideA = tourA.assignments.find((a) => a.role === "guide" && a.status === "assigned" && a.name?.trim());
      const guideB = tourB.assignments.find((a) => a.role === "guide" && a.status === "assigned" && a.name?.trim());
      if (guideA && guideB && guideA.name!.trim().toLowerCase() === guideB.name!.trim().toLowerCase()) {
        conflicts.push({
          resourceType: "guide",
          resourceIdentifier: guideA.name!.trim(),
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
          conflictDescription: `Guide '${guideA.name}' is double-booked on overlapping dates (${tourA.bookingReference} & ${tourB.bookingReference}).`,
        });
      }

      // 2. Check Driver Conflict
      const driverA = tourA.assignments.find((a) => a.role === "driver" && a.status === "assigned" && a.name?.trim());
      const driverB = tourB.assignments.find((a) => a.role === "driver" && a.status === "assigned" && a.name?.trim());
      if (driverA && driverB && driverA.name!.trim().toLowerCase() === driverB.name!.trim().toLowerCase()) {
        conflicts.push({
          resourceType: "driver",
          resourceIdentifier: driverA.name!.trim(),
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
          conflictDescription: `Driver '${driverA.name}' is assigned to multiple overlapping tours (${tourA.bookingReference} & ${tourB.bookingReference}).`,
        });
      }

      // 3. Check Vehicle Plate Conflict
      const vehA = tourA.assignments.find((a) => a.role === "vehicle" && a.status === "assigned" && a.reference?.trim());
      const vehB = tourB.assignments.find((a) => a.role === "vehicle" && a.status === "assigned" && a.reference?.trim());
      if (vehA && vehB && vehA.reference!.trim().toLowerCase() === vehB.reference!.trim().toLowerCase()) {
        conflicts.push({
          resourceType: "vehicle",
          resourceIdentifier: vehA.reference!.trim(),
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
          conflictDescription: `Vehicle plate '${vehA.reference}' is allocated to overlapping tours (${tourA.bookingReference} & ${tourB.bookingReference}).`,
        });
      }
    }
  }

  return conflicts;
}

/**
 * Merges newly parsed/imported tour data from an Excel workbook with an existing tour record,
 * preserving all coordinator-managed fields (guide/driver/vehicle assignments, hotel confirmation
 * numbers, operational notes, issues, and manual cancellation states).
 */
export function mergeCoordinatorFields(incoming: Tour, existing: Tour): Tour {
  const isExistingCancelled = existing.status === "cancelled";

  // 1. Merge assignments: preserve coordinator-assigned guide, driver, and vehicle
  const mergedAssignments = incoming.assignments.map((incAssign) => {
    const existAssign = existing.assignments.find((a) => a.role === incAssign.role);
    if (!existAssign) return incAssign;

    // If coordinator manually made an assignment or notes, preserve them
    if (existAssign.status === "assigned" || existAssign.name || existAssign.reference || existAssign.notes) {
      return {
        ...incAssign,
        status: existAssign.status,
        name: existAssign.name || incAssign.name,
        reference: existAssign.reference || incAssign.reference,
        vehicleType: existAssign.vehicleType || incAssign.vehicleType,
        notes: existAssign.notes || incAssign.notes,
      };
    }
    return incAssign;
  });

  // 2. Merge hotels: preserve coordinator-entered confirmation numbers
  const mergedHotels = incoming.hotels.map((incHotel, idx) => {
    const existHotel =
      existing.hotels[idx] || existing.hotels.find((h) => h.hotelName === incHotel.hotelName);
    if (existHotel?.confirmationNumber) {
      return {
        ...incHotel,
        confirmationNumber: existHotel.confirmationNumber,
      };
    }
    return incHotel;
  });

  // 3. Merge issues: preserve coordinator issues and resolutions
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

  return {
    ...incoming,
    status: isExistingCancelled ? "cancelled" : incoming.status,
    cancellationReason: isExistingCancelled ? existing.cancellationReason : incoming.cancellationReason,
    cancelledAt: isExistingCancelled ? existing.cancelledAt : incoming.cancelledAt,
    assignments: mergedAssignments,
    hotels: mergedHotels,
    issues: mergedIssues,
    operationalNotes: existing.operationalNotes || incoming.operationalNotes,
    lastUpdated: existing.lastUpdated || incoming.lastUpdated,
  };
}
