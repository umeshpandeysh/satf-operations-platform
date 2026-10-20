/**
 * SATF Operations Platform — Server-Side Persistent Operations Store
 *
 * Provides database-backed persistence for day-to-day operational mutations:
 * - Tour creation
 * - Tour updates (assignments, hotels, notes, issues, status)
 * - Tour cancellations
 * - Concurrency conflict detection (optimistic locking via lastUpdated)
 * - Safe degradation when database credentials are not configured
 * - Bidirectional serialization between TypeScript Tour model and PostgreSQL snake_case columns
 * - Operational audit logging into satf_audit_log
 */

import type {
  Tour,
  GuestGroup,
  TourStatus,
  FlightLeg,
  HotelStay,
  ItineraryEntry,
  ResourceAssignment,
  SpecialRequest,
  OperationalIssue,
  TrainJourney,
} from "./types";
import { mergeCoordinatorFields, computeTourLifecycleStatus } from "./operations";
import { getIndiaTodayISO } from "./utils";

export interface DatabaseConfigStatus {
  configured: boolean;
  supabaseUrlConfigured: boolean;
  serviceKeyConfigured: boolean;
  missingKeys: string[];
}

export interface PersistenceResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: "DATABASE_NOT_CONFIGURED" | "CONCURRENCY_CONFLICT" | "VALIDATION_ERROR" | "NOT_FOUND" | "DUPLICATE_KEY" | "INTERNAL_ERROR";
  conflict?: boolean;
  currentTour?: Tour;
}

/**
 * Check whether Supabase environment variables are configured.
 * Never logs or exposes secret keys.
 */
export function getDatabaseConfigStatus(): DatabaseConfigStatus {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const missingKeys: string[] = [];
  if (!supabaseUrl) missingKeys.push("SUPABASE_URL");
  if (!serviceKey) missingKeys.push("SUPABASE_SERVICE_ROLE_KEY");

  return {
    configured: Boolean(supabaseUrl && serviceKey),
    supabaseUrlConfigured: Boolean(supabaseUrl),
    serviceKeyConfigured: Boolean(serviceKey),
    missingKeys,
  };
}

/**
 * Returns an honest, unconfigured persistence error response.
 * Strictly adheres to rule: do not invent credentials, create a fake persistence layer,
 * or silently fall back to sessionStorage.
 */
function createUnconfiguredError<T = unknown>(): PersistenceResult<T> {
  const status = getDatabaseConfigStatus();
  return {
    success: false,
    error: `Server database persistence is not configured. Required environment variables [${status.missingKeys.join(
      ", "
    )}] must be configured to persist operational changes to Supabase.`,
    code: "DATABASE_NOT_CONFIGURED",
  };
}

/**
 * Serializes a TypeScript Tour entity into a PostgreSQL table row matching satf_schema.sql.
 */
export function tourToRow(tour: Tour): Record<string, unknown> {
  return {
    id: tour.id,
    booking_reference: tour.bookingReference,
    source_record_id: tour.sourceRecordId || null,
    group_data: tour.group,
    status: tour.status,
    destination: tour.destination || "",
    arrival_date: tour.arrivalDate,
    departure_date: tour.departureDate,
    flights: tour.flights || [],
    hotels: tour.hotels || [],
    itinerary: tour.itinerary || [],
    assignments: tour.assignments || [],
    special_requests: tour.specialRequests || [],
    issues: tour.issues || [],
    agency: tour.agency || null,
    package_code: tour.packageCode || null,
    source_sheet: tour.sourceSheet || null,
    source_row: tour.sourceRow || null,
    source_provenance: tour.sourceProvenance || null,
    operational_notes: tour.operationalNotes || null,
    cancellation_reason: tour.cancellationReason || null,
    cancelled_at: tour.cancelledAt || null,
    is_imported: Boolean(tour.isImported),
    provenance: {
      source_record_id: tour.sourceRecordId || null,
      train_journeys: tour.trainJourneys || [],
      original_arrival_date: tour.originalArrivalDate || null,
      date_correction_reason: tour.dateCorrectionReason || null,
      has_cancellation_indicator: Boolean(tour.hasCancellationIndicator),
      cancellation_indicator_reason: tour.cancellationIndicatorReason || null,
      source_sheets: tour.sourceSheets || (tour.sourceSheet ? [tour.sourceSheet] : []),
      raw_arrival_serial: tour.rawArrivalSerial ?? null,
      has_date_ambiguity: Boolean(tour.hasDateAmbiguity),
      date_ambiguity_reason: tour.dateAmbiguityReason || null,
    },
    last_updated: tour.lastUpdated || new Date().toISOString(),
  };
}

/**
 * Deserializes a PostgreSQL table row into a TypeScript Tour entity.
 */
export function rowToTour(row: Record<string, unknown>, referenceDate: string = getIndiaTodayISO()): Tour {
  let prov: Record<string, unknown> = {};
  if (row.provenance) {
    prov = (typeof row.provenance === "string" ? JSON.parse(row.provenance) : row.provenance) as Record<string, unknown>;
  }

  const rawStatus = (row.status as TourStatus) || "upcoming";
  const arrivalDate = String(row.arrival_date || "");
  const departureDate = String(row.departure_date || "");
  const status = computeTourLifecycleStatus(
    {
      status: rawStatus,
      arrivalDate,
      departureDate,
      cancelledAt: (row.cancelled_at as string) || undefined,
    },
    referenceDate
  );

  return {
    id: String(row.id),
    bookingReference: String(row.booking_reference),
    sourceRecordId: (row.source_record_id as string) || (prov.source_record_id as string) || undefined,
    group: (typeof row.group_data === "string" ? JSON.parse(row.group_data) : row.group_data) as GuestGroup,
    status,
    destination: (row.destination as string) || "",
    arrivalDate,
    departureDate,
    flights: (typeof row.flights === "string" ? JSON.parse(row.flights) : (row.flights || [])) as FlightLeg[],
    hotels: (typeof row.hotels === "string" ? JSON.parse(row.hotels) : (row.hotels || [])) as HotelStay[],
    itinerary: (typeof row.itinerary === "string" ? JSON.parse(row.itinerary) : (row.itinerary || [])) as ItineraryEntry[],
    assignments: (typeof row.assignments === "string" ? JSON.parse(row.assignments) : (row.assignments || [])) as ResourceAssignment[],
    specialRequests: (typeof row.special_requests === "string" ? JSON.parse(row.special_requests) : (row.special_requests || [])) as SpecialRequest[],
    issues: (typeof row.issues === "string" ? JSON.parse(row.issues) : (row.issues || [])) as OperationalIssue[],
    trainJourneys: (prov.train_journeys as TrainJourney[]) || [],
    originalArrivalDate: (prov.original_arrival_date as string) || undefined,
    dateCorrectionReason: (prov.date_correction_reason as string) || undefined,
    hasCancellationIndicator: prov.has_cancellation_indicator ? Boolean(prov.has_cancellation_indicator) : undefined,
    cancellationIndicatorReason: (prov.cancellation_indicator_reason as string) || undefined,
    sourceSheets: (prov.source_sheets as string[]) || (row.source_sheet ? [String(row.source_sheet)] : undefined),
    rawArrivalSerial: typeof prov.raw_arrival_serial === "number" ? prov.raw_arrival_serial : undefined,
    hasDateAmbiguity: prov.has_date_ambiguity ? Boolean(prov.has_date_ambiguity) : undefined,
    dateAmbiguityReason: (prov.date_ambiguity_reason as string) || undefined,
    agency: (row.agency as string) || undefined,
    packageCode: (row.package_code as string) || undefined,
    sourceSheet: (row.source_sheet as string) || undefined,
    sourceRow: typeof row.source_row === "number" ? row.source_row : undefined,
    sourceProvenance: (row.source_provenance as string) || undefined,
    operationalNotes: (row.operational_notes as string) || undefined,
    cancellationReason: (row.cancellation_reason as string) || undefined,
    cancelledAt: (row.cancelled_at as string) || undefined,
    isImported: Boolean(row.is_imported),
    lastUpdated: String(row.last_updated || new Date().toISOString()),
  };
}

/**
 * Log operational changes into satf_audit_log table.
 * Returns explicit success/error status to ensure audit trail consistency.
 */
export async function logAuditEvent(
  tourId: string,
  bookingReference: string,
  action: "create" | "update" | "cancel" | "delete",
  operator: string = "coordinator",
  changes: Record<string, unknown> = {}
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await executeSupabaseQuery<Record<string, unknown>[]>("satf_audit_log", {
      method: "POST",
      body: JSON.stringify({
        tour_id: tourId,
        booking_reference: bookingReference,
        action,
        operator,
        changes,
      }),
    });

    if (!res.ok) {
      return {
        success: false,
        error: res.error || `HTTP ${res.status} from audit log endpoint`,
      };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Audit log connection failure",
    };
  }
}

/**
 * Execute a query against Supabase PostgREST endpoint using standard fetch.
 * Requires zero external dependencies.
 */
async function executeSupabaseQuery<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return { ok: false, status: 503, error: "Database not configured" };
  }

  const url = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/${endpoint}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        ...options.headers,
      },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown database error");
      return { ok: false, status: res.status, error: errText };
    }

    const data = (await res.json().catch(() => null)) as T;
    return { ok: true, status: res.status, data };
  } catch (err) {
    return {
      ok: false,
      status: 500,
      error: err instanceof Error ? err.message : "Database connection failed",
    };
  }
}

// ─── High-Performance Server-Side Cache for Persistent Operational Tours ───

interface PersistentToursCache {
  data: Tour[];
  timestamp: number;
}

let persistentToursCache: PersistentToursCache | null = null;
const PERSISTENT_TOURS_CACHE_TTL_MS = 60 * 1000; // 60-second TTL

export function invalidatePersistentToursCache(): void {
  persistentToursCache = null;
}

/**
 * Retrieve all persistent operational tours from Supabase.
 */
export async function getPersistentTours(referenceDate: string = getIndiaTodayISO()): Promise<PersistenceResult<Tour[]>> {
  const config = getDatabaseConfigStatus();
  if (!config.configured) {
    return createUnconfiguredError<Tour[]>();
  }

  const allRows: Record<string, unknown>[] = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const res = await executeSupabaseQuery<Record<string, unknown>[]>(
      `satf_operational_tours?select=*&order=arrival_date.asc&limit=${pageSize}&offset=${offset}`
    );
    if (!res.ok || !res.data) {
      return {
        success: false,
        error: res.error || "Failed to retrieve operational tours from database",
        code: "INTERNAL_ERROR",
      };
    }
    allRows.push(...res.data);
    if (res.data.length < pageSize) {
      break;
    }
    offset += pageSize;
  }

  return { success: true, data: allRows.map((r) => rowToTour(r, referenceDate)) };
}

/**
 * Retrieve persistent operational tours with 60s in-memory caching.
 * Cache is immediately invalidated upon any mutation (create, update, cancel, commit).
 */
export async function getCachedPersistentTours(
  referenceDate: string = getIndiaTodayISO()
): Promise<PersistenceResult<Tour[]>> {
  const now = Date.now();
  if (persistentToursCache && now - persistentToursCache.timestamp < PERSISTENT_TOURS_CACHE_TTL_MS) {
    return {
      success: true,
      data: persistentToursCache.data.map((t) => ({
        ...t,
        status: computeTourLifecycleStatus(t, referenceDate),
      })),
    };
  }

  const res = await getPersistentTours(referenceDate);
  if (res.success && res.data) {
    persistentToursCache = {
      data: res.data,
      timestamp: now,
    };
  }
  return res;
}

/**
 * Retrieve a single operational tour by ID from Supabase.
 */
export async function getPersistentTourById(
  id: string,
  referenceDate: string = getIndiaTodayISO()
): Promise<PersistenceResult<Tour | null>> {
  const config = getDatabaseConfigStatus();
  if (!config.configured) {
    return createUnconfiguredError<Tour | null>();
  }

  const cleanId = encodeURIComponent(id.trim());
  let res = await executeSupabaseQuery<Record<string, unknown>[]>(`satf_operational_tours?id=eq.${cleanId}&select=*&limit=1`);
  if (!res.ok) {
    return {
      success: false,
      error: res.error || "Failed to retrieve tour from database",
      code: "INTERNAL_ERROR",
    };
  }

  // If not found by direct id, attempt resolution by satf- prefix or booking reference
  if ((!res.data || res.data.length === 0) && id.trim()) {
    const rawId = id.trim();
    const altRes = await executeSupabaseQuery<Record<string, unknown>[]>(
      `satf_operational_tours?or=(id.eq.satf-${encodeURIComponent(rawId)},booking_reference.eq.${encodeURIComponent(rawId)})&select=*&limit=1`
    );
    if (altRes.ok && altRes.data && altRes.data.length > 0) {
      res = altRes;
    }
  }

  const tour = res.data && res.data.length > 0 ? rowToTour(res.data[0], referenceDate) : null;
  return { success: true, data: tour };
}

/**
 * Retrieve a single operational tour by its exact source record ID (e.g. 'OCT 23:R21:1222824').
 */
export async function getPersistentTourBySourceRecordId(
  sourceRecordId: string,
  referenceDate: string = getIndiaTodayISO()
): Promise<PersistenceResult<Tour | null>> {
  const config = getDatabaseConfigStatus();
  if (!config.configured) {
    return createUnconfiguredError<Tour | null>();
  }

  const cleanSrcId = encodeURIComponent(sourceRecordId.trim());
  const res = await executeSupabaseQuery<Record<string, unknown>[]>(
    `satf_operational_tours?source_record_id=eq.${cleanSrcId}&select=*&limit=1`
  );
  if (!res.ok) {
    return {
      success: false,
      error: res.error || "Failed to retrieve tour by source record ID from database",
      code: "INTERNAL_ERROR",
    };
  }

  const tour = res.data && res.data.length > 0 ? rowToTour(res.data[0], referenceDate) : null;
  return { success: true, data: tour };
}

/**
 * Retrieve all operational tours sharing a specific booking reference.
 * Returns an array supporting distinct tours with the same booking reference.
 */
export async function getPersistentToursByBookingRef(
  bookingRef: string,
  referenceDate: string = getIndiaTodayISO()
): Promise<PersistenceResult<Tour[]>> {
  const config = getDatabaseConfigStatus();
  if (!config.configured) {
    return createUnconfiguredError<Tour[]>();
  }

  const cleanRef = encodeURIComponent(bookingRef.trim());
  const res = await executeSupabaseQuery<Record<string, unknown>[]>(
    `satf_operational_tours?booking_reference=eq.${cleanRef}&select=*&order=arrival_date.asc`
  );
  if (!res.ok || !res.data) {
    return {
      success: false,
      error: res.error || "Failed to retrieve tours by booking reference from database",
      code: "INTERNAL_ERROR",
    };
  }

  return { success: true, data: res.data.map((r) => rowToTour(r, referenceDate)) };
}

/**
 * Execute atomic tour mutation using Supabase RPC satf_mutate_tour_atomic.
 * Guarantees that tour creation/update/cancellation and audit logging occur
 * within a single PostgreSQL ACID transaction boundary.
 */
export async function executeAtomicTourMutation(
  tour: Tour,
  action: "create" | "update" | "cancel",
  operator: string = "coordinator",
  expectedLastUpdated?: string
): Promise<PersistenceResult<Tour>> {
  const config = getDatabaseConfigStatus();
  if (!config.configured) {
    return createUnconfiguredError<Tour>();
  }

  const row = tourToRow(tour);
  const rpcPayload = {
    p_tour: row,
    p_action: action,
    p_operator: operator,
    p_expected_last_updated: expectedLastUpdated || null,
  };

  const res = await executeSupabaseQuery<Record<string, unknown>>("rpc/satf_mutate_tour_atomic", {
    method: "POST",
    body: JSON.stringify(rpcPayload),
  });

  if (!res.ok) {
    const errorText = res.error || "";
    // Detect Concurrency Conflict from exception
    if (errorText.includes("CONCURRENCY_CONFLICT") || res.status === 409) {
      const currentRes = await getPersistentTourById(tour.id);
      return {
        success: false,
        conflict: true,
        code: "CONCURRENCY_CONFLICT",
        error: `Conflict: Tour ${tour.bookingReference} was updated by another coordinator. Please refresh the record before saving.`,
        currentTour: currentRes.data || undefined,
      };
    }

    // Detect Not Found
    if (errorText.includes("TOUR_NOT_FOUND") || res.status === 404) {
      return {
        success: false,
        code: "NOT_FOUND",
        error: `Tour not found in database: ${tour.id}`,
      };
    }

    // Detect Duplicate Key
    if (errorText.includes("duplicate key") || errorText.includes("23505")) {
      return {
        success: false,
        code: "DUPLICATE_KEY",
        error: `A tour record with ID '${tour.id}' or source identifier '${tour.sourceRecordId || tour.bookingReference}' already exists in database.`,
      };
    }

    return {
      success: false,
      code: "INTERNAL_ERROR",
      error: `Atomic database mutation failed: ${errorText}`,
    };
  }

  if (!res.data) {
    return {
      success: false,
      code: "INTERNAL_ERROR",
      error: "Atomic mutation succeeded but returned empty result from database.",
    };
  }

  const mutatedTour = rowToTour(res.data);
  invalidatePersistentToursCache();
  return { success: true, data: mutatedTour };
}

/**
 * Create a new operational tour in Supabase.
 * Executes atomically via satf_mutate_tour_atomic RPC, ensuring the tour insert
 * and initial dispatch audit log are committed in a single PostgreSQL transaction.
 */
export async function createPersistentTour(tour: Tour, operator?: string): Promise<PersistenceResult<Tour>> {
  return executeAtomicTourMutation(tour, "create", operator);
}

/**
 * Update an existing operational tour with atomic optimistic concurrency and audit logging.
 * Executes atomically via satf_mutate_tour_atomic RPC, validating expectedLastUpdated
 * and inserting the audit record in the same PostgreSQL transaction.
 */
export async function updatePersistentTour(
  tour: Tour,
  expectedLastUpdated?: string,
  operator?: string
): Promise<PersistenceResult<Tour>> {
  return executeAtomicTourMutation(tour, "update", operator, expectedLastUpdated);
}

/**
 * Cancel an operational tour with mandatory explanation reason.
 * Executes atomically via satf_mutate_tour_atomic RPC, validating expectedLastUpdated
 * and writing the cancellation audit record in the same PostgreSQL transaction.
 */
export async function cancelPersistentTour(
  tourId: string,
  reason: string,
  expectedLastUpdated?: string,
  operator?: string
): Promise<PersistenceResult<Tour>> {
  const config = getDatabaseConfigStatus();
  if (!config.configured) {
    return createUnconfiguredError<Tour>();
  }

  const cleanId = tourId.trim();
  const existingRes = await getPersistentTourById(cleanId);
  if (!existingRes.success || !existingRes.data) {
    return {
      success: false,
      code: "NOT_FOUND",
      error: `Tour not found in database: ${cleanId}`,
    };
  }

  const cancelledTour: Tour = {
    ...existingRes.data,
    status: "cancelled",
    cancellationReason: reason.trim(),
    cancelledAt: new Date().toISOString(),
  };

  return executeAtomicTourMutation(cancelledTour, "cancel", operator, expectedLastUpdated);
}

export interface BatchCommitItemResult {
  sourceRecordId: string;
  bookingReference: string;
  action: "inserted" | "updated" | "skipped" | "failed";
  tourId: string;
  error?: string;
}

export interface BatchCommitSummary {
  totalAttempted: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  items: BatchCommitItemResult[];
  success: boolean;
}

/**
 * Batch-persists imported tours into Supabase with individual item transaction isolation.
 *
 * Architecture & Real Transaction Boundary:
 * Each tour update/insert executes via satf_mutate_tour_atomic RPC, which guarantees
 * atomic consistency (tour write + audit log write in a single PostgreSQL transaction).
 *
 * If one record encounters a failure (e.g. malformed date or unique index conflict),
 * that specific item is marked failed and recorded in the summary; it does NOT leave
 * partial unlogged rows or corrupt other successfully committed tours in the batch.
 *
 * Coordinator-managed fields (guides, drivers, hotel confirmations, notes, manual cancellation)
 * are defended and merged prior to write, ensuring re-import never wipes operational progress.
 */
export async function batchUpsertPersistentTours(
  incomingTours: Tour[],
  existingTours: Tour[],
  operator: string = "coordinator"
): Promise<BatchCommitSummary> {
  const summary: BatchCommitSummary = {
    totalAttempted: incomingTours.length,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    items: [],
    success: true,
  };

  const existingById = new Map<string, Tour>();
  const existingBySource = new Map<string, Tour>();
  const existingByRef = new Map<string, Tour[]>();

  for (const t of existingTours) {
    existingById.set(t.id.toLowerCase().trim(), t);
    if (t.sourceRecordId) {
      existingBySource.set(t.sourceRecordId.toLowerCase().trim(), t);
    }
    const ref = t.bookingReference.toLowerCase().trim();
    if (!existingByRef.has(ref)) existingByRef.set(ref, []);
    existingByRef.get(ref)!.push(t);
  }

  for (const inc of incomingTours) {
    const ref = inc.bookingReference.trim();
    const sourceRecordId = inc.sourceRecordId || `${inc.sourceSheet || "SOURCE"}:R${inc.sourceRow || 0}:${ref}`;

    // 1. Identify existing record by exact ID first, sourceRecordId second, single-ref match third
    let exist: Tour | undefined = existingById.get(inc.id.toLowerCase().trim());
    if (!exist && inc.sourceRecordId) {
      exist = existingBySource.get(inc.sourceRecordId.toLowerCase().trim());
    }
    if (!exist) {
      const matches = existingByRef.get(ref.toLowerCase().trim()) || [];
      if (matches.length === 1) {
        exist = matches[0];
      }
    }

    // 2. Decide action: insert vs update vs skip
    if (!exist) {
      // New record insert
      const res = await createPersistentTour(inc, operator);
      if (res.success && res.data) {
        summary.inserted++;
        summary.items.push({
          sourceRecordId,
          bookingReference: ref,
          action: "inserted",
          tourId: res.data.id,
        });
      } else {
        summary.failed++;
        summary.success = false;
        summary.items.push({
          sourceRecordId,
          bookingReference: ref,
          action: "failed",
          tourId: inc.id,
          error: res.error || "Failed to insert new record via atomic RPC",
        });
      }
    } else {
      // Check if unchanged and has no overrides to apply
      const hasDriver = exist.assignments?.some((a) => a.role === "driver" && a.name);
      const hasHotel = exist.hotels?.some((h) => Boolean(h.confirmationNumber));
      const hasNotes = Boolean(exist.operationalNotes && exist.operationalNotes !== inc.operationalNotes);
      const hasIssues = (exist.issues?.length || 0) > 0;
      const isCancelled = exist.status === "cancelled";
      const hasOverrides = hasDriver || hasHotel || hasNotes || hasIssues || isCancelled;

      const isIdentical =
        exist.arrivalDate === inc.arrivalDate &&
        exist.departureDate === inc.departureDate &&
        exist.group.adultCount === inc.group.adultCount &&
        exist.hotels.length === inc.hotels.length &&
        !hasNotes;

      if (isIdentical && !hasOverrides) {
        summary.skipped++;
        summary.items.push({
          sourceRecordId,
          bookingReference: ref,
          action: "skipped",
          tourId: exist.id,
        });
        continue;
      }

      // Merge coordinator fields into incoming record preserving tour identity and operational inputs
      const merged = mergeCoordinatorFields(inc, exist);
      merged.id = exist.id;

      const res = await updatePersistentTour(merged, undefined, operator);
      if (res.success && res.data) {
        summary.updated++;
        summary.items.push({
          sourceRecordId,
          bookingReference: ref,
          action: "updated",
          tourId: res.data.id,
        });
      } else {
        summary.failed++;
        summary.success = false;
        summary.items.push({
          sourceRecordId,
          bookingReference: ref,
          action: "failed",
          tourId: exist.id,
          error: res.error || "Failed to update record via atomic RPC",
        });
      }
    }
  }

  invalidatePersistentToursCache();
  return summary;
}
