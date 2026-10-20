import { NextRequest, NextResponse } from "next/server";
import { verifyCloudflareAccessJwt } from "@/lib/gateway-jwt";

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt
     * - public assets (/brand/*, /satf-logo.png, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|satf-logo.png|satf-logo-raw.png|apple-touch-icon.png|favicon-64.png|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

function isDevBypassActive(): boolean {
  if (process.env.NODE_ENV === "production") {
    // Under no circumstances can development bypass be active in production
    return false;
  }
  return process.env.SATF_DEV_AUTH_BYPASS === "true";
}

export async function middleware(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const pathname = req.nextUrl.pathname;

  // 1. Strip any client-supplied internal verification headers to prevent spoofing
  const requestHeaders = new Headers(req.headers);
  requestHeaders.delete("x-satf-verified-email");
  requestHeaders.delete("x-satf-verified-role");
  requestHeaders.delete("x-satf-internal-trusted");

  // 2. Check development-only bypass (strictly disabled in production)
  if (isDevBypassActive()) {
    requestHeaders.set("x-satf-verified-email", "dev.coordinator@southasiatravelfactory.com");
    requestHeaders.set("x-satf-verified-role", "lead_coordinator");
    requestHeaders.set("x-satf-internal-trusted", "true");
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  // 3. Direct Vercel Origin Protection:
  // Reject direct requests to *.vercel.app unless arriving with valid gateway credentials
  const token =
    req.headers.get("cf-access-jwt-assertion") ||
    req.cookies.get("CF_Authorization")?.value;

  if (host.endsWith(".vercel.app") && !token) {
    return NextResponse.json(
      {
        success: false,
        error: "Forbidden: Direct access via vercel.app origin is prohibited. Requests must route through SATF Zero Trust Gateway.",
      },
      { status: 403 }
    );
  }

  // 4. Verify Cloudflare Access JWT assertion
  const verification = await verifyCloudflareAccessJwt(token);

  if (!verification.valid || !verification.identity) {
    const status = verification.statusCode || 401;
    const errorMessage = verification.error || "Unauthorized: Access restricted to authorized SATF Zero Trust Gateway.";

    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, error: errorMessage },
        { status }
      );
    }

    // For HTML page requests, return an unauthorized status response
    return new NextResponse(
      `<!DOCTYPE html><html><head><title>401 Unauthorized — SATF Operations</title></head><body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc;"><div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 32px; max-width: 480px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.05);"><h1 style="font-size: 18px; color: #0f172a; margin-bottom: 8px;">SATF Zero Trust Gateway Required</h1><p style="font-size: 13px; color: #64748b; line-height: 1.5;">${errorMessage}</p><p style="font-size: 11px; color: #94a3b8; margin-top: 16px;">South Asia Travel Factory Pvt. Ltd. · Ground Operations</p></div></body></html>`,
      {
        status,
        headers: { "Content-Type": "text/html" },
      }
    );
  }

  // 5. Inject verified identity headers downstream for route handlers
  requestHeaders.set("x-satf-verified-email", verification.identity.email);
  requestHeaders.set("x-satf-internal-trusted", "true");

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}
