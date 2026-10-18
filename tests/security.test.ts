import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { sanitizeCsvCell } from "../lib/utils";
import {
  validateCanonicalPayload,
  saveCanonicalDataset,
  getCanonicalDataset,
  clearCanonicalDataset,
  restoreCanonicalBackup,
  hasCanonicalBackup,
} from "../lib/canonical-store";
import type { ImportPreviewResult, Tour } from "../lib/types";
import { NextRequest } from "next/server";
import {
  COOKIE_NAME,
  verifyPassphrase,
  checkRateLimit,
  recordFailedAttempt,
  resetRateLimit,
  createSessionToken,
  verifySessionToken,
  validateRequestOrigin,
  authenticateOperatorRequest,
  getSessionCookieConfig,
} from "../lib/auth";
import { POST as loginRoute } from "../app/api/auth/login/route";
import { POST as logoutRoute } from "../app/api/auth/logout/route";
import { GET as sessionRoute } from "../app/api/auth/session/route";
import { POST as commitRoute } from "../app/api/import/commit/route";
import { POST as statusRoute } from "../app/api/import/status/route";
import { POST as previewRoute } from "../app/api/import/preview/route";
import { GET as exportReportRoute } from "../app/api/import/export-report/route";

describe("CSV Export — Formula Injection Prevention (CWE-1236)", () => {
  test("neutralizes leading equals sign (=) formula trigger", () => {
    const malicious = "=1+1";
    const sanitized = sanitizeCsvCell(malicious);
    assert.strictEqual(sanitized, "\"'=1+1\"");
  });

  test("neutralizes leading plus sign (+) formula trigger", () => {
    const malicious = "+cmd|' /C calc'!A0";
    const sanitized = sanitizeCsvCell(malicious);
    assert.strictEqual(sanitized, "\"'+cmd|' /C calc'!A0\"");
  });

  test("neutralizes leading minus sign (-) formula trigger", () => {
    const malicious = "-2+5";
    const sanitized = sanitizeCsvCell(malicious);
    assert.strictEqual(sanitized, "\"'-2+5\"");
  });

  test("neutralizes leading at sign (@) formula trigger", () => {
    const malicious = "@SUM(A1:A10)";
    const sanitized = sanitizeCsvCell(malicious);
    assert.strictEqual(sanitized, "\"'@SUM(A1:A10)\"");
  });

  test("neutralizes leading tab (\\t) or carriage return (\\r) triggers", () => {
    const tabTrigger = "\t=1+1";
    assert.ok(sanitizeCsvCell(tabTrigger).startsWith("\"'\t=1+1"));

    const carriageTrigger = "\r=2+2";
    // Carriage returns replaced with space and neutralized
    assert.ok(sanitizeCsvCell(carriageTrigger).includes("=2+2"));
  });

  test("neutralizes leading percent sign (%) formula trigger", () => {
    const malicious = "%0D=1+1";
    const sanitized = sanitizeCsvCell(malicious);
    assert.strictEqual(sanitized, "\"'%0D=1+1\"");
  });

  test("safely formats standard benign values and escapes internal quotes", () => {
    assert.strictEqual(sanitizeCsvCell("Standard Tour Title"), "\"Standard Tour Title\"");
    assert.strictEqual(sanitizeCsvCell(12345), "\"12345\"");
    assert.strictEqual(sanitizeCsvCell("Nakamura \"Group\""), "\"Nakamura \"\"Group\"\"\"");
    assert.strictEqual(sanitizeCsvCell(null), "\"\"");
    assert.strictEqual(sanitizeCsvCell(undefined), "\"\"");
  });
});

describe("Canonical Dataset — Import Validation & Persistence Safety", () => {
  const dataDir = path.resolve(process.cwd(), "data/imported");
  const canonicalFile = path.join(dataDir, "canonical_dataset.json");
  const backupFile = path.join(dataDir, "canonical_dataset.backup.json");

  let originalCanonical: string | null = null;
  let originalBackup: string | null = null;

  beforeEach(() => {
    if (fs.existsSync(canonicalFile)) {
      originalCanonical = fs.readFileSync(canonicalFile, "utf-8");
    } else {
      originalCanonical = null;
    }
    if (fs.existsSync(backupFile)) {
      originalBackup = fs.readFileSync(backupFile, "utf-8");
    } else {
      originalBackup = null;
    }
  });

  afterEach(() => {
    // Restore initial state after tests
    if (originalCanonical !== null) {
      fs.writeFileSync(canonicalFile, originalCanonical, "utf-8");
    } else if (fs.existsSync(canonicalFile)) {
      try { fs.unlinkSync(canonicalFile); } catch {}
    }

    if (originalBackup !== null) {
      fs.writeFileSync(backupFile, originalBackup, "utf-8");
    } else if (fs.existsSync(backupFile)) {
      try { fs.unlinkSync(backupFile); } catch {}
    }
  });

  const validMockTour: Tour = {
    id: "satf-test-100",
    bookingReference: "TEST-100",
    status: "upcoming",
    destination: "Golden Triangle",
    arrivalDate: "2026-10-20",
    departureDate: "2026-10-25",
    lastUpdated: new Date().toISOString(),
    group: {
      id: "grp-100",
      groupName: "Test Group",
      adultCount: 2,
      childCount: 0,
      nationality: "Japanese",
      language: "Japanese",
    },
    flights: [],
    hotels: [],
    itinerary: [],
    assignments: [],
    specialRequests: [],
  };

  const validPreview: ImportPreviewResult = {
    success: true,
    summary: {
      workbookName: "test.xls",
      importTimestamp: new Date().toISOString(),
      totalSheetsFound: 1,
      operationalSheetsCount: 1,
      totalTourBlocks: 1,
      canonicalToursCount: 1,
      spanningToursCount: 0,
      amendedToursCount: 0,
      duplicateRowsCount: 0,
      dateAmbiguityCount: 0,
      unassignedGuidesCount: 0,
      sheetsSummary: [],
    },
    tours: [validMockTour],
    ambiguities: [],
    duplicates: [],
    errors: [],
  };

  test("validateCanonicalPayload accepts valid complete payload", () => {
    const res = validateCanonicalPayload(validPreview);
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.error, undefined);
  });

  test("validateCanonicalPayload rejects non-object or null payloads", () => {
    assert.strictEqual(validateCanonicalPayload(null).valid, false);
    assert.strictEqual(validateCanonicalPayload("not an object").valid, false);
    assert.strictEqual(validateCanonicalPayload([]).valid, false);
  });

  test("validateCanonicalPayload rejects empty tours array", () => {
    const empty = { ...validPreview, tours: [], summary: { ...validPreview.summary, canonicalToursCount: 0 } };
    const res = validateCanonicalPayload(empty);
    assert.strictEqual(res.valid, false);
    assert.ok(res.error?.includes("zero tours"));
  });

  test("validateCanonicalPayload rejects inconsistent count metadata", () => {
    const mismatched = {
      ...validPreview,
      summary: { ...validPreview.summary, canonicalToursCount: 50 }, // Actual is 1
    };
    const res = validateCanonicalPayload(mismatched);
    assert.strictEqual(res.valid, false);
    assert.ok(res.error?.includes("Inconsistent count"));
  });

  test("validateCanonicalPayload rejects inconsistent ambiguity count", () => {
    const mismatchedAmb = {
      ...validPreview,
      summary: { ...validPreview.summary, dateAmbiguityCount: 10 },
      ambiguities: [],
    };
    const res = validateCanonicalPayload(mismatchedAmb);
    assert.strictEqual(res.valid, false);
    assert.ok(res.error?.includes("Inconsistent ambiguity count"));
  });

  test("validateCanonicalPayload rejects malformed tour items", () => {
    const invalidTour = {
      ...validPreview,
      tours: [{ ...validMockTour, bookingReference: "" }],
    };
    const res = validateCanonicalPayload(invalidTour);
    assert.strictEqual(res.valid, false);
    assert.ok(res.error?.includes("bookingReference"));
  });

  test("validateCanonicalPayload rejects negative pax count", () => {
    const invalidPax = {
      ...validPreview,
      tours: [{ ...validMockTour, group: { ...validMockTour.group, adultCount: -3 } }],
    };
    const res = validateCanonicalPayload(invalidPax);
    assert.strictEqual(res.valid, false);
    assert.ok(res.error?.includes("adult pax count"));
  });

  test("saveCanonicalDataset atomically saves valid payload and creates backup", () => {
    const saveRes = saveCanonicalDataset(validPreview, "operational");
    assert.strictEqual(saveRes.success, true);

    const loaded = getCanonicalDataset();
    assert.ok(loaded);
    assert.strictEqual(loaded.tours.length, 1);
    assert.strictEqual(loaded.tours[0].bookingReference, "TEST-100");

    // Pre-write backup creation
    assert.strictEqual(hasCanonicalBackup(), true);
  });

  test("saveCanonicalDataset rejects invalid payload without corrupting existing store", () => {
    // 1. Ensure valid store exists
    saveCanonicalDataset(validPreview, "operational");
    const baseline = getCanonicalDataset();
    assert.strictEqual(baseline?.tours[0].bookingReference, "TEST-100");

    // 2. Attempt saving corrupted payload
    const corruptPayload = {
      ...validPreview,
      tours: [], // Empty
    };
    const failedSave = saveCanonicalDataset(corruptPayload as unknown as ImportPreviewResult);
    assert.strictEqual(failedSave.success, false);
    assert.ok(failedSave.error?.includes("Validation failed"));

    // 3. Existing store must be 100% intact
    const intact = getCanonicalDataset();
    assert.ok(intact);
    assert.strictEqual(intact.tours.length, 1);
    assert.strictEqual(intact.tours[0].bookingReference, "TEST-100");
  });

  test("clearCanonicalDataset preserves recoverable backup and restoreCanonicalBackup recovers it", () => {
    // 1. Save valid tour
    saveCanonicalDataset(validPreview, "operational");

    // 2. Clear dataset
    const clearRes = clearCanonicalDataset();
    assert.strictEqual(clearRes.success, true);
    assert.strictEqual(clearRes.backupPreserved, true);
    assert.strictEqual(getCanonicalDataset(), null);

    // 3. Restore from backup
    const restoreRes = restoreCanonicalBackup();
    assert.strictEqual(restoreRes.success, true);

    const restored = getCanonicalDataset();
    assert.ok(restored);
    assert.strictEqual(restored.tours[0].bookingReference, "TEST-100");
  });
});

describe("Operator Authentication, Session Management & Protected Routes", () => {
  const testIp = "203.0.113.199";
  const testPassphrase = "unit-test-secure-passphrase-2026";
  const originalPass = process.env.SATF_OPERATOR_PASSPHRASE;
  const originalAdminPass = process.env.SATF_ADMIN_PASSPHRASE;

  beforeEach(() => {
    resetRateLimit(testIp);
    process.env.SATF_OPERATOR_PASSPHRASE = testPassphrase;
    delete process.env.SATF_ADMIN_PASSPHRASE;
  });

  afterEach(() => {
    resetRateLimit(testIp);
    if (originalPass !== undefined) {
      process.env.SATF_OPERATOR_PASSPHRASE = originalPass;
    } else {
      delete process.env.SATF_OPERATOR_PASSPHRASE;
    }
    if (originalAdminPass !== undefined) {
      process.env.SATF_ADMIN_PASSPHRASE = originalAdminPass;
    } else {
      delete process.env.SATF_ADMIN_PASSPHRASE;
    }
  });

  test("verifyPassphrase accepts valid passphrase and rejects invalid/empty inputs", () => {
    const valid = verifyPassphrase(testPassphrase);
    assert.strictEqual(valid, true);

    assert.strictEqual(verifyPassphrase("wrong-passphrase"), false);
    assert.strictEqual(verifyPassphrase(""), false);
    assert.strictEqual(verifyPassphrase(null as unknown as string), false);
    assert.strictEqual(verifyPassphrase(undefined as unknown as string), false);
    assert.strictEqual(verifyPassphrase(testPassphrase.toUpperCase()), false); // Case-sensitive
  });

  test("verifyPassphrase fails closed when no operator passphrase is configured in any environment", () => {
    delete process.env.SATF_OPERATOR_PASSPHRASE;
    delete process.env.SATF_ADMIN_PASSPHRASE;

    assert.strictEqual(verifyPassphrase(testPassphrase), false);
    assert.strictEqual(verifyPassphrase("satf-operator-2026"), false);
    assert.strictEqual(verifyPassphrase(""), false);
  });

  test("rate limiter enforces lockout after 5 consecutive failures", () => {
    const status0 = checkRateLimit(testIp);
    assert.strictEqual(status0.allowed, true);
    assert.strictEqual(status0.remainingAttempts, 5);

    // Fail 4 times
    for (let i = 1; i <= 4; i++) {
      const rec = recordFailedAttempt(testIp);
      assert.strictEqual(rec.allowed, true);
      assert.strictEqual(rec.remainingAttempts, 5 - i);
    }

    // 5th failure triggers lockout
    const rec5 = recordFailedAttempt(testIp);
    assert.strictEqual(rec5.allowed, false);
    assert.strictEqual(rec5.remainingAttempts, 0);
    assert.ok(rec5.retryAfterSeconds && rec5.retryAfterSeconds > 0);

    // Further checkRateLimit calls are blocked
    const lockedCheck = checkRateLimit(testIp);
    assert.strictEqual(lockedCheck.allowed, false);
    assert.strictEqual(lockedCheck.remainingAttempts, 0);

    // Resetting rate limit restores access
    resetRateLimit(testIp);
    const restoredCheck = checkRateLimit(testIp);
    assert.strictEqual(restoredCheck.allowed, true);
    assert.strictEqual(restoredCheck.remainingAttempts, 5);
  });

  test("createSessionToken produces signed token with CSRF token and expiry", () => {
    const { token, payload } = createSessionToken("Test Ops Controller");
    assert.strictEqual(payload.operator, "Test Ops Controller");
    assert.ok(payload.csrfToken && payload.csrfToken.length >= 32);
    assert.ok(payload.exp > Date.now());

    // Valid token passes verification
    const verified = verifySessionToken(token);
    assert.strictEqual(verified.valid, true);
    assert.strictEqual(verified.payload?.operator, "Test Ops Controller");
    assert.strictEqual(verified.payload?.csrfToken, payload.csrfToken);
  });

  test("verifySessionToken rejects tampered signatures, altered payloads, and expired tokens", () => {
    const { token } = createSessionToken("Test Operator");
    const [payloadB64, sig] = token.split(".");

    // Altered signature
    const tamperedSigToken = `${payloadB64}.${sig.slice(0, -3)}xyz`;
    const resTamperedSig = verifySessionToken(tamperedSigToken);
    assert.strictEqual(resTamperedSig.valid, false);
    assert.ok(resTamperedSig.error?.includes("signature"));

    // Altered payload with same signature
    const fakePayloadB64 = Buffer.from(
      JSON.stringify({ operator: "Attacker", csrfToken: "abc", iat: Date.now(), exp: Date.now() + 10000 })
    ).toString("base64url");
    const forgedToken = `${fakePayloadB64}.${sig}`;
    const resForged = verifySessionToken(forgedToken);
    assert.strictEqual(resForged.valid, false);

    // Expired token
    const expiredPayload = {
      operator: "Expired Operator",
      csrfToken: "abc123456789012345678901",
      iat: Date.now() - 7200000,
      exp: Date.now() - 1000, // 1 second in past
    };
    const expiredB64 = Buffer.from(JSON.stringify(expiredPayload)).toString("base64url");
    const cryptoMod = require("node:crypto");
    const { getSessionSecret } = require("../lib/auth");
    const expiredSig = cryptoMod.createHmac("sha256", getSessionSecret()).update(expiredB64).digest("base64url");
    const expiredToken = `${expiredB64}.${expiredSig}`;

    const resExpired = verifySessionToken(expiredToken);
    assert.strictEqual(resExpired.valid, false);
    assert.ok(resExpired.error?.includes("expired"));

    // Malformed token strings
    assert.strictEqual(verifySessionToken("").valid, false);
    assert.strictEqual(verifySessionToken("not-a-token").valid, false);
    assert.strictEqual(verifySessionToken("a.b.c").valid, false);
  });

  test("validateRequestOrigin blocks cross-origin requests", () => {
    // Matching host and origin
    const validReq = new NextRequest("http://localhost:3000/api/import/commit", {
      headers: { host: "localhost:3000", origin: "http://localhost:3000" },
    });
    assert.strictEqual(validateRequestOrigin(validReq), true);

    // Cross-origin attack attempt
    const evilReq = new NextRequest("http://localhost:3000/api/import/commit", {
      headers: { host: "localhost:3000", origin: "https://evil-attacker.com" },
    });
    assert.strictEqual(validateRequestOrigin(evilReq), false);

    // Cross-origin referer attack attempt
    const evilRefererReq = new NextRequest("http://localhost:3000/api/import/commit", {
      headers: { host: "localhost:3000", referer: "https://evil-attacker.com/malicious" },
    });
    assert.strictEqual(validateRequestOrigin(evilRefererReq), false);
  });

  test("authenticateOperatorRequest enforces session existence and CSRF tokens", () => {
    // 1. Missing session cookie
    const noAuthReq = new NextRequest("http://localhost:3000/api/import/commit", {
      method: "POST",
      headers: { host: "localhost:3000", origin: "http://localhost:3000" },
    });
    const resNoAuth = authenticateOperatorRequest(noAuthReq);
    assert.strictEqual(resNoAuth.authorized, false);
    assert.strictEqual(resNoAuth.status, 401);

    // 2. Valid session token, but missing CSRF header on POST
    const { token, payload } = createSessionToken("Ops Auditor");
    const noCsrfReq = new NextRequest("http://localhost:3000/api/import/commit", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        cookie: `${COOKIE_NAME}=${token}`,
      },
    });
    const resNoCsrf = authenticateOperatorRequest(noCsrfReq);
    assert.strictEqual(resNoCsrf.authorized, false);
    assert.strictEqual(resNoCsrf.status, 403);
    assert.ok(resNoCsrf.error?.includes("Missing CSRF token"));

    // 3. Valid session token with wrong CSRF header
    const wrongCsrfReq = new NextRequest("http://localhost:3000/api/import/commit", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        cookie: `${COOKIE_NAME}=${token}`,
        "x-csrf-token": "wrong-token-value-1234567890123456",
      },
    });
    const resWrongCsrf = authenticateOperatorRequest(wrongCsrfReq);
    assert.strictEqual(resWrongCsrf.authorized, false);
    assert.strictEqual(resWrongCsrf.status, 403);

    // 4. Valid session token with matching CSRF header and valid origin
    const validReq = new NextRequest("http://localhost:3000/api/import/commit", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        cookie: `${COOKIE_NAME}=${token}`,
        "x-csrf-token": payload.csrfToken,
      },
    });
    const resValid = authenticateOperatorRequest(validReq);
    assert.strictEqual(resValid.authorized, true);
    assert.strictEqual(resValid.status, 200);
    assert.strictEqual(resValid.payload?.operator, "Ops Auditor");
  });

  test("login, session check, and logout API endpoints behave correctly", async () => {
    // 1. Login with invalid passphrase
    const failLoginReq = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { host: "localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ passphrase: "wrong" }),
    });
    const failLoginRes = await loginRoute(failLoginReq);
    assert.strictEqual(failLoginRes.status, 401);
    const failData = await failLoginRes.json();
    assert.strictEqual(failData.success, false);
    assert.ok(failData.error?.includes("Invalid passphrase"));

    // 2. Login with valid passphrase
    const successLoginReq = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { host: "localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ passphrase: testPassphrase }),
    });
    const successLoginRes = await loginRoute(successLoginReq);
    assert.strictEqual(successLoginRes.status, 200);
    const successData = await successLoginRes.json();
    assert.strictEqual(successData.success, true);
    assert.ok(successData.csrfToken);

    // Inspect session cookie set in headers
    const setCookie = successLoginRes.headers.get("set-cookie");
    assert.ok(setCookie);
    assert.ok(setCookie.includes(`${COOKIE_NAME}=`));
    assert.ok(setCookie.toLowerCase().includes("httponly"));
    assert.ok(setCookie.toLowerCase().includes("samesite=strict"));

    // Extract cookie value
    const match = setCookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
    assert.ok(match && match[1]);
    const sessionCookieValue = match[1];

    // 3. Check /api/auth/session with valid cookie
    const sessionReq = new NextRequest("http://localhost:3000/api/auth/session", {
      headers: {
        host: "localhost:3000",
        cookie: `${COOKIE_NAME}=${sessionCookieValue}`,
      },
    });
    const sessionRes = await sessionRoute(sessionReq);
    assert.strictEqual(sessionRes.status, 200);
    const sessionData = await sessionRes.json();
    assert.strictEqual(sessionData.authenticated, true);
    assert.strictEqual(sessionData.csrfToken, successData.csrfToken);

    // 4. Check /api/auth/session without cookie
    const anonReq = new NextRequest("http://localhost:3000/api/auth/session", {
      headers: { host: "localhost:3000" },
    });
    const anonRes = await sessionRoute(anonReq);
    assert.strictEqual(anonRes.status, 200);
    const anonData = await anonRes.json();
    assert.strictEqual(anonData.authenticated, false);

    // 5. Logout endpoint clears cookie
    const logoutRes = await logoutRoute();
    assert.strictEqual(logoutRes.status, 200);
    const logoutSetCookie = logoutRes.headers.get("set-cookie");
    assert.ok(logoutSetCookie);
    assert.ok(logoutSetCookie.includes("Max-Age=0"));
  });

  test("protected import endpoints reject unauthenticated requests with 401", async () => {
    // POST /api/import/commit
    const commitReq = new NextRequest("http://localhost:3000/api/import/commit", {
      method: "POST",
      headers: { host: "localhost:3000" },
    });
    const commitRes = await commitRoute(commitReq);
    assert.strictEqual(commitRes.status, 401);

    // POST /api/import/status
    const statusReq = new NextRequest("http://localhost:3000/api/import/status", {
      method: "POST",
      headers: { host: "localhost:3000" },
    });
    const statusRes = await statusRoute(statusReq);
    assert.strictEqual(statusRes.status, 401);

    // POST /api/import/preview
    const previewReq = new NextRequest("http://localhost:3000/api/import/preview", {
      method: "POST",
      headers: { host: "localhost:3000" },
    });
    const previewRes = await previewRoute(previewReq);
    assert.strictEqual(previewRes.status, 401);

    // GET /api/import/export-report
    const exportReq = new NextRequest("http://localhost:3000/api/import/export-report", {
      method: "GET",
      headers: { host: "localhost:3000" },
    });
    const exportRes = await exportReportRoute(exportReq);
    assert.strictEqual(exportRes.status, 401);
  });

  test("protected import endpoints reject requests with session but missing/invalid CSRF with 403", async () => {
    const { token } = createSessionToken("Operator Beta");

    // POST /api/import/commit without CSRF token
    const commitReq = new NextRequest("http://localhost:3000/api/import/commit", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        cookie: `${COOKIE_NAME}=${token}`,
      },
    });
    const commitRes = await commitRoute(commitReq);
    assert.strictEqual(commitRes.status, 403);

    // POST /api/import/status without CSRF token
    const statusReq = new NextRequest("http://localhost:3000/api/import/status", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        cookie: `${COOKIE_NAME}=${token}`,
      },
    });
    const statusRes = await statusRoute(statusReq);
    assert.strictEqual(statusRes.status, 403);
  });

  test("GET /api/import/export-report succeeds when authenticated with valid session cookie", async () => {
    const { token } = createSessionToken("Report Officer");

    // Provide a valid test dataset
    const sampleTour: Tour = {
      id: "satf-export-001",
      bookingReference: "SATF-EXP-1",
      status: "upcoming",
      destination: "Golden Triangle",
      arrivalDate: "2026-10-20",
      departureDate: "2026-10-25",
      lastUpdated: new Date().toISOString(),
      group: {
        id: "grp-exp-1",
        groupName: "Tanaka Family",
        adultCount: 4,
        childCount: 0,
        nationality: "Japanese",
        language: "Japanese",
      },
      flights: [],
      hotels: [],
      itinerary: [],
      assignments: [],
      specialRequests: [],
    };

    saveCanonicalDataset(
      {
        success: true,
        summary: {
          workbookName: "test.xls",
          importTimestamp: new Date().toISOString(),
          totalSheetsFound: 1,
          operationalSheetsCount: 1,
          totalTourBlocks: 1,
          canonicalToursCount: 1,
          spanningToursCount: 0,
          amendedToursCount: 0,
          duplicateRowsCount: 0,
          dateAmbiguityCount: 0,
          unassignedGuidesCount: 0,
          sheetsSummary: [],
        },
        tours: [sampleTour],
        ambiguities: [],
        duplicates: [],
        errors: [],
      },
      "operational"
    );

    const exportReq = new NextRequest("http://localhost:3000/api/import/export-report", {
      method: "GET",
      headers: {
        host: "localhost:3000",
        cookie: `${COOKIE_NAME}=${token}`,
      },
    });
    const exportRes = await exportReportRoute(exportReq);
    assert.strictEqual(exportRes.status, 200);
    assert.strictEqual(exportRes.headers.get("content-type"), "text/csv; charset=utf-8");
    assert.ok(exportRes.headers.get("content-disposition")?.includes("attachment"));
    const csvContent = await exportRes.text();
    assert.ok(csvContent.startsWith("Booking Reference,Guest Name"));
    assert.ok(csvContent.includes("\"SATF-EXP-1\""));
    assert.ok(csvContent.includes("\"Tanaka Family\""));
  });
});
