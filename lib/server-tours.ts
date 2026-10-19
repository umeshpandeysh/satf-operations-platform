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

/**
 * Server-only effective dataset resolver.
 * Merges authoritative persistent tours from Supabase with baseline tours,
 * ensuring changes survive page refreshes and are visible across all browser sessions.
 */
export async function getEffectiveServerTours(
  referenceDate: string = getIndiaTodayISO()
): Promise<Tour[]> {
  const baseTours = getBaseTours(referenceDate);
  const config = getDatabaseConfigStatus();
  if (!config.configured) {
    return baseTours;
  }

  try {
    const dbRes = await getPersistentTours();
    if (dbRes.success && dbRes.data) {
      const dbMap = new Map(dbRes.data.map((t) => [t.id, t]));
      const merged = [...dbRes.data];
      for (const base of baseTours) {
        if (!dbMap.has(base.id)) {
          merged.push(base);
        }
      }
      return merged;
    }
  } catch (err) {
    console.error("Failed to load persistent tours from database:", err);
  }

  return baseTours;
}

/**
 * Server-only effective tour resolver by ID.
 * Queries Supabase first for the authoritative persistent tour, falling back to baseline.
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
      const dbRes = await getPersistentTourById(cleanId);
      if (dbRes.success && dbRes.data) {
        return dbRes.data;
      }
    } catch (err) {
      console.error("Failed to load persistent tour from database:", err);
    }
  }

  return getTourById(cleanId, referenceDate) ?? null;
}
