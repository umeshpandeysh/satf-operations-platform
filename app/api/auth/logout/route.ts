import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, verifySessionToken, revokeSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req?: NextRequest) {
  try {
    const sessionCookie = req?.cookies?.get(COOKIE_NAME)?.value;
    if (sessionCookie) {
      const verification = verifySessionToken(sessionCookie);
      if (verification.valid && verification.payload?.jti) {
        await revokeSession(verification.payload.jti, verification.payload.exp);
      }
    }
  } catch (err) {
    console.error("Error revoking session during logout:", err);
  }

  const response = NextResponse.json({
    success: true,
    message: "Operator session terminated.",
  });

  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });

  return response;
}
