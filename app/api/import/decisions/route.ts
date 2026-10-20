import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { authenticateOperatorRequest } from "@/lib/auth";
import { isValidCalendarDate } from "@/lib/utils";
import type { CoordinatorDateDecision } from "../commit/route";

export const dynamic = "force-dynamic";

const DATA_DIR = path.resolve(process.cwd(), "data/imported");
const DECISIONS_FILE = path.join(DATA_DIR, "staged_date_decisions.json");
const DECISIONS_TMP = path.join(DATA_DIR, ".tmp_staged_date_decisions.json");

interface StoredDecisionsPayload {
  updatedAt: string;
  updatedBy: string;
  count: number;
  decisions: CoordinatorDateDecision[];
}

/**
 * Write decisions atomically to disk to prevent corrupt partial writes.
 */
function writeDecisionsAtomic(payload: StoredDecisionsPayload): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const content = JSON.stringify(payload, null, 2);
  const tempPath = `${DECISIONS_TMP}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}`;
  fs.writeFileSync(tempPath, content, "utf-8");

  try {
    fs.renameSync(tempPath, DECISIONS_FILE);
  } catch {
    // Windows fallback
    fs.copyFileSync(tempPath, DECISIONS_FILE);
    try {
      fs.unlinkSync(tempPath);
    } catch {}
  }
}

/**
 * GET /api/import/decisions
 * Read persistent coordinator decisions from disk.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = authenticateOperatorRequest(req, { checkCsrf: false });
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    if (!fs.existsSync(DECISIONS_FILE)) {
      return NextResponse.json({
        success: true,
        decisions: [],
        count: 0,
        updatedAt: null,
      });
    }

    const content = fs.readFileSync(DECISIONS_FILE, "utf-8");
    const parsed = JSON.parse(content) as StoredDecisionsPayload;
    const decisions = Array.isArray(parsed.decisions) ? parsed.decisions : [];
    const manualCount = decisions.filter((d) => d.approvalSource === "manual_coordinator").length;
    const batchCount = decisions.filter((d) => d.approvalSource === "batch_confirmed").length;
    const simulatedCount = decisions.filter((d) => d.approvalSource === "simulated").length;

    return NextResponse.json({
      success: true,
      decisions,
      count: decisions.length,
      breakdown: {
        genuineManualCount: manualCount,
        batchConfirmedCount: batchCount,
        simulatedCount,
        isFullyApprovedByHuman: decisions.length > 0 && simulatedCount === 0,
      },
      updatedAt: parsed.updatedAt || null,
      updatedBy: parsed.updatedBy || null,
    });
  } catch (err) {
    console.error("Error reading stored coordinator decisions:", err);
    return NextResponse.json(
      { success: false, error: "Failed to read stored coordinator decisions." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/import/decisions
 * Save coordinator decisions to persistent storage.
 */
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
    if (!body || !Array.isArray(body.decisions)) {
      return NextResponse.json(
        { success: false, error: "Invalid payload: 'decisions' must be an array." },
        { status: 400 }
      );
    }

    const decisions = body.decisions as CoordinatorDateDecision[];

    // Validate decisions
    const validatedDecisions: CoordinatorDateDecision[] = [];
    for (let i = 0; i < decisions.length; i++) {
      const d = decisions[i];
      if (!d || typeof d !== "object") {
        return NextResponse.json(
          { success: false, error: `Decision at index ${i} is not an object.` },
          { status: 400 }
        );
      }
      if (!d.bookingReference || typeof d.bookingReference !== "string") {
        return NextResponse.json(
          { success: false, error: `Decision at index ${i} is missing bookingReference.` },
          { status: 400 }
        );
      }
      if (d.decision !== "confirm_inferred" && d.decision !== "override") {
        return NextResponse.json(
          {
            success: false,
            error: `Decision at index ${i} has invalid decision type '${d.decision}'. Expected 'confirm_inferred' or 'override'.`,
          },
          { status: 400 }
        );
      }
      if (!d.confirmedArrivalDate || !isValidCalendarDate(d.confirmedArrivalDate)) {
        return NextResponse.json(
          {
            success: false,
            error: `Decision at index ${i} has invalid confirmedArrivalDate '${d.confirmedArrivalDate}'. Must be valid calendar date (YYYY-MM-DD).`,
          },
          { status: 400 }
        );
      }

      const approvalSource =
        d.approvalSource === "simulated"
          ? "simulated"
          : d.approvalSource === "batch_confirmed"
          ? "batch_confirmed"
          : "manual_coordinator";

      validatedDecisions.push({
        bookingReference: String(d.bookingReference).trim(),
        sourceRecordId: d.sourceRecordId ? String(d.sourceRecordId).trim() : undefined,
        decision: d.decision,
        confirmedArrivalDate: String(d.confirmedArrivalDate).trim(),
        notes: d.notes ? String(d.notes).trim() : undefined,
        approvalSource,
        approvedBy: d.approvedBy ? String(d.approvedBy).trim() : (auth.payload?.operator || "Coordinator"),
        approvedAt: d.approvedAt || new Date().toISOString(),
      });
    }

    const payload: StoredDecisionsPayload = {
      updatedAt: new Date().toISOString(),
      updatedBy: auth.payload?.operator || "Coordinator",
      count: validatedDecisions.length,
      decisions: validatedDecisions,
    };

    writeDecisionsAtomic(payload);

    return NextResponse.json({
      success: true,
      count: validatedDecisions.length,
      updatedAt: payload.updatedAt,
      breakdown: {
        genuineManualCount: validatedDecisions.filter((d) => d.approvalSource === "manual_coordinator").length,
        batchConfirmedCount: validatedDecisions.filter((d) => d.approvalSource === "batch_confirmed").length,
        simulatedCount: validatedDecisions.filter((d) => d.approvalSource === "simulated").length,
      },
    });
  } catch (err) {
    console.error("Error saving coordinator decisions:", err);
    return NextResponse.json(
      { success: false, error: "Failed to save coordinator decisions." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/import/decisions?scope=simulated_only|all
 * Reset and clear stored coordinator decisions.
 */
export async function DELETE(req: NextRequest) {
  try {
    const auth = authenticateOperatorRequest(req, { requiredRole: "lead_coordinator" });
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    const scope = req.nextUrl.searchParams.get("scope") || "all";

    if (scope === "simulated_only") {
      if (!fs.existsSync(DECISIONS_FILE)) {
        return NextResponse.json({
          success: true,
          count: 0,
          resetScope: "simulated_only",
          removedSimulatedCount: 0,
          preservedCount: 0,
        });
      }

      const content = fs.readFileSync(DECISIONS_FILE, "utf-8");
      const parsed = JSON.parse(content) as StoredDecisionsPayload;
      const allDecisions = Array.isArray(parsed.decisions) ? parsed.decisions : [];
      const genuine = allDecisions.filter((d) => d.approvalSource !== "simulated");
      const removedSimulated = allDecisions.length - genuine.length;

      if (genuine.length === 0) {
        fs.unlinkSync(DECISIONS_FILE);
      } else {
        parsed.decisions = genuine;
        parsed.count = genuine.length;
        parsed.updatedAt = new Date().toISOString();
        parsed.updatedBy = `${auth.payload?.operator || "Coordinator"} (Reset Simulated)`;
        writeDecisionsAtomic(parsed);
      }

      return NextResponse.json({
        success: true,
        count: genuine.length,
        resetScope: "simulated_only",
        removedSimulatedCount: removedSimulated,
        preservedCount: genuine.length,
      });
    }

    // Full reset (scope === "all")
    if (fs.existsSync(DECISIONS_FILE)) {
      fs.unlinkSync(DECISIONS_FILE);
    }

    return NextResponse.json({
      success: true,
      count: 0,
      resetScope: "all",
      cleared: true,
    });
  } catch (err) {
    console.error("Error clearing coordinator decisions:", err);
    return NextResponse.json(
      { success: false, error: "Failed to clear coordinator decisions." },
      { status: 500 }
    );
  }
}
