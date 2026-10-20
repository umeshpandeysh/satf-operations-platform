import { NextRequest, NextResponse } from "next/server";
import { authenticateOperatorRequest } from "@/lib/auth";
import {
  testEmailGatewayConnection,
  fetchInboundIssues,
} from "@/lib/email-issues";

export const dynamic = "force-dynamic";

/**
 * GET /api/issues
 * Returns inbound email issues with pagination and authentic gateway status.
 *
 * Query Params:
 *  - page: number (default 1)
 *  - pageSize: number (default 20, max 100)
 *  - check: "test" | "sync"
 */
export async function GET(req: NextRequest) {
  try {
    const auth = authenticateOperatorRequest(req, { checkCsrf: false });
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error || "Authentication required." },
        { status: auth.status }
      );
    }

    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");
    const page = parseInt(searchParams.get("page") || "1", 10) || 1;
    const pageSize = parseInt(searchParams.get("pageSize") || "20", 10) || 20;

    if (action === "test_connection") {
      const status = await testEmailGatewayConnection();
      return NextResponse.json({
        success: true,
        gateway: status,
      });
    }

    // Call genuine message retrieval
    const result = await fetchInboundIssues({ page, pageSize });

    return NextResponse.json({
      success: true,
      gateway: result.gateway,
      issues: result.issues,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to retrieve issues.";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/issues
 * Performs an on-demand connection verification test against configured provider.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = authenticateOperatorRequest(req, { checkCsrf: true });
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error || "Authentication required." },
        { status: auth.status }
      );
    }

    const gatewayStatus = await testEmailGatewayConnection();

    return NextResponse.json({
      success: true,
      gateway: gatewayStatus,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to test email gateway connection.";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
