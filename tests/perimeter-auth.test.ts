import test, { describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import crypto from "node:crypto";
import { NextRequest } from "next/server";
import {
  registerTestJwksKey,
  clearJwksCache,
  verifyCloudflareAccessJwt,
} from "../lib/gateway-jwt";
import { verifyCloudflareAccessJwtSync } from "../lib/gateway-jwt-sync";
import {
  authenticateOperatorRequest,
  isDevelopmentBypassActive,
} from "../lib/auth";
import { middleware, isPublicDemoModeActive } from "../middleware";
import { POST as cancelTourRoute, GET as getTourByIdRoute } from "../app/api/operations/tours/[id]/route";
import { POST as commitImportRoute } from "../app/api/import/commit/route";
import { POST as importStatusRoute, GET as getImportStatusRoute } from "../app/api/import/status/route";
import { POST as decisionsRoute } from "../app/api/import/decisions/route";
import { POST as loginRoute } from "../app/api/auth/login/route";
import { POST as logoutRoute } from "../app/api/auth/logout/route";
import { GET as getToursRoute, POST as postToursRoute } from "../app/api/operations/tours/route";

describe("SATF Phase 3: Zero-Trust Perimeter & Role-Based Authorization", () => {
  // Generate synthetic RSA keypair for cryptographic testing
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });

  const TEST_KID = "test-key-satf-2026-v1";
  const TEST_TEAM = "satf-test-team";
  const TEST_AUD = "satf-application-aud-tag-1234567890abcdef";
  const LEAD_EMAIL = "chief.coordinator@southasiatravelfactory.com";
  const STANDARD_EMAIL = "duty.staff@southasiatravelfactory.com";
  const UNKNOWN_EMAIL = "intruder@external-unauthorized-domain.com";

  // Helper to mint synthetic RS256 Cloudflare Access JWTs
  function mintTestJwt(
    claims: {
      email?: string;
      sub?: string;
      iss?: string;
      aud?: string | string[];
      exp?: number;
      iat?: number;
      nbf?: number;
      kid?: string;
    } = {},
    signingKey: crypto.KeyObject = privateKey,
    alterSignature = false
  ): string {
    const kid = claims.kid || TEST_KID;
    const header = { alg: "RS256", kid, typ: "JWT" };
    const now = Math.floor(Date.now() / 1000);

    const payload = {
      iss: claims.iss || `https://${TEST_TEAM}.cloudflareaccess.com`,
      aud: claims.aud || TEST_AUD,
      email: claims.email || STANDARD_EMAIL,
      sub: claims.sub || claims.email || STANDARD_EMAIL,
      iat: claims.iat || now - 60,
      exp: claims.exp || now + 3600,
      nbf: claims.nbf || now - 60,
    };

    const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const dataToSign = `${headerB64}.${payloadB64}`;

    const signer = crypto.createSign("RSA-SHA256");
    signer.update(dataToSign);
    let signatureB64 = signer.sign(signingKey, "base64url");

    if (alterSignature) {
      signatureB64 = signatureB64.slice(0, -6) + "TAMPER";
    }

    return `${headerB64}.${payloadB64}.${signatureB64}`;
  }

  beforeEach(() => {
    clearJwksCache();
    // Register the test public key in the JWKS test registry
    const jwk = publicKey.export({ format: "jwk" }) as JsonWebKey;
    registerTestJwksKey(TEST_KID, jwk, TEST_TEAM);

    process.env.CF_ACCESS_TEAM_NAME = TEST_TEAM;
    process.env.CF_ACCESS_AUD = TEST_AUD;
    process.env.SATF_LEAD_COORDINATOR_EMAILS = LEAD_EMAIL;
    process.env.SATF_AUTHORIZED_COORDINATOR_EMAILS = STANDARD_EMAIL;
    delete process.env.SATF_DEV_AUTH_BYPASS;
  });

  afterEach(() => {
    clearJwksCache();
    delete process.env.CF_ACCESS_TEAM_NAME;
    delete process.env.CF_ACCESS_AUD;
    delete process.env.SATF_LEAD_COORDINATOR_EMAILS;
    delete process.env.SATF_AUTHORIZED_COORDINATOR_EMAILS;
    delete process.env.SATF_DEV_AUTH_BYPASS;
  });

  // ─── 1. Cryptographic JWT Verification Tests ───────────────────────────────────

  test("missing JWT assertion returns HTTP 401", async () => {
    const res = await verifyCloudflareAccessJwt(null);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.statusCode, 401);
    assert.ok(res.error?.includes("Missing Cloudflare Access JWT"));
  });

  test("malformed JWT assertion returns HTTP 401", async () => {
    const res = await verifyCloudflareAccessJwt("not.a.valid.jwt.payload");
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.statusCode, 401);
  });

  test("expired JWT assertion (exp in past) returns HTTP 401", async () => {
    const expiredJwt = mintTestJwt({
      exp: Math.floor(Date.now() / 1000) - 120, // Expired 2 minutes ago
    });
    const res = await verifyCloudflareAccessJwt(expiredJwt);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.statusCode, 401);
    assert.ok(res.error?.includes("expired"));
  });

  test("tampered JWT signature returns HTTP 401", async () => {
    const tamperedJwt = mintTestJwt({}, privateKey, true);
    const res = await verifyCloudflareAccessJwt(tamperedJwt);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.statusCode, 401);
    assert.ok(res.error?.includes("signature"));
  });

  test("JWT signed with unknown key ID returns HTTP 401", async () => {
    const unknownKidJwt = mintTestJwt({ kid: "unregistered-key-id-999" });
    const res = await verifyCloudflareAccessJwt(unknownKidJwt);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.statusCode, 401);
    assert.ok(res.error?.includes("Public certificate not found"));
  });

  test("JWT with wrong issuer returns HTTP 401", async () => {
    const wrongIssuerJwt = mintTestJwt({
      iss: "https://evil-unauthorized-team.cloudflareaccess.com",
    });
    const res = await verifyCloudflareAccessJwt(wrongIssuerJwt);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.statusCode, 401);
    assert.ok(res.error?.includes("issuer mismatch"));
  });

  test("JWT with wrong audience tag returns HTTP 401", async () => {
    const wrongAudJwt = mintTestJwt({
      aud: "different-unauthorized-app-aud-456",
    });
    const res = await verifyCloudflareAccessJwt(wrongAudJwt);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.statusCode, 401);
    assert.ok(res.error?.includes("audience mismatch"));
  });

  test("valid JWT assertion returns valid: true with authentic identity", async () => {
    const validJwt = mintTestJwt({ email: STANDARD_EMAIL });
    const res = await verifyCloudflareAccessJwt(validJwt);
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.identity?.email, STANDARD_EMAIL);
  });

  // ─── 2. Header Spoofing & Origin Bypass Tests ─────────────────────────────────

  test("forged identity headers without signed JWT assertion are rejected with 401", async () => {
    const req = new NextRequest("http://localhost:3000/api/operations/tours", {
      headers: {
        host: "localhost:3000",
        "x-satf-verified-email": LEAD_EMAIL,
        "x-satf-verified-role": "lead_coordinator",
      },
    });

    // In middleware, spoofed headers are stripped and request is rejected
    const mwRes = await middleware(req);
    assert.strictEqual(mwRes.status, 401);

    // In direct route auth, request lacking valid JWT is rejected
    const authRes = authenticateOperatorRequest(req);
    assert.strictEqual(authRes.authorized, false);
    assert.strictEqual(authRes.status, 401);
  });

  test("direct access to .vercel.app host without gateway assertion returns HTTP 403", async () => {
    const req = new NextRequest("https://satf-ops-preview.vercel.app/api/operations/tours", {
      headers: {
        host: "satf-ops-preview.vercel.app",
      },
    });

    const mwRes = await middleware(req);
    assert.strictEqual(mwRes.status, 403);
    const body = await mwRes.json();
    assert.ok(body.error?.includes("vercel.app origin is prohibited"));
  });

  // ─── 3. Least-Privilege Authorization & Role Enforcement ───────────────────────

  test("unauthorized domain identity returns HTTP 403 Forbidden", () => {
    const untrustedJwt = mintTestJwt({ email: UNKNOWN_EMAIL });
    const req = new NextRequest("http://localhost:3000/api/operations/tours", {
      headers: {
        host: "localhost:3000",
        "cf-access-jwt-assertion": untrustedJwt,
      },
    });

    const res = authenticateOperatorRequest(req);
    assert.strictEqual(res.authorized, false);
    assert.strictEqual(res.status, 403);
    assert.ok(res.error?.includes("not an authorized SATF operator"));
  });

  test("standard coordinator can read tours and perform ordinary mutations", () => {
    const standardJwt = mintTestJwt({ email: STANDARD_EMAIL });
    const req = new NextRequest("http://localhost:3000/api/operations/tours", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "cf-access-jwt-assertion": standardJwt,
      },
    });

    const res = authenticateOperatorRequest(req, { requiredRole: "coordinator" });
    assert.strictEqual(res.authorized, true);
    assert.strictEqual(res.payload.role, "coordinator");
    assert.strictEqual(res.payload.username, STANDARD_EMAIL);
  });

  test("standard coordinator CANNOT cancel tours (POST /api/operations/tours/[id] returns 403)", async () => {
    const standardJwt = mintTestJwt({ email: STANDARD_EMAIL });
    const req = new NextRequest("http://localhost:3000/api/operations/tours/satf-30202", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "cf-access-jwt-assertion": standardJwt,
        "content-type": "application/json",
      },
      body: JSON.stringify({ action: "cancel", reason: "Operational change of plan" }),
    });

    const res = await cancelTourRoute(req, { params: Promise.resolve({ id: "satf-30202" }) });
    assert.strictEqual(res.status, 403);
    const body = await res.json();
    assert.ok(body.error?.includes("Lead Coordinator privileges"));
  });

  test("standard coordinator CANNOT commit workbook imports (POST /api/import/commit returns 403)", async () => {
    const standardJwt = mintTestJwt({ email: STANDARD_EMAIL });
    const req = new NextRequest("http://localhost:3000/api/import/commit", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "cf-access-jwt-assertion": standardJwt,
        "content-type": "application/json",
      },
      body: JSON.stringify({ tours: [] }),
    });

    const res = await commitImportRoute(req);
    assert.strictEqual(res.status, 403);
    const body = await res.json();
    assert.ok(body.error?.includes("Lead Coordinator privileges"));
  });

  test("standard coordinator CANNOT clear canonical dataset (POST /api/import/status with action:clear returns 403)", async () => {
    const standardJwt = mintTestJwt({ email: STANDARD_EMAIL });
    const req = new NextRequest("http://localhost:3000/api/import/status", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "cf-access-jwt-assertion": standardJwt,
        "content-type": "application/json",
      },
      body: JSON.stringify({ action: "clear" }),
    });

    const res = await importStatusRoute(req);
    assert.strictEqual(res.status, 403);
    const body = await res.json();
    assert.ok(body.error?.includes("Lead Coordinator privileges"));
  });

  test("standard coordinator CANNOT save date decisions (POST /api/import/decisions returns 403)", async () => {
    const standardJwt = mintTestJwt({ email: STANDARD_EMAIL });
    const req = new NextRequest("http://localhost:3000/api/import/decisions", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "cf-access-jwt-assertion": standardJwt,
        "content-type": "application/json",
      },
      body: JSON.stringify({ decisions: [] }),
    });

    const res = await decisionsRoute(req);
    assert.strictEqual(res.status, 403);
    const body = await res.json();
    assert.ok(body.error?.includes("Lead Coordinator privileges"));
  });

  test("lead coordinator is granted full operational permissions", () => {
    const leadJwt = mintTestJwt({ email: LEAD_EMAIL });
    const req = new NextRequest("http://localhost:3000/api/operations/tours/satf-30202", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "cf-access-jwt-assertion": leadJwt,
      },
    });

    const res = authenticateOperatorRequest(req, { requiredRole: "lead_coordinator" });
    assert.strictEqual(res.authorized, true);
    assert.strictEqual(res.payload.role, "lead_coordinator");
    assert.strictEqual(res.payload.username, LEAD_EMAIL);
  });

  test("corporate-domain email absent from both allowlists receives HTTP 403", () => {
    const corpUnlistedJwt = mintTestJwt({ email: "unlisted.staff@southasiatravelfactory.com" });
    const req = new NextRequest("http://localhost:3000/api/operations/tours", {
      headers: {
        host: "localhost:3000",
        "cf-access-jwt-assertion": corpUnlistedJwt,
      },
    });

    const res = authenticateOperatorRequest(req);
    assert.strictEqual(res.authorized, false);
    assert.strictEqual(res.status, 403);
    assert.ok(res.error?.includes("not an authorized SATF operator"));
  });

  test("ST World corporate email absent from allowlist receives HTTP 403", () => {
    const stWorldUnlistedJwt = mintTestJwt({ email: "tokyo.desk@stworld.jp" });
    const req = new NextRequest("http://localhost:3000/api/operations/tours", {
      headers: {
        host: "localhost:3000",
        "cf-access-jwt-assertion": stWorldUnlistedJwt,
      },
    });

    const res = authenticateOperatorRequest(req);
    assert.strictEqual(res.authorized, false);
    assert.strictEqual(res.status, 403);
    assert.ok(res.error?.includes("not an authorized SATF operator"));
  });

  test("missing or empty allowlist configuration fails closed with HTTP 403", () => {
    delete process.env.SATF_AUTHORIZED_COORDINATOR_EMAILS;
    delete process.env.SATF_LEAD_COORDINATOR_EMAILS;

    const validJwt = mintTestJwt({ email: STANDARD_EMAIL });
    const req = new NextRequest("http://localhost:3000/api/operations/tours", {
      headers: {
        host: "localhost:3000",
        "cf-access-jwt-assertion": validJwt,
      },
    });

    const res = authenticateOperatorRequest(req);
    assert.strictEqual(res.authorized, false);
    assert.strictEqual(res.status, 403);
    assert.ok(res.error?.includes("not an authorized SATF operator"));
  });

  test("GET /api/import/status rejects unauthenticated access with HTTP 401", async () => {
    const req = new NextRequest("http://localhost:3000/api/import/status", {
      headers: { host: "localhost:3000" },
    });
    const res = await getImportStatusRoute(req);
    assert.strictEqual(res.status, 401);
  });

  test("GET /api/import/status rejects non-allowlisted corporate identity with HTTP 403", async () => {
    const unlistedJwt = mintTestJwt({ email: "unlisted@southasiatravelfactory.com" });
    const req = new NextRequest("http://localhost:3000/api/import/status", {
      headers: {
        host: "localhost:3000",
        "cf-access-jwt-assertion": unlistedJwt,
      },
    });
    const res = await getImportStatusRoute(req);
    assert.strictEqual(res.status, 403);
  });

  test("GET /api/import/status returns diagnostics without secrets for authorized coordinator", async () => {
    const standardJwt = mintTestJwt({ email: STANDARD_EMAIL });
    const req = new NextRequest("http://localhost:3000/api/import/status", {
      headers: {
        host: "localhost:3000",
        "cf-access-jwt-assertion": standardJwt,
      },
    });
    const res = await getImportStatusRoute(req);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(typeof body.hasDataset, "boolean");
    assert.strictEqual(typeof body.database, "object");
    assert.strictEqual(body.database.serviceKey, undefined);
    assert.strictEqual(body.database.supabaseUrl, undefined);
  });

  test("GET /api/operations/tours rejects unauthenticated request with HTTP 401 and accepts authorized coordinator", async () => {
    const unauthReq = new NextRequest("http://localhost:3000/api/operations/tours", {
      headers: { host: "localhost:3000" },
    });
    const unauthRes = await getToursRoute(unauthReq);
    assert.strictEqual(unauthRes.status, 401);

    const standardJwt = mintTestJwt({ email: STANDARD_EMAIL });
    const authReq = new NextRequest("http://localhost:3000/api/operations/tours", {
      headers: {
        host: "localhost:3000",
        "cf-access-jwt-assertion": standardJwt,
      },
    });
    const authRes = await getToursRoute(authReq);
    assert.strictEqual(authRes.status, 200);
    const body = await authRes.json();
    assert.strictEqual(body.success, true);
    assert.ok(Array.isArray(body.tours));
  });

  test("POST /api/operations/tours enforces CSRF/origin validation", async () => {
    const standardJwt = mintTestJwt({ email: STANDARD_EMAIL });
    const crossOriginReq = new NextRequest("http://localhost:3000/api/operations/tours", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "https://evil-cross-origin.com",
        "cf-access-jwt-assertion": standardJwt,
        "content-type": "application/json",
      },
      body: JSON.stringify({ guestName: "Test" }),
    });

    const res = await postToursRoute(crossOriginReq);
    assert.strictEqual(res.status, 403);
    const body = await res.json();
    assert.ok(body.error?.includes("CSRF protection"));
  });

  test("POST /api/auth/logout expires session cookie and returns gatewayLogoutUrl", async () => {
    const res = await logoutRoute();
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(body.gatewayLogoutUrl?.includes("cloudflareaccess.com"));

    const setCookie = res.headers.get("set-cookie");
    assert.ok(setCookie?.includes("satf_operator_session="));
    assert.ok(setCookie?.includes("Max-Age=0"));
  });

  // ─── 4. Development Bypass Isolation & Production Fail-Closed Tests ─────────────

  test("isDevelopmentBypassActive is strictly FALSE in production even if SATF_DEV_AUTH_BYPASS is true", () => {
    const originalEnv = process.env.NODE_ENV;
    const envRecord = process.env as Record<string, string | undefined>;
    try {
      // Temporarily simulate production environment
      envRecord.NODE_ENV = "production";
      process.env.SATF_DEV_AUTH_BYPASS = "true";

      assert.strictEqual(isDevelopmentBypassActive(), false);

      const req = new NextRequest("http://localhost:3000/api/operations/tours", {
        headers: { host: "localhost:3000" },
      });
      const auth = authenticateOperatorRequest(req);
      assert.strictEqual(auth.authorized, false);
      assert.strictEqual(auth.status, 401);
    } finally {
      envRecord.NODE_ENV = originalEnv;
      delete process.env.SATF_DEV_AUTH_BYPASS;
    }
  });

  test("production fails closed with HTTP 500 when gateway configuration is missing", () => {
    const originalEnv = process.env.NODE_ENV;
    const envRecord = process.env as Record<string, string | undefined>;
    try {
      envRecord.NODE_ENV = "production";
      delete process.env.CF_ACCESS_AUD;
      delete process.env.CF_ACCESS_TEAM_NAME;

      const req = new NextRequest("http://localhost:3000/api/operations/tours", {
        headers: { host: "localhost:3000" },
      });
      const auth = authenticateOperatorRequest(req);
      assert.strictEqual(auth.authorized, false);
      assert.strictEqual(auth.status, 500);
      assert.ok(auth.error?.includes("Gateway configuration missing"));
    } finally {
      envRecord.NODE_ENV = originalEnv;
    }
  });

  test("legacy login endpoint /api/auth/login returns HTTP 403 in production", async () => {
    const originalEnv = process.env.NODE_ENV;
    const envRecord = process.env as Record<string, string | undefined>;
    try {
      envRecord.NODE_ENV = "production";

      const req = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
          host: "localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ passphrase: "any-passphrase-attempt" }),
      });

      const res = await loginRoute(req);
      assert.strictEqual(res.status, 403);
      const body = await res.json();
      assert.ok(body.error?.includes("disabled in production"));
    } finally {
      envRecord.NODE_ENV = originalEnv;
    }
  });

  test("JWKS key rotation dynamically resolves newly registered key ID", async () => {
    const NEW_ROTATED_KID = "test-key-satf-2026-rotated-v2";
    const { publicKey: rotatedPubKey, privateKey: rotatedPrivKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });

    // Register newly rotated key
    registerTestJwksKey(NEW_ROTATED_KID, rotatedPubKey.export({ format: "jwk" }) as JsonWebKey, TEST_TEAM);

    const rotatedJwt = mintTestJwt({ kid: NEW_ROTATED_KID, email: STANDARD_EMAIL }, rotatedPrivKey);
    const res = await verifyCloudflareAccessJwt(rotatedJwt);
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.identity?.email, STANDARD_EMAIL);
  });
});

describe("SATF Public Demo Mode Boundary & Zero-Trust Invariants", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.SATF_PUBLIC_DEMO_MODE;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("isPublicDemoModeActive is FALSE by default", () => {
    assert.strictEqual(isPublicDemoModeActive(), false);
  });

  test("isPublicDemoModeActive fails closed when database credentials are present", () => {
    process.env.SATF_PUBLIC_DEMO_MODE = "true";
    process.env.SUPABASE_URL = "https://prod-project.supabase.co";
    assert.strictEqual(isPublicDemoModeActive(), false);

    delete process.env.SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key-mock";
    assert.strictEqual(isPublicDemoModeActive(), false);
  });

  test("isPublicDemoModeActive is TRUE only when SATF_PUBLIC_DEMO_MODE is 'true' without database credentials", () => {
    process.env.SATF_PUBLIC_DEMO_MODE = "true";
    assert.strictEqual(isPublicDemoModeActive(), true);
  });

  test("demo mode permits public HTML page navigation (/, /tours, /calendar)", async () => {
    process.env.SATF_PUBLIC_DEMO_MODE = "true";

    const reqHome = new NextRequest("https://satf-operations-platform.vercel.app/", {
      headers: { host: "satf-operations-platform.vercel.app" },
    });
    const resHome = await middleware(reqHome);
    assert.strictEqual(resHome.status, 200);

    const reqTours = new NextRequest("https://satf-operations-platform.vercel.app/tours", {
      headers: { host: "satf-operations-platform.vercel.app" },
    });
    const resTours = await middleware(reqTours);
    assert.strictEqual(resTours.status, 200);
  });

  test("demo mode BLOCKS mutating API requests without token (POST /api/operations/tours -> 403)", async () => {
    process.env.SATF_PUBLIC_DEMO_MODE = "true";

    const reqMutate = new NextRequest("https://satf-operations-platform.vercel.app/api/operations/tours", {
      method: "POST",
      headers: {
        host: "satf-operations-platform.vercel.app",
        "content-type": "application/json",
      },
      body: JSON.stringify({ tourName: "Unauthorized mutation" }),
    });

    const resMutate = await middleware(reqMutate);
    assert.strictEqual(resMutate.status, 403);
    const body = await resMutate.json();
    assert.ok(body.error?.includes("Mutation operations are disabled in demo mode"));
  });

  test("demo mode BLOCKS import API requests without token (GET /api/import/status -> 401)", async () => {
    process.env.SATF_PUBLIC_DEMO_MODE = "true";

    const reqImport = new NextRequest("https://satf-operations-platform.vercel.app/api/import/status", {
      method: "GET",
      headers: { host: "satf-operations-platform.vercel.app" },
    });

    const resImport = await middleware(reqImport);
    assert.strictEqual(resImport.status, 401);
    const body = await resImport.json();
    assert.ok(body.error?.includes("Import operations require authorized SATF credentials"));
  });

  test("when demo mode is disabled, direct vercel.app access without token is blocked with 403", async () => {
    delete process.env.SATF_PUBLIC_DEMO_MODE;

    const reqVercelDirect = new NextRequest("https://satf-operations-platform.vercel.app/", {
      headers: { host: "satf-operations-platform.vercel.app" },
    });

    const resVercelDirect = await middleware(reqVercelDirect);
    assert.strictEqual(resVercelDirect.status, 403);
    const body = await resVercelDirect.json();
    assert.ok(body.error?.includes("Direct access via vercel.app origin is prohibited"));
  });
});

