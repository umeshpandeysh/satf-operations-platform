import { NextRequest, NextResponse } from "next/server";
import { authenticateOperatorRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = authenticateOperatorRequest(req, { checkCsrf: false });

  if (!auth.authorized || !auth.payload) {
    return NextResponse.json({
      authenticated: false,
    });
  }

  return NextResponse.json({
    authenticated: true,
    operator: auth.payload.operator,
    username: auth.payload.username,
    role: auth.payload.role || "coordinator",
    mfaVerified: auth.payload.mfaVerified ?? false,
    csrfToken: auth.payload.csrfToken,
    expiresAt: new Date(auth.payload.exp).toISOString(),
  });
}
