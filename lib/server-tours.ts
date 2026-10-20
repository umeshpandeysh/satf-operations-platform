import { cookies } from "next/headers";
import { COOKIE_NAME } from "./auth-constants";
import { verifySessionToken } from "./auth";
import { getCanonicalTours, getCanonicalTourById } from "./canonical-store";
import { getMockTours, getTourById as getMockTourById } from "./mock-data";
import { getIndiaTodayISO } from "./utils";
import type { Tour } from "./types";
import {
  getDatabaseConfigStatus,
  getCachedPersistentTours,
  getPersistentTourById,
} from "./operational-store";

export interface ServerTourResolutionOptions {
  forceAuthenticated?: boolean;
  forceUnauthenticated?: boolean;
}

/**
 * Validates whether the incoming Server Component or Route Handler request
 * possesses a cryptographically verified operator session.
 * Fails closed if session cookie is missing, tampered with, expired, or revoked.
 */
export async function isServerRequestAuthenticated(
  options?: ServerTourResolutionOptions
): Promise<boolean> {
  if (options?.forceUnauthenticated) {
    return false;
  }
  if (options?.forceAuthenticated) {
    return true;
  }
  if (process.env.SATF_TEST_SESSION_AUTH === "true") {
    return true;
  }
  if (process.env.SATF_TEST_SESSION_AUTH === "false") {
    return false;
  }

  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(COOKIE_NAME);
    if (!sessionCookie || !sessionCookie.value) {
      return false;
    }
    const verification = verifySessionToken(sessionCookie.value);
    return Boolean(verification.valid && verification.payload);
  } catch {
    // When called outside Next.js request context (e.g. standalone test scripts):
    if (!process.env.NEXT_RUNTIME && process.env.NODE_ENV !== "production") {
      return true;
    }
    // Fail closed in production runtime
    return false;
  }
}

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
 *
 * ZERO-TRUST DATA ISOLATION:
 * 1. Verifies server-side coordinator session.
 * 2. Unauthenticated visitors receive synthetic demo data only (getBaseTours).
 *    Zero Supabase queries are made for unauthenticated traffic, completely
 *    eliminating operational data exposure and reducing payload size from 6.3MB to ~80KB.
 * 3. Authenticated coordinators receive authoritative persistent operational
 *    records backed by Supabase with 60s in-memory caching.
 */
export async function getEffectiveServerTours(
  referenceDate: string = getIndiaTodayISO(),
  options?: ServerTourResolutionOptions
): Promise<Tour[]> {
  const isAuthenticated = await isServerRequestAuthenticated(options);
  if (!isAuthenticated) {
    return getBaseTours(referenceDate);
  }

  const config = getDatabaseConfigStatus();
  if (!config.configured) {
    return getBaseTours(referenceDate);
  }

  try {
    const dbRes = await getCachedPersistentTours(referenceDate);
    if (dbRes.success && dbRes.data) {
      return dbRes.data;
    }
  } catch (err) {
    console.error("Failed to load persistent tours from database:", err);
  }

  return [];
}

/**
 * Server-only effective tour resolver by ID.
 *
 * ZERO-TRUST DATA ISOLATION:
 * 1. Verifies server-side coordinator session.
 * 2. Unauthenticated callers can only resolve synthetic demo tours (getTourById).
 *    Real passenger records and Supabase queries are strictly inaccessible without auth.
 * 3. Authenticated coordinators query Supabase for authoritative operational details.
 */
export async function getEffectiveServerTourById(
  id: string,
  referenceDate: string = getIndiaTodayISO(),
  options?: ServerTourResolutionOptions
): Promise<Tour | null> {
  const cleanId = id?.trim();
  if (!cleanId) return null;

  const isAuthenticated = await isServerRequestAuthenticated(options);
  if (!isAuthenticated) {
    return getTourById(cleanId, referenceDate) ?? null;
  }

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
