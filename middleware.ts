import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth-constants";

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

export function isPublicDemoModeActive(): boolean {
  if (process.env.SATF_PUBLIC_DEMO_MODE !== "true") {
    return false;
  }
  // Safety check: Cannot be active if production database credentials are present
  // to ensure real passenger/operational records are never exposed without authentication.
  if (process.env.SUPABASE_URL || process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      "SECURITY VIOLATION: SATF_PUBLIC_DEMO_MODE cannot be enabled when database credentials are present. Failing closed."
    );
    return false;
  }
  return true;
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const isDemo = isPublicDemoModeActive();

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

  // 3. Extract application session token from cookie
  const sessionCookie = req.cookies.get(COOKIE_NAME)?.value;

  // 4. Public Demo Mode Boundary:
  if (isDemo) {
    // A. All mutating operations (POST, PUT, DELETE, PATCH) on ANY /api route MUST require authentication
    if (pathname.startsWith("/api/")) {
      if (req.method !== "GET" && req.method !== "HEAD") {
        if (!sessionCookie) {
          return NextResponse.json(
            {
              success: false,
              error: "Forbidden: Mutation operations are disabled in demo mode and require authorized SATF credentials.",
            },
            { status: 403 }
          );
        }
      }

      // B. Sensitive import and administrative APIs strictly require authentication even in demo mode
      if (pathname.startsWith("/api/import/") && !sessionCookie) {
        return NextResponse.json(
          {
            success: false,
            error: "Unauthorized: Import operations require authorized SATF credentials.",
          },
          { status: 401 }
        );
      }
    }

    // C. Public HTML UI pages and safe read-only demo assets pass through without session
    if (!sessionCookie) {
      return NextResponse.next({
        request: { headers: requestHeaders },
      });
    }
  }

  // 5. Production Session Protection:
  // Mutating API requests require a valid session cookie.
  // Login endpoint is exempt so operators can authenticate.
  if (!isDemo && pathname.startsWith("/api/")) {
    const isLoginEndpoint = pathname === "/api/auth/login";
    const isSessionEndpoint = pathname === "/api/auth/session";
    const isMutating = req.method !== "GET" && req.method !== "HEAD";

    if (isMutating && !isLoginEndpoint && !sessionCookie) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized: Staff session required. Please log in.",
        },
        { status: 401 }
      );
    }

    // For GET API requests without session (e.g. /api/auth/session), let the route handler decide
    if (!sessionCookie && !isLoginEndpoint && !isSessionEndpoint && pathname !== "/api/auth/logout") {
      // Allow through — route handlers call authenticateOperatorRequest() which will reject if needed
    }
  }

  // 6. If session cookie is present, extract claims and inject identity headers downstream
  if (sessionCookie) {
    try {
      const [payloadB64] = sessionCookie.split(".");
      if (payloadB64) {
        const jsonStr = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
        const payload = JSON.parse(jsonStr);
        if (payload && payload.exp && Date.now() < payload.exp) {
          requestHeaders.set("x-satf-verified-email", payload.username || payload.operator);
          requestHeaders.set("x-satf-verified-role", payload.role || "coordinator");
          requestHeaders.set("x-satf-internal-trusted", "true");
        }
      }
    } catch {
      // Malformed cookie — downstream route handlers will reject via authenticateOperatorRequest
    }
  }

  // 7. Allow UI page rendering. Authentication enforcement for data is handled by API route handlers.
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}
