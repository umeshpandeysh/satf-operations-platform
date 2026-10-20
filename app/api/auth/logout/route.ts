import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const teamName = process.env.CF_ACCESS_TEAM_NAME;
  const response = NextResponse.json({
    success: true,
    message: "Operator session terminated.",
    gatewayLogoutUrl: teamName
      ? `https://${teamName}.cloudflareaccess.com/cdn-cgi/access/logout`
      : undefined,
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
