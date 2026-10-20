import { NextRequest, NextResponse } from "next/server";
import {
  getPassphraseRole,
  verifyCoordinatorCredentials,
  createSessionToken,
  recordFailedAttempt,
  resetRateLimit,
  checkRateLimit,
  getSessionCookieConfig,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
    const rateCheck = checkRateLimit(ip);

    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Too many failed login attempts. Account temporarily locked for ${rateCheck.retryAfterSeconds} seconds.`,
          retryAfterSeconds: rateCheck.retryAfterSeconds,
        },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { passphrase, operatorName, username, mfaCode } = body;

    if (!passphrase || typeof passphrase !== "string") {
      return NextResponse.json(
        { success: false, error: "Operator passphrase is required." },
        { status: 400 }
      );
    }

    let sessionOperator = operatorName || "Duty Dispatcher";
    let sessionUsername: string | undefined;
    let sessionRole: string | undefined;
    let mfaVerified = false;

    if (username && typeof username === "string" && username.trim()) {
      const coordAuth = verifyCoordinatorCredentials(username.trim(), passphrase, mfaCode);
      if (!coordAuth.success) {
        const record = recordFailedAttempt(ip);
        return NextResponse.json(
          {
            success: false,
            mfaRequired: coordAuth.mfaRequired ?? false,
            error: coordAuth.error || "Authentication failed.",
            remainingAttempts: record.remainingAttempts,
          },
          { status: coordAuth.mfaRequired ? 403 : 401 }
        );
      }
      sessionOperator = coordAuth.user?.name || sessionOperator;
      sessionUsername = coordAuth.user?.username;
      sessionRole = coordAuth.user?.role;
      mfaVerified = Boolean(coordAuth.user?.totpSecret);
    } else {
      const verifiedRole = getPassphraseRole(passphrase);
      if (!verifiedRole) {
        const record = recordFailedAttempt(ip);
        return NextResponse.json(
          {
            success: false,
            error: record.allowed
              ? `Invalid passphrase. ${record.remainingAttempts} attempts remaining.`
              : `Too many failed login attempts. Locked out for ${record.retryAfterSeconds} seconds.`,
            remainingAttempts: record.remainingAttempts,
          },
          { status: 401 }
        );
      }
      sessionRole = verifiedRole;
      sessionOperator = verifiedRole === "lead_coordinator"
        ? (operatorName || "Lead Coordinator")
        : (operatorName || "Duty Coordinator");
    }

    // Passphrase valid -> reset attempts and issue session
    resetRateLimit(ip);
    const session = createSessionToken(sessionOperator, {
      username: sessionUsername,
      role: sessionRole,
      mfaVerified,
    });
    const cookieConfig = getSessionCookieConfig();

    const response = NextResponse.json({
      success: true,
      operator: session.payload.operator,
      username: session.payload.username,
      role: session.payload.role,
      mfaVerified: session.payload.mfaVerified,
      csrfToken: session.payload.csrfToken,
      expiresAt: new Date(session.payload.exp).toISOString(),
    });

    response.cookies.set(cookieConfig.name, session.token, cookieConfig.options);
    return response;
  } catch (err) {
    console.error("Auth login error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
