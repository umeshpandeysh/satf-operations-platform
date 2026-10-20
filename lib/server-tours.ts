import { getCanonicalTours, getCanonicalTourById } from "./canonical-store";
import { getMockTours, getTourById as getMockTourById } from "./mock-data";
import { getIndiaTodayISO } from "./utils";
import type { Tour } from "./types";
import {
  getDatabaseConfigStatus,
  getPersistentTours,
  getPersistentTourById,
} from "./operational-store";

/**
 * Server-only dataset resolver.
 * Loads canonical operational tours from disk when imported and active,
 * or falls back to baseline mock tours for demo mode and unimported environments.
 */
export function getBaseTours(referenceDate: string = getIndiaTodayISO()): Tour[] {
  const canonical = getCanonicalTours(referenceDate);
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
  const canonicalTour = getCanonicalTourById(id, referenceDate);
  if (canonicalTour) return canonicalTour;
  return getMockTourById(id, referenceDate);
}

/**
 * Server-only effective dataset resolver.
 * Merges authoritative persistent tours from Supabase with baseline tours,
 * ensuring changes survive page refreshes and are visible across all browser sessions.
 */
export async function getEffectiveServerTours(
  referenceDate: string = getIndiaTodayISO()
): Promise<Tour[]> {
  const config = getDatabaseConfigStatus();
  if (!config.configured) {
    return getBaseTours(referenceDate);
  }

  try {
    const dbRes = await getPersistentTours(referenceDate);
    if (dbRes.success && dbRes.data) {
      // Authoritative database: if 0 tours in satf_operational_tours, return []
      return dbRes.data;
    }
  } catch (err) {
    console.error("Failed to load persistent tours from database:", err);
  }

  return [];
}

/**
 * Server-only effective tour resolver by ID.
 * Queries Supabase first for the authoritative persistent tour.
 */
export async function getEffectiveServerTourById(
  id: string,
  referenceDate: string = getIndiaTodayISO()
): Promise<Tour | null> {
  const cleanId = id?.trim();
  if (!cleanId) return null;

  const config = getDatabaseConfigStatus();
  if (config.configured) {
    try {
      const dbRes = await getPersistentTourById(cleanId, referenceDate);
      if (dbRes.success) {
        return dbRes.data ?? null;
      }
    } catch (err) {
      console.error("Failed to load persistent tour from database:", err);
    }
    return null;
  }

  return getTourById(cleanId, referenceDate) ?? null;
}
