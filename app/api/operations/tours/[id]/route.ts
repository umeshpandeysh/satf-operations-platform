import { NextRequest, NextResponse } from "next/server";
import { authenticateOperatorRequest } from "@/lib/auth";
import {
  getDatabaseConfigStatus,
  getPersistentTourById,
  updatePersistentTour,
  cancelPersistentTour,
} from "@/lib/operational-store";
import { getTourById } from "@/lib/server-tours";
import type { Tour } from "@/lib/types";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/operations/tours/[id]
 *
 * Retrieve a specific operational tour record by ID.
 * Protected by operator authentication.
 */
export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const auth = authenticateOperatorRequest(req);
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error || "Authentication required." },
        { status: auth.status }
      );
    }

    const { id } = await params;
    const cleanId = id?.trim();
    if (!cleanId) {
      return NextResponse.json(
        { success: false, error: "Tour ID is required." },
        { status: 400 }
      );
    }

    const config = getDatabaseConfigStatus();
    if (config.configured) {
      const dbRes = await getPersistentTourById(cleanId);
      if (dbRes.success && dbRes.data) {
        return NextResponse.json({
          success: true,
          configured: true,
          tour: dbRes.data,
        });
      }
    }

    // Fall back to server canonical/mock tour
    const baselineTour = getTourById(cleanId);
    if (!baselineTour) {
      return NextResponse.json(
        { success: false, error: `Tour '${cleanId}' not found.` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      configured: config.configured,
      tour: baselineTour,
    });
  } catch (err) {
    console.error("GET /api/operations/tours/[id] error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error reading tour." },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/operations/tours/[id]
 *
 * Update operational tour record (assignments, hotels, notes, issues, status).
 * Authenticated operator endpoint with CSRF verification.
 * Enforces optimistic locking / conflict detection via expectedLastUpdated.
 * If server database is unconfigured, returns HTTP 503 without fake persistence.
 */
export async function PUT(req: NextRequest, { params }: RouteContext) {
  try {
    const auth = authenticateOperatorRequest(req);
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error || "Authentication required." },
        { status: auth.status }
      );
    }

    const { id } = await params;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid request payload. Expected JSON object." },
        { status: 400 }
      );
    }

    const tour = (body.tour || body) as Partial<Tour>;
    if (!tour.id || tour.id !== id) {
      return NextResponse.json(
        { success: false, error: "Tour ID mismatch between URL parameter and request body." },
        { status: 400 }
      );
    }

    const expectedLastUpdated = body.expectedLastUpdated as string | undefined;

    const config = getDatabaseConfigStatus();
    if (!config.configured) {
      return NextResponse.json(
        {
          success: false,
          error: `Database persistence is not configured on the server. Required environment variables [${config.missingKeys.join(
            ", "
          )}] must be configured to persist operational updates.`,
          code: "DATABASE_NOT_CONFIGURED",
          configured: false,
        },
        { status: 503 }
      );
    }

    const updateRes = await updatePersistentTour(tour as Tour, expectedLastUpdated);
    if (!updateRes.success) {
      if (updateRes.conflict) {
        return NextResponse.json(
          {
            success: false,
            error: updateRes.error,
            code: "CONCURRENCY_CONFLICT",
            currentTour: updateRes.currentTour,
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { success: false, error: updateRes.error, code: updateRes.code },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      tour: updateRes.data,
      message: `Tour ${tour.bookingReference} successfully updated.`,
    });
  } catch (err) {
    console.error("PUT /api/operations/tours/[id] error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error updating tour." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/operations/tours/[id]
 *
 * Dedicated endpoint for action-based mutations:
 * - { action: "cancel", reason: string, expectedLastUpdated?: string }
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const auth = authenticateOperatorRequest(req);
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error || "Authentication required." },
        { status: auth.status }
      );
    }

    const { id } = await params;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid request payload. Expected JSON object." },
        { status: 400 }
      );
    }

    const action = body.action;

    if (action === "cancel") {
      const reason = (body.reason as string)?.trim();
      if (!reason || reason.length < 5) {
        return NextResponse.json(
          { success: false, error: "A valid cancellation reason of at least 5 characters is required." },
          { status: 400 }
        );
      }

      const config = getDatabaseConfigStatus();
      if (!config.configured) {
        return NextResponse.json(
          {
            success: false,
            error: `Database persistence is not configured on the server. Required environment variables [${config.missingKeys.join(
              ", "
            )}] must be configured to cancel tours.`,
            code: "DATABASE_NOT_CONFIGURED",
            configured: false,
          },
          { status: 503 }
        );
      }

      const cancelRes = await cancelPersistentTour(id, reason, body.expectedLastUpdated);
      if (!cancelRes.success) {
        if (cancelRes.conflict) {
          return NextResponse.json(
            {
              success: false,
              error: cancelRes.error,
              code: "CONCURRENCY_CONFLICT",
              currentTour: cancelRes.currentTour,
            },
            { status: 409 }
          );
        }
        const status = cancelRes.code === "NOT_FOUND" ? 404 : 500;
        return NextResponse.json(
          { success: false, error: cancelRes.error, code: cancelRes.code },
          { status }
        );
      }

      return NextResponse.json({
        success: true,
        tour: cancelRes.data,
        message: "Tour has been cancelled in database.",
      });
    }

    return NextResponse.json(
      { success: false, error: `Unsupported action: '${action}'. Expected 'cancel'.` },
      { status: 400 }
    );
  } catch (err) {
    console.error("POST /api/operations/tours/[id] error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error executing action." },
      { status: 500 }
    );
  }
}
