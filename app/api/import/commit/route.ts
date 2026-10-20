import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { parseExcelWorkbook } from "@/lib/excel-parser";
import {
  saveCanonicalDataset,
  validateCanonicalPayload,
  getCanonicalTours,
} from "@/lib/canonical-store";
import { mergeCoordinatorFields, compareIncomingWithExisting, maskGuestName } from "@/lib/operations";
import {
  getDatabaseConfigStatus,
  getPersistentTours,
  batchUpsertPersistentTours,
} from "@/lib/operational-store";
import { authenticateOperatorRequest } from "@/lib/auth";
import type { ImportPreviewResult, Tour } from "@/lib/types";

export const dynamic = "force-dynamic";

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

export function isValidCalendarDate(dateStr: string): boolean {
  if (!dateStr || typeof dateStr !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const [y, m, day] = dateStr.split("-").map(Number);
  if (y < 2000 || y > 2099 || m < 1 || m > 12 || day < 1 || day > 31) {
    return false;
  }
  const d = new Date(Date.UTC(y, m - 1, day));
  return (
    d.getUTCFullYear() === y &&
    d.getUTCMonth() === m - 1 &&
    d.getUTCDate() === day
  );
}

export async function POST(req: NextRequest) {
  try {
    const auth = authenticateOperatorRequest(req, { requiredRole: "lead_coordinator" });
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    const body = await req.json().catch(() => ({}));
    let result: ImportPreviewResult;

    if (body.action === "commit_staged") {
      const stagedPath = path.resolve(process.cwd(), "data/source/NEW CHART 2025-2026 (1).xls");
      if (!fs.existsSync(stagedPath)) {
        return NextResponse.json(
          { success: false, error: "Staged workbook not found at data/source/NEW CHART 2025-2026 (1).xls" },
          { status: 404 }
        );
      }
      const buffer = fs.readFileSync(stagedPath);
      result = parseExcelWorkbook(buffer, { seasonFilter: body.seasonFilter });
    } else if (body.payload) {
      const validation = validateCanonicalPayload(body.payload);
      if (!validation.valid) {
        return NextResponse.json(
          { success: false, error: `Invalid payload structure: ${validation.error}` },
          { status: 400 }
        );
      }
      result = body.payload as ImportPreviewResult;
    } else {
      return NextResponse.json(
        { success: false, error: "Invalid commit request. Provide { action: 'commit_staged' } or { payload: previewResult }" },
        { status: 400 }
      );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SAFEGUARD 1: Strict Coordinator Date Decision Validation
    // Requires an explicit, valid, non-stale, non-duplicate decision for every
    // ambiguous record before data activation.
    // ──────────────────────────────────────────────────────────────────────────
    if (body.dateDecisions !== undefined && !Array.isArray(body.dateDecisions)) {
      return NextResponse.json(
        { success: false, error: "Invalid dateDecisions: expected an array.", code: "INVALID_DATE_DECISIONS" },
        { status: 400 }
      );
    }

    let rawDecisions = (body.dateDecisions || []) as CoordinatorDateDecision[];
    if (body.dateDecisions === undefined) {
      const savedDecisionsFile = path.resolve(process.cwd(), "data/imported/staged_date_decisions.json");
      if (fs.existsSync(savedDecisionsFile)) {
        try {
          const content = fs.readFileSync(savedDecisionsFile, "utf-8");
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed.decisions)) {
            rawDecisions = parsed.decisions;
          }
        } catch {
          // Ignore read errors, fallback to empty array
        }
      }
    }
    const ambiguities = result.ambiguities || [];

    const validSourceKeys = new Set(
      ambiguities
        .map((a) => (a.sourceRecordId ? a.sourceRecordId.toLowerCase().trim() : null))
        .filter(Boolean) as string[]
    );
    const validRefKeys = new Set(
      ambiguities.map((a) => a.bookingReference.toLowerCase().trim())
    );

    // 1. Check for duplicate decisions
    const seenDecisionKeys = new Set<string>();
    for (const d of rawDecisions) {
      const key = d.sourceRecordId
        ? `src:${d.sourceRecordId.toLowerCase().trim()}`
        : `ref:${d.bookingReference?.toLowerCase().trim()}`;
      if (seenDecisionKeys.has(key)) {
        return NextResponse.json(
          {
            success: false,
            error: `Duplicate date decision received for record '${d.sourceRecordId || d.bookingReference}'.`,
            code: "DUPLICATE_DATE_DECISIONS",
          },
          { status: 422 }
        );
      }
      seenDecisionKeys.add(key);
    }

    // 2. Check for stale decisions referencing records not in current ambiguities
    for (const d of rawDecisions) {
      const srcKey = d.sourceRecordId ? d.sourceRecordId.toLowerCase().trim() : null;
      const refKey = d.bookingReference ? d.bookingReference.toLowerCase().trim() : "";

      const isKnown =
        (srcKey && validSourceKeys.has(srcKey)) ||
        (!srcKey && refKey && validRefKeys.has(refKey));

      if (!isKnown) {
        return NextResponse.json(
          {
            success: false,
            error: `Stale date decision: record '${d.sourceRecordId || d.bookingReference}' does not match any current ambiguous record in the staged workbook.`,
            code: "STALE_DATE_DECISION",
          },
          { status: 422 }
        );
      }
    }

    // 3. Check for invalid decision types or calendar dates
    for (const d of rawDecisions) {
      if (d.decision !== "confirm_inferred" && d.decision !== "override") {
        return NextResponse.json(
          {
            success: false,
            error: `Invalid decision type '${d.decision}' for record '${d.sourceRecordId || d.bookingReference}'. Must be 'confirm_inferred' or 'override'.`,
            code: "INVALID_DATE_DECISION",
          },
          { status: 422 }
        );
      }

      if (!d.confirmedArrivalDate || !isValidCalendarDate(d.confirmedArrivalDate)) {
        return NextResponse.json(
          {
            success: false,
            error: `Invalid calendar date '${d.confirmedArrivalDate}' for record '${d.sourceRecordId || d.bookingReference}'. Must be a valid existing date in YYYY-MM-DD format.`,
            code: "INVALID_CALENDAR_DATE",
          },
          { status: 422 }
        );
      }
    }

    // 4. Map decisions keyed primarily by sourceRecordId, secondarily by bookingReference
    const decisionBySource = new Map<string, CoordinatorDateDecision>();
    const decisionByRef = new Map<string, CoordinatorDateDecision>();
    for (const d of rawDecisions) {
      if (d.sourceRecordId) {
        decisionBySource.set(d.sourceRecordId.toLowerCase().trim(), d);
      }
      if (d.bookingReference) {
        decisionByRef.set(d.bookingReference.toLowerCase().trim(), d);
      }
    }

    // 5. Check for missing / unresolved decisions
    const unresolved = ambiguities.filter((amb) => {
      const srcKey = amb.sourceRecordId ? amb.sourceRecordId.toLowerCase().trim() : null;
      const refKey = amb.bookingReference.toLowerCase().trim();
      const decision = (srcKey && decisionBySource.get(srcKey)) || decisionByRef.get(refKey);
      if (!decision) return true;
      return !isValidCalendarDate(decision.confirmedArrivalDate);
    });

    if (unresolved.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Import rejected: ${unresolved.length} unresolved date ambiguities detected. Explicit coordinator confirmation is mandatory for all ambiguous records before data activation.`,
          code: "UNRESOLVED_DATE_AMBIGUITIES",
          unresolvedCount: unresolved.length,
          unresolved: unresolved.map((u) => {
            const matchingTour = result.tours.find(
              (t) =>
                (u.sourceRecordId && t.sourceRecordId === u.sourceRecordId) ||
                t.bookingReference.toLowerCase() === u.bookingReference.toLowerCase()
            );
            return {
              bookingReference: u.bookingReference,
              sourceRecordId: u.sourceRecordId,
              sheet: u.sheet,
              row: u.row,
              rawSerial: u.rawSerial,
              reason: u.reason,
              proposedDate: matchingTour?.arrivalDate || null,
              guestMasked:
                (u as { guestMasked?: string }).guestMasked ||
                (matchingTour ? maskGuestName(matchingTour.group.groupName) : "Guest"),
            };
          }),
        },
        { status: 422 }
      );
    }

    // 6. Apply confirmed dates to incoming tours (keyed by sourceRecordId first)
    result.tours = result.tours.map((tour) => {
      const srcKey = tour.sourceRecordId ? tour.sourceRecordId.toLowerCase().trim() : null;
      const refKey = tour.bookingReference.toLowerCase().trim();
      const decision = (srcKey && decisionBySource.get(srcKey)) || decisionByRef.get(refKey);
      if (decision) {
        return {
          ...tour,
          arrivalDate: decision.confirmedArrivalDate,
          departureDate:
            tour.departureDate && tour.departureDate >= decision.confirmedArrivalDate
              ? tour.departureDate
              : decision.confirmedArrivalDate,
          hasDateAmbiguity: false,
          dateAmbiguityReason: `Confirmed by coordinator (${decision.decision}): ${decision.notes || "Arrival date confirmed."}`,
        };
      }
      return tour;
    });

    // ──────────────────────────────────────────────────────────────────────────
    // SAFEGUARD 2: Preserve coordinator-managed fields from previously existing records
    // Priority: Exact tour ID first, sourceRecordId second, single-match bookingReference third
    // ──────────────────────────────────────────────────────────────────────────
    let existingTours: Tour[] = [];
    const dbStatus = getDatabaseConfigStatus();
    if (dbStatus.configured) {
      const dbRes = await getPersistentTours();
      if (dbRes.success && dbRes.data) {
        existingTours = dbRes.data;
      }
    } else {
      existingTours = getCanonicalTours();
    }

    const matchedExistingIds = new Set<string>();
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

    result.tours = result.tours.map((incoming) => {
      let existing = existingById.get(incoming.id.toLowerCase().trim());
      if (!existing && incoming.sourceRecordId) {
        existing = existingBySource.get(incoming.sourceRecordId.toLowerCase().trim());
      }
      if (!existing) {
        const matches = existingByRef.get(incoming.bookingReference.toLowerCase().trim()) || [];
        if (matches.length === 1) {
          existing = matches[0];
        }
      }
      if (existing) {
        matchedExistingIds.add(existing.id.toLowerCase().trim());
        return mergeCoordinatorFields(incoming, existing);
      }
      return incoming;
    });

    // ──────────────────────────────────────────────────────────────────────────
    // SAFEGUARD 3: Dry-Run Summary Mode
    // ──────────────────────────────────────────────────────────────────────────
    const comparison = compareIncomingWithExisting(
      result.tours,
      existingTours,
      dbStatus.configured ? "persistent_database" : "canonical_store"
    );

    if (body.dryRun === true) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        summary: {
          totalIncoming: result.tours.length,
          wouldInsert: comparison.wouldInsertCount,
          wouldUpdate: comparison.wouldUpdateCount,
          wouldSkip: comparison.wouldSkipCount,
          flaggedConflicts: comparison.flaggedConflictCount,
          comparedAgainst: comparison.comparedAgainst,
        },
        details: comparison.details,
      });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SAFEGUARD 4: Reject commit if genuine duplicate conflicts exist
    // ──────────────────────────────────────────────────────────────────────────
    if (comparison.flaggedConflictCount > 0) {
      const conflicts = comparison.details.filter((d) => d.action === "conflict");
      return NextResponse.json(
        {
          success: false,
          error: `Import rejected: ${conflicts.length} reference conflict(s) detected where multiple existing tours share a booking reference without source identity.`,
          code: "REFERENCE_CONFLICTS",
          conflicts,
        },
        { status: 409 }
      );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SAFEGUARD 4.5: Reject live commit if decisions are marked as simulated/test
    // ──────────────────────────────────────────────────────────────────────────
    const simulated = rawDecisions.filter((d) => d.approvalSource === "simulated");
    if (simulated.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Live import blocked: ${simulated.length} of ${rawDecisions.length} date decisions are marked as test-generated or simulated. A live import requires genuine human coordinator approvals.`,
          code: "SIMULATED_DECISIONS_BLOCKED",
          simulatedCount: simulated.length,
          simulatedRecords: simulated.map((s) => s.sourceRecordId || s.bookingReference),
        },
        { status: 422 }
      );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SAFEGUARD 5: Database Atomic Batch Commit with Partial Failure Handling
    // ──────────────────────────────────────────────────────────────────────────
    let dbSummary: unknown = null;
    if (dbStatus.configured) {
      const operator = auth.payload?.operator || "coordinator";
      const batchRes = await batchUpsertPersistentTours(result.tours, existingTours, operator);
      dbSummary = batchRes;

      if (!batchRes.success) {
        return NextResponse.json(
          {
            success: false,
            error: `Partial database write failure: ${batchRes.failed} of ${batchRes.totalAttempted} record(s) failed during atomic RPC mutation.`,
            code: "PARTIAL_PERSISTENCE_FAILURE",
            batchSummary: batchRes,
          },
          { status: 500 }
        );
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SAFEGUARD 6: Atomic Canonical File Backup & Persist
    // ──────────────────────────────────────────────────────────────────────────
    // Retain non-overlapping coordinator tours created outside this sheet
    if (existingTours.length > 0) {
      const importedIds = new Set(result.tours.map((t) => t.id.toLowerCase().trim()));
      const importedSourceIds = new Set(
        result.tours.map((t) => (t.sourceRecordId || "").toLowerCase().trim()).filter(Boolean)
      );

      const nonOverlapping = existingTours.filter((t) => {
        const idMatch = importedIds.has(t.id.toLowerCase().trim());
        const srcMatch = t.sourceRecordId
          ? importedSourceIds.has(t.sourceRecordId.toLowerCase().trim())
          : false;
        const alreadyMerged = matchedExistingIds.has(t.id.toLowerCase().trim());
        return !idMatch && !srcMatch && !alreadyMerged;
      });

      if (nonOverlapping.length > 0) {
        result.tours = [...result.tours, ...nonOverlapping];
        result.summary = {
          ...result.summary,
          canonicalToursCount: result.tours.length,
        };
      }
    }

    const saveRes = saveCanonicalDataset(result, "operational");
    if (!saveRes.success) {
      const isValidationError = saveRes.error?.startsWith("Validation failed:");
      return NextResponse.json(
        { success: false, error: saveRes.error || "Failed to persist canonical dataset" },
        { status: isValidationError ? 400 : 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Successfully committed ${result.tours.length} canonical tours from operational workbook.`,
      summary: result.summary,
      count: result.tours.length,
      dryRunSummary: {
        inserted: comparison.wouldInsertCount,
        updated: comparison.wouldUpdateCount,
        skipped: comparison.wouldSkipCount,
      },
      dbSummary,
    });
  } catch (err) {
    console.error("Import commit error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
