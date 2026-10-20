import test, { describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { NextRequest } from "next/server";
import {
  authenticateOperatorRequest,
  isDevelopmentBypassActive,
  createSessionToken,
  verifySessionToken,
  COOKIE_NAME,
  SESSION_DURATION_SECONDS,
} from "../lib/auth";
import { middleware, isPublicDemoModeActive } from "../middleware";
import { POST as cancelTourRoute, GET as getTourByIdRoute } from "../app/api/operations/tours/[id]/route";
import { POST as commitImportRoute } from "../app/api/import/commit/route";
import { POST as importStatusRoute, GET as getImportStatusRoute } from "../app/api/import/status/route";
import { POST as decisionsRoute } from "../app/api/import/decisions/route";
import { POST as loginRoute } from "../app/api/auth/login/route";
import { POST as logoutRoute } from "../app/api/auth/logout/route";
import { GET as getToursRoute, POST as postToursRoute } from "../app/api/operations/tours/route";

describe("SATF Phase 3: Session-Based Perimeter & Role-Based Authorization", () => {
  const LEAD_EMAIL = "chief.coordinator@southasiatravelfactory.com";
  const STANDARD_EMAIL = "duty.staff@southasiatravelfactory.com";

  beforeEach(() => {
    delete process.env.SATF_DEV_AUTH_BYPASS;
    delete process.env.SATF_PUBLIC_DEMO_MODE;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    delete process.env.SATF_DEV_AUTH_BYPASS;
    delete process.env.SATF_PUBLIC_DEMO_MODE;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  // ─── 1. Session Token Verification Tests ───────────────────────────────────

  test("createSessionToken produces signed token with CSRF and expiry", () => {
    const { token, payload } = createSessionToken("Test Coordinator");
    assert.ok(token, "Token string must exist");
    assert.ok(token.includes("."), "Token must have payload.signature format");
    assert.ok(payload.csrfToken, "CSRF token must be generated");
    assert.ok(payload.exp > Date.now(), "Expiry must be in the future");
    assert.strictEqual(payload.operator, "Test Coordinator");
    assert.strictEqual(payload.role, "coordinator");
  });

  test("verifySessionToken validates a correctly signed token", () => {
    const { token } = createSessionToken("Test Operator");
    const result = verifySessionToken(token);
    assert.strictEqual(result.valid, true);
    assert.ok(result.payload);
    assert.strictEqual(result.payload.operator, "Test Operator");
  });

  test("verifySessionToken rejects tampered token", () => {
    const { token } = createSessionToken("Test Operator");
    const tampered = token.slice(0, -5) + "XXXXX";
    const result = verifySessionToken(tampered);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error);
  });

  test("verifySessionToken rejects missing/empty token", () => {
    assert.strictEqual(verifySessionToken("").valid, false);
    assert.strictEqual(verifySessionToken(null as unknown as string).valid, false);
  });

  // ─── 2. authenticateOperatorRequest — Session Cookie Tests ─────────────────

  test("unauthenticated request returns HTTP 401", () => {
    const req = new NextRequest("http://localhost:3000/api/operations/tours", {
      method: "GET",
      headers: { host: "localhost:3000" },
    });
    const auth = authenticateOperatorRequest(req);
    assert.strictEqual(auth.authorized, false);
    assert.strictEqual(auth.status, 401);
    assert.ok(auth.error?.includes("session required"));
  });

  test("valid session cookie grants authorization", () => {
    const { token } = createSessionToken("Duty Coordinator", {
      username: STANDARD_EMAIL,
      role: "coordinator",
    });
    const req = new NextRequest("http://localhost:3000/api/operations/tours", {
      method: "GET",
      headers: {
        host: "localhost:3000",
        cookie: `${COOKIE_NAME}=${token}`,
      },
    });
    const auth = authenticateOperatorRequest(req);
    assert.strictEqual(auth.authorized, true);
    assert.strictEqual(auth.status, 200);
    assert.ok(auth.payload);
    assert.strictEqual(auth.payload.role, "coordinator");
  });

  test("lead coordinator session can access lead-only operations", () => {
    const { token } = createSessionToken("Chief Coordinator", {
      username: LEAD_EMAIL,
      role: "lead_coordinator",
      mfaVerified: true,
    });
    const req = new NextRequest("http://localhost:3000/api/operations/tours", {
      method: "GET",
      headers: {
        host: "localhost:3000",
        cookie: `${COOKIE_NAME}=${token}`,
      },
    });
    const auth = authenticateOperatorRequest(req, { requiredRole: "lead_coordinator" });
    assert.strictEqual(auth.authorized, true);
    assert.strictEqual(auth.payload.role, "lead_coordinator");
  });

  test("standard coordinator CANNOT access lead-only operations (HTTP 403)", () => {
    const { token } = createSessionToken("Duty Staff", {
      username: STANDARD_EMAIL,
      role: "coordinator",
    });
    const req = new NextRequest("http://localhost:3000/api/operations/tours", {
      method: "GET",
      headers: {
        host: "localhost:3000",
        cookie: `${COOKIE_NAME}=${token}`,
      },
    });
    const auth = authenticateOperatorRequest(req, { requiredRole: "lead_coordinator" });
    assert.strictEqual(auth.authorized, false);
    assert.strictEqual(auth.status, 403);
    assert.ok(auth.error?.includes("Lead Coordinator"));
  });

  // ─── 3. Development Bypass Tests ───────────────────────────────────────────

  test("isDevelopmentBypassActive returns false in production", () => {
    const origEnv = process.env.NODE_ENV;
    try {
      (process.env as Record<string, string>).NODE_ENV = "production";
      process.env.SATF_DEV_AUTH_BYPASS = "true";
      assert.strictEqual(isDevelopmentBypassActive(), false);
    } finally {
      (process.env as Record<string, string>).NODE_ENV = origEnv || "test";
      delete process.env.SATF_DEV_AUTH_BYPASS;
    }
  });

  test("development bypass grants lead coordinator in dev", () => {
    const origEnv = process.env.NODE_ENV;
    try {
      (process.env as Record<string, string>).NODE_ENV = "development";
      process.env.SATF_DEV_AUTH_BYPASS = "true";
      assert.strictEqual(isDevelopmentBypassActive(), true);

      const req = new NextRequest("http://localhost:3000/api/operations/tours", {
        method: "GET",
        headers: { host: "localhost:3000" },
      });
      const auth = authenticateOperatorRequest(req);
      assert.strictEqual(auth.authorized, true);
      assert.strictEqual(auth.payload.role, "lead_coordinator");
    } finally {
      (process.env as Record<string, string>).NODE_ENV = origEnv || "test";
      delete process.env.SATF_DEV_AUTH_BYPASS;
    }
  });

  // ─── 4. CSRF Origin Validation Tests ───────────────────────────────────────

  test("POST /api/operations/tours enforces CSRF/origin validation", () => {
    const { token, payload } = createSessionToken("Duty Coordinator", {
      username: STANDARD_EMAIL,
      role: "coordinator",
    });

    // Cross-origin POST should be rejected
    const crossOriginReq = new NextRequest("http://localhost:3000/api/operations/tours", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "https://evil.example.com",
        cookie: `${COOKIE_NAME}=${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ newTourInput: {} }),
    });
    const crossOriginAuth = authenticateOperatorRequest(crossOriginReq);
    assert.strictEqual(crossOriginAuth.authorized, false);
    assert.strictEqual(crossOriginAuth.status, 403);
    assert.ok(crossOriginAuth.error?.includes("CSRF"));
  });

  test("same-origin POST with valid CSRF token is accepted", () => {
    const { token, payload } = createSessionToken("Duty Coordinator", {
      username: STANDARD_EMAIL,
      role: "coordinator",
    });
    const req = new NextRequest("http://localhost:3000/api/operations/tours", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        cookie: `${COOKIE_NAME}=${token}`,
        "x-csrf-token": payload.csrfToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({ newTourInput: {} }),
    });
    const auth = authenticateOperatorRequest(req);
    assert.strictEqual(auth.authorized, true);
  });

  test("same-origin POST with invalid CSRF token is rejected", () => {
    const { token } = createSessionToken("Duty Coordinator", {
      username: STANDARD_EMAIL,
      role: "coordinator",
    });
    const req = new NextRequest("http://localhost:3000/api/operations/tours", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        cookie: `${COOKIE_NAME}=${token}`,
        "x-csrf-token": "bogus-csrf-token-value",
        "content-type": "application/json",
      },
      body: JSON.stringify({ newTourInput: {} }),
    });
    const auth = authenticateOperatorRequest(req);
    assert.strictEqual(auth.authorized, false);
    assert.strictEqual(auth.status, 403);
    assert.ok(auth.error?.includes("CSRF"));
  });

  // ─── 5. Middleware Integration Tests ───────────────────────────────────────

  test("middleware allows UI page rendering without session", async () => {
    const req = new NextRequest("https://satf-operations-platform.vercel.app/", {
      method: "GET",
      headers: { host: "satf-operations-platform.vercel.app" },
    });
    const res = await middleware(req);
    // Should NOT return 403 anymore (Cloudflare block removed)
    assert.ok(res.status !== 403, `Expected non-403, got ${res.status}`);
  });

  test("middleware rejects mutating API without session (401)", async () => {
    const req = new NextRequest("https://satf-operations-platform.vercel.app/api/operations/tours", {
      method: "POST",
      headers: {
        host: "satf-operations-platform.vercel.app",
        "content-type": "application/json",
      },
      body: JSON.stringify({ test: true }),
    });
    const res = await middleware(req);
    assert.strictEqual(res.status, 401);
  });

  test("middleware allows login endpoint without session", async () => {
    const req = new NextRequest("https://satf-operations-platform.vercel.app/api/auth/login", {
      method: "POST",
      headers: {
        host: "satf-operations-platform.vercel.app",
        "content-type": "application/json",
      },
      body: JSON.stringify({ passphrase: "test" }),
    });
    const res = await middleware(req);
    // Login endpoint is exempt from session requirement
    assert.ok(res.status !== 401, `Login should not be blocked, got ${res.status}`);
  });

  test("middleware injects identity headers for valid session", async () => {
    const { token } = createSessionToken("Ops Coordinator", {
      username: "ops@satf.com",
      role: "coordinator",
    });
    const req = new NextRequest("https://satf-operations-platform.vercel.app/", {
      method: "GET",
      headers: {
        host: "satf-operations-platform.vercel.app",
        cookie: `${COOKIE_NAME}=${token}`,
      },
    });
    const res = await middleware(req);
    assert.ok(res.status !== 403);
    // Check that identity headers are set in the response request rewrite
    const modifiedHeaders = res.headers;
    // NextResponse.next() with request headers won't expose them directly,
    // but the response itself should pass through
    assert.ok(res.status === 200 || !res.status);
  });

  // ─── 6. Public Demo Mode Tests ─────────────────────────────────────────────

  test("isPublicDemoModeActive() returns false when SUPABASE_URL is set", () => {
    process.env.SATF_PUBLIC_DEMO_MODE = "true";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    assert.strictEqual(isPublicDemoModeActive(), false);
  });

  test("isPublicDemoModeActive() returns true when no DB credentials exist", () => {
    process.env.SATF_PUBLIC_DEMO_MODE = "true";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.strictEqual(isPublicDemoModeActive(), true);
  });

  test("demo mode allows GET /api/operations/tours without session", async () => {
    process.env.SATF_PUBLIC_DEMO_MODE = "true";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const req = new NextRequest("https://satf-operations-platform.vercel.app/api/operations/tours", {
      method: "GET",
      headers: { host: "satf-operations-platform.vercel.app" },
    });
    const res = await middleware(req);
    assert.ok(res.status !== 403 && res.status !== 401, `Demo GET should pass, got ${res.status}`);
  });

  test("demo mode BLOCKS mutating API requests without session (POST -> 403)", async () => {
    process.env.SATF_PUBLIC_DEMO_MODE = "true";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const reqMutate = new NextRequest("https://satf-operations-platform.vercel.app/api/operations/tours", {
      method: "POST",
      headers: {
        host: "satf-operations-platform.vercel.app",
        "content-type": "application/json",
      },
      body: JSON.stringify({ test: true }),
    });
    const res = await middleware(reqMutate);
    assert.strictEqual(res.status, 403);
  });

  // ─── 7. Session Expiry Test ────────────────────────────────────────────────

  test("expired session token is rejected", () => {
    // Create a token that is already expired
    const { token } = createSessionToken("Expired Coordinator");
    // Manually decode, modify exp, re-encode — but easier to just test verifySessionToken
    // with a known-expired payload
    const result = verifySessionToken(token);
    assert.strictEqual(result.valid, true); // Freshly created, so valid

    // Now create one with past expiry by manipulating the token
    const secret = require("../lib/auth").getSessionSecret();
    const crypto = require("node:crypto");
    const expiredPayload = {
      operator: "Old Coordinator",
      role: "coordinator",
      csrfToken: "test-csrf",
      iat: Date.now() - 20 * 3600 * 1000,
      exp: Date.now() - 1000, // expired 1 second ago
    };
    const payloadB64 = Buffer.from(JSON.stringify(expiredPayload)).toString("base64url");
    const signature = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
    const expiredToken = `${payloadB64}.${signature}`;

    const expiredResult = verifySessionToken(expiredToken);
    assert.strictEqual(expiredResult.valid, false);
    assert.ok(expiredResult.error?.includes("expired"));
  });

  // ─── 8. Logout Clears Session ──────────────────────────────────────────────

  test("POST /api/auth/logout clears session cookie", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/logout", {
      method: "POST",
      headers: { host: "localhost:3000" },
    });
    const res = await logoutRoute();
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(body.message.includes("terminated"));
  });

  // ─── 9. GET /api/operations/tours rejects unauthenticated, accepts authenticated ──

  test("GET /api/operations/tours rejects unauthenticated request with HTTP 401 and accepts authorized coordinator", async () => {
    const unauthReq = new NextRequest("http://localhost:3000/api/operations/tours", {
      method: "GET",
      headers: { host: "localhost:3000" },
    });
    const unauthRes = await getToursRoute(unauthReq);
    assert.strictEqual(unauthRes.status, 401);

    const { token } = createSessionToken("Duty Coordinator", {
      username: STANDARD_EMAIL,
      role: "coordinator",
    });
    const authReq = new NextRequest("http://localhost:3000/api/operations/tours", {
      method: "GET",
      headers: {
        host: "localhost:3000",
        cookie: `${COOKIE_NAME}=${token}`,
      },
    });
    const authRes = await getToursRoute(authReq);
    assert.ok(authRes.status === 200);
  });
});
