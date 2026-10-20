import { NextRequest, NextResponse } from "next/server";
import { authenticateOperatorRequest } from "@/lib/auth";
import {
  getDatabaseConfigStatus,
  createPersistentTour,
} from "@/lib/operational-store";
import { validateNewTourForm, createNewTour, computeTourLifecycleStatus, type NewTourInput } from "@/lib/operations";
import { getBaseTours, getEffectiveServerTours } from "@/lib/server-tours";
import type { Tour } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/operations/tours
 *
 * Secure operational endpoint. Requires operator authentication to protect
 * guest names, flight codes, and operational assignments from public scraping.
 *
 * Returns live operational tours from database if configured, or baseline
 * dataset with configured=false status flag.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = authenticateOperatorRequest(req);
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error || "Authentication required." },
        { status: auth.status }
      );
    }

    const config = getDatabaseConfigStatus();
    if (!config.configured) {
      const baseline = getBaseTours();
      return NextResponse.json({
        success: true,
        configured: false,
        tours: baseline,
        message: "Database persistence is not configured on the server. Showing baseline operational tours.",
      });
    }

    const effectiveTours = await getEffectiveServerTours();

    return NextResponse.json({
      success: true,
      configured: true,
      tours: effectiveTours,
    });
  } catch (err) {
    console.error("GET /api/operations/tours error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error reading operational tours." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/operations/tours
 *
 * Authenticated operator endpoint to register a new tour in the operational dispatch system.
 * Enforces session authentication and CSRF protection.
 * Validates form payload and rejects invalid inputs with HTTP 400.
 * If server database is unconfigured, safely fails closed with HTTP 503 without
 * creating fake state or falling back to client storage.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = authenticateOperatorRequest(req);
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error || "Authentication required." },
        { status: auth.status }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid request payload. Expected JSON object." },
        { status: 400 }
      );
    }

    let tourToCreate: Tour;

    // Support either direct NewTourInput or pre-built Tour object
    if (body.newTourInput) {
      const input = body.newTourInput as NewTourInput;
      const baseline = getBaseTours();
      const existingRefs = baseline.map((t) => t.bookingReference);
      const validation = validateNewTourForm(input, existingRefs);
      if (!validation.isValid) {
        return NextResponse.json(
          {
            success: false,
            error: "Form validation failed.",
            validationErrors: validation.errors,
          },
          { status: 400 }
        );
      }
      tourToCreate = createNewTour(input);
    } else if (body.tour) {
      const t = body.tour as Partial<Tour>;
      if (!t.bookingReference || !t.group?.groupName || !t.arrivalDate || !t.departureDate) {
        return NextResponse.json(
          {
            success: false,
            error: "Missing required tour fields: bookingReference, groupName, arrivalDate, and departureDate are required.",
          },
          { status: 400 }
        );
      }
      if (t.departureDate < t.arrivalDate) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid dates: departureDate cannot be earlier than arrivalDate.",
          },
          { status: 400 }
        );
      }
      const rawTour = body.tour as Tour;
      tourToCreate = {
        ...rawTour,
        status: computeTourLifecycleStatus(rawTour),
      };
    } else {
      return NextResponse.json(
        { success: false, error: "Missing 'tour' or 'newTourInput' in request body." },
        { status: 400 }
      );
    }

    // Persist to database if configured
    const config = getDatabaseConfigStatus();
    if (!config.configured) {
      return NextResponse.json(
        {
          success: false,
          error: `Database persistence is not configured on the server. Required environment variables [${config.missingKeys.join(
            ", "
          )}] must be configured to persist new tours.`,
          code: "DATABASE_NOT_CONFIGURED",
          configured: false,
        },
        { status: 503 }
      );
    }

    const operator = auth.payload?.operator || "coordinator";
    const createRes = await createPersistentTour(tourToCreate, operator);
    if (!createRes.success) {
      return NextResponse.json(
        { success: false, error: createRes.error, code: createRes.code },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      tour: createRes.data,
      message: `Tour ${tourToCreate.bookingReference} successfully persisted.`,
    });
  } catch (err) {
    console.error("POST /api/operations/tours error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error persisting tour." },
      { status: 500 }
    );
  }
}
