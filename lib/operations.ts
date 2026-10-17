/**
 * SATF Operations Platform — Shared Production Operations Logic
 *
 * This module contains deterministic, pure business logic for tour validation,
 * independent issue management, cancellation safety, and session data merging.
 * These functions are directly used in UI components and tested in the test suite.
 */

import type { Tour, OperationalIssue, AssignmentStatus, VehicleType } from "./types";
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

/**
 * Validates tour operational edit form values according to business rules.
 *
 * Rules:
 * 1. Guide Name is mandatory when guideStatus is 'assigned'.
 * 2. Every issue marked 'resolved === true' MUST have non-empty resolutionNotes.
 * 3. Driver phone/notes, vehicle plate, and hotel voucher remain optional.
 * 4. Vehicle type (if specified) must belong to approved categories.
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
  // Return the saved tour reference or a clean clone
  return { ...savedTour };
}

/**
 * Pure function to merge session-stored modifications over a baseline tour array.
 */
export function mergeSessionTours(
  baselineTours: Tour[],
  sessionTours: Record<string, Tour> | null | undefined
): Tour[] {
  if (!sessionTours || Object.keys(sessionTours).length === 0) {
    return baselineTours;
  }
  return baselineTours.map((tour) => sessionTours[tour.id] ?? tour);
}
