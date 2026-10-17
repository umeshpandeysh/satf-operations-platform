import { getCanonicalTours, getCanonicalTourById } from "./canonical-store";
import { getMockTours, getTourById as getMockTourById } from "./mock-data";
import { getIndiaTodayISO } from "./utils";
import type { Tour } from "./types";

/**
 * Server-only dataset resolver.
 * Loads canonical operational tours from disk when imported and active,
 * or falls back to baseline mock tours for demo mode and unimported environments.
 */
export function getBaseTours(referenceDate: string = getIndiaTodayISO()): Tour[] {
  const canonical = getCanonicalTours();
  if (canonical && canonical.length > 0) {
    return canonical;
  }
  return getMockTours(referenceDate);
}

/**
 * Server-only tour resolver by ID or booking reference.
 * Checks canonical operational dataset first, then demo tours.
 */
export function getTourById(
  id: string,
  referenceDate: string = getIndiaTodayISO()
): Tour | undefined {
  const canonicalTour = getCanonicalTourById(id);
  if (canonicalTour) return canonicalTour;
  return getMockTourById(id, referenceDate);
}
