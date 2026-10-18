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
import * as XLSX from "xlsx";
import {
  validateExcelSignature,
  detectExcelFormat,
  MAX_WORKBOOK_SIZE_BYTES,
} from "../lib/excel-parser";
import {
  GET as getOperationsToursRoute,
  POST as postOperationsToursRoute,
} from "../app/api/operations/tours/route";
import {
  GET as getOperationsTourByIdRoute,
  PUT as putOperationsTourRoute,
  POST as postOperationsTourActionRoute,
} from "../app/api/operations/tours/[id]/route";
import { mergeCoordinatorFields } from "../lib/operations";
import {
  getDatabaseConfigStatus,
  logAuditEvent,
  executeAtomicTourMutation,
  createPersistentTour,
  updatePersistentTour,
  cancelPersistentTour,
} from "../lib/operational-store";

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

describe("Excel Upload Security Hardening — Size, Format & Signature Validation", () => {
  test("validateExcelSignature correctly verifies OLE2 and ZIP headers and rejects non-spreadsheets", () => {
    // Valid OLE2 .xls magic bytes
    const ole2Header = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    assert.strictEqual(validateExcelSignature(ole2Header, "xls"), true);
    assert.strictEqual(validateExcelSignature(ole2Header), true);
    assert.strictEqual(detectExcelFormat(ole2Header), "xls");

    // Valid ZIP .xlsx magic bytes
    const zipHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
    assert.strictEqual(validateExcelSignature(zipHeader, "xlsx"), true);
    assert.strictEqual(validateExcelSignature(zipHeader), true);
    assert.strictEqual(detectExcelFormat(zipHeader), "xlsx");

    // Mismatched expected format
    assert.strictEqual(validateExcelSignature(ole2Header, "xlsx"), false);
    assert.strictEqual(validateExcelSignature(zipHeader, "xls"), false);

    // Invalid non-spreadsheet buffers
    const textBuffer = Buffer.from("<html><body>Not an Excel document</body></html>");
    assert.strictEqual(validateExcelSignature(textBuffer), false);
    assert.strictEqual(detectExcelFormat(textBuffer), null);

    const pdfBuffer = Buffer.from("%PDF-1.4 malicious payload");
    assert.strictEqual(validateExcelSignature(pdfBuffer), false);
    assert.strictEqual(detectExcelFormat(pdfBuffer), null);

    const emptyBuffer = Buffer.from([]);
    assert.strictEqual(validateExcelSignature(emptyBuffer), false);
    assert.strictEqual(detectExcelFormat(emptyBuffer), null);
  });

  test("early Content-Length validation rejects requests exceeding 25 MB before body parsing (HTTP 413)", async () => {
    const { token, payload } = createSessionToken("Upload Controller");
    const oversizedLength = 30 * 1024 * 1024; // 30 MB

    const req = new NextRequest("http://localhost:3000/api/import/preview", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        cookie: `${COOKIE_NAME}=${token}`,
        "x-csrf-token": payload.csrfToken,
        "content-type": "multipart/form-data; boundary=----WebKitFormBoundaryX",
        "content-length": String(oversizedLength),
      },
    });

    const res = await previewRoute(req);
    assert.strictEqual(res.status, 413);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.error.includes("25 MB"));
  });

  test("file.size validation rejects oversized files uploaded within limits (HTTP 413)", async () => {
    const { token, payload } = createSessionToken("Upload Controller");
    const formData = new FormData();
    // Simulate oversized file (26 MB)
    const largeBuffer = Buffer.alloc(26 * 1024 * 1024);
    largeBuffer[0] = 0xd0;
    largeBuffer[1] = 0xcf;
    largeBuffer[2] = 0x11;
    largeBuffer[3] = 0xe0;
    const file = new File([largeBuffer], "massive_chart.xls", { type: "application/vnd.ms-excel" });
    formData.append("file", file);

    const req = new NextRequest("http://localhost:3000/api/import/preview", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        cookie: `${COOKIE_NAME}=${token}`,
        "x-csrf-token": payload.csrfToken,
      },
      body: formData,
    });

    const res = await previewRoute(req);
    assert.strictEqual(res.status, 413);
    const data = await res.json();
    assert.ok(data.error.includes("25 MB"));
  });

  test("rejects unsupported file extensions (HTTP 400)", async () => {
    const { token, payload } = createSessionToken("Upload Controller");
    const formData = new FormData();
    const csvFile = new File([Buffer.from("a,b,c\n1,2,3")], "schedule.csv", { type: "text/csv" });
    formData.append("file", csvFile);

    const req = new NextRequest("http://localhost:3000/api/import/preview", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        cookie: `${COOKIE_NAME}=${token}`,
        "x-csrf-token": payload.csrfToken,
      },
      body: formData,
    });

    const res = await previewRoute(req);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.error.includes("Unsupported file type"));
  });

  test("rejects spoofed file extensions with invalid magic bytes (HTTP 400)", async () => {
    const { token, payload } = createSessionToken("Upload Controller");
    const formData = new FormData();
    // Text file pretending to be .xls
    const spoofedXls = new File([Buffer.from("MZ\x90\x00executable content disguised as xls")], "chart.xls", {
      type: "application/vnd.ms-excel",
    });
    formData.append("file", spoofedXls);

    const req = new NextRequest("http://localhost:3000/api/import/preview", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        cookie: `${COOKIE_NAME}=${token}`,
        "x-csrf-token": payload.csrfToken,
      },
      body: formData,
    });

    const res = await previewRoute(req);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.error.includes("Invalid file signature"));
  });

  test("handles malformed workbooks gracefully without 500 error or stack trace (HTTP 400)", async () => {
    const { token, payload } = createSessionToken("Upload Controller");
    const formData = new FormData();
    // Valid ZIP signature (PK\x03\x04) but corrupted internal structure
    const corruptedZip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0xff, 0x00, 0x00, 0xaa, 0xbb]);
    const malformedFile = new File([corruptedZip], "corrupted.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    formData.append("file", malformedFile);

    const req = new NextRequest("http://localhost:3000/api/import/preview", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        cookie: `${COOKIE_NAME}=${token}`,
        "x-csrf-token": payload.csrfToken,
      },
      body: formData,
    });

    const res = await previewRoute(req);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.error.includes("Failed to parse workbook") || data.error.includes("corrupted"));
  });

  test("accepts valid synthetic Excel workbook upload (.xlsx) (HTTP 200)", async () => {
    const { token, payload } = createSessionToken("Upload Controller");
    // Generate valid minimal workbook using SheetJS
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["Header 1", "Header 2", "Header 3"],
      ["Row 1", "Row 2", "Row 3"],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "OCT 2025");
    const validBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const formData = new FormData();
    const validFile = new File([validBuffer], "valid_schedule.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    formData.append("file", validFile);

    const req = new NextRequest("http://localhost:3000/api/import/preview", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        cookie: `${COOKIE_NAME}=${token}`,
        "x-csrf-token": payload.csrfToken,
      },
      body: formData,
    });

    const res = await previewRoute(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.summary);
    assert.ok(Array.isArray(data.tours));
  });
});

describe("Persistent Operations APIs — Authorization, Validation, Concurrency & Safe Degradation", () => {
  test("GET /api/operations/tours rejects unauthenticated callers with HTTP 401 (CWE-306)", async () => {
    const req = new NextRequest("http://localhost:3000/api/operations/tours", {
      method: "GET",
    });
    const res = await getOperationsToursRoute(req);
    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.tours, undefined);
  });

  test("GET /api/operations/tours succeeds for authenticated operator and reports database config status", async () => {
    const { token } = createSessionToken("Operations Coordinator");
    const req = new NextRequest("http://localhost:3000/api/operations/tours", {
      method: "GET",
      headers: {
        cookie: `${COOKIE_NAME}=${token}`,
      },
    });
    const res = await getOperationsToursRoute(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(typeof data.configured, "boolean");
    assert.ok(Array.isArray(data.tours));
  });

  test("POST /api/operations/tours rejects unauthenticated callers with HTTP 401", async () => {
    const req = new NextRequest("http://localhost:3000/api/operations/tours", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ tour: { bookingReference: "TEST-01" } }),
    });
    const res = await postOperationsToursRoute(req);
    assert.strictEqual(res.status, 401);
  });

  test("POST /api/operations/tours rejects requests with missing or invalid CSRF token with HTTP 403", async () => {
    const { token } = createSessionToken("Operations Coordinator");
    const req = new NextRequest("http://localhost:3000/api/operations/tours", {
      method: "POST",
      headers: {
        cookie: `${COOKIE_NAME}=${token}`,
        "content-type": "application/json",
        // Missing x-csrf-token header
      },
      body: JSON.stringify({ tour: { bookingReference: "TEST-01" } }),
    });
    const res = await postOperationsToursRoute(req);
    assert.strictEqual(res.status, 403);
  });

  test("POST /api/operations/tours validates payload and rejects malformed inputs with HTTP 400", async () => {
    const { token, payload } = createSessionToken("Operations Coordinator");
    const req = new NextRequest("http://localhost:3000/api/operations/tours", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        cookie: `${COOKIE_NAME}=${token}`,
        "x-csrf-token": payload.csrfToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({ tour: { bookingReference: "" } }), // Missing required fields
    });
    const res = await postOperationsToursRoute(req);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.error.includes("Missing required tour fields"));
  });

  test("POST /api/operations/tours returns HTTP 503 DATABASE_NOT_CONFIGURED when Supabase is not configured", async () => {
    const { token, payload } = createSessionToken("Operations Coordinator");
    const req = new NextRequest("http://localhost:3000/api/operations/tours", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        cookie: `${COOKIE_NAME}=${token}`,
        "x-csrf-token": payload.csrfToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        tour: {
          id: "tour-new-001",
          bookingReference: "SATF-NEW-001",
          group: { groupName: "Yamamoto Party", adultCount: 4, childCount: 0, nationality: "Japanese", language: "Japanese" },
          status: "upcoming",
          arrivalDate: "2026-11-01",
          departureDate: "2026-11-08",
          flights: [],
          hotels: [],
          assignments: [],
          specialRequests: [],
        },
      }),
    });
    const res = await postOperationsToursRoute(req);
    // When Supabase is not configured, must fail closed with 503 without silent fallback
    assert.strictEqual(res.status, 503);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.code, "DATABASE_NOT_CONFIGURED");
    assert.ok(data.error.includes("SUPABASE_URL") || data.error.includes("persistence is not configured"));
  });

  test("PUT /api/operations/tours/[id] rejects unauthenticated callers with HTTP 401", async () => {
    const req = new NextRequest("http://localhost:3000/api/operations/tours/tour-001", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "tour-001" }),
    });
    const res = await putOperationsTourRoute(req, { params: Promise.resolve({ id: "tour-001" }) });
    assert.strictEqual(res.status, 401);
  });

  test("PUT /api/operations/tours/[id] returns HTTP 503 DATABASE_NOT_CONFIGURED when Supabase is unconfigured", async () => {
    const { token, payload } = createSessionToken("Operations Coordinator");
    const req = new NextRequest("http://localhost:3000/api/operations/tours/tour-001", {
      method: "PUT",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        cookie: `${COOKIE_NAME}=${token}`,
        "x-csrf-token": payload.csrfToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        tour: {
          id: "tour-001",
          bookingReference: "SATF-2025-001",
          group: { groupName: "Test", adultCount: 2, childCount: 0, nationality: "Japanese", language: "Japanese" },
          status: "active",
          arrivalDate: "2026-10-20",
          departureDate: "2026-10-25",
          flights: [],
          hotels: [],
          assignments: [],
          specialRequests: [],
        },
      }),
    });
    const res = await putOperationsTourRoute(req, { params: Promise.resolve({ id: "tour-001" }) });
    assert.strictEqual(res.status, 503);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.code, "DATABASE_NOT_CONFIGURED");
  });

  test("POST /api/operations/tours/[id] (cancel) validates cancellation reason length (HTTP 400)", async () => {
    const { token, payload } = createSessionToken("Operations Coordinator");
    const req = new NextRequest("http://localhost:3000/api/operations/tours/tour-001", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        cookie: `${COOKIE_NAME}=${token}`,
        "x-csrf-token": payload.csrfToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({ action: "cancel", reason: "no" }), // Less than 5 chars
    });
    const res = await postOperationsTourActionRoute(req, { params: Promise.resolve({ id: "tour-001" }) });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.error.includes("at least 5 characters"));
  });

  test("mergeCoordinatorFields preserves coordinator-assigned guide, driver, hotel confirmation, and issues", () => {
    const existingTour: Tour = {
      id: "tour-preserve-01",
      bookingReference: "SATF-2025-P01",
      group: { id: "grp-1", groupName: "Inoue Party", adultCount: 2, childCount: 0, nationality: "Japanese", language: "Japanese" },
      status: "active",
      destination: "Delhi-Agra",
      arrivalDate: "2025-10-15",
      departureDate: "2025-10-22",
      flights: [],
      hotels: [{ id: "h-1", hotelName: "Oberoi Amarvilas", city: "Agra", checkIn: "2025-10-16", checkOut: "2025-10-18", roomType: "double", roomCount: 1, confirmationNumber: "AGRA-OB-9988" }],
      itinerary: [],
      assignments: [
        { id: "a-1", role: "guide", status: "assigned", name: "Rajesh Kumar", reference: "G-101" },
        { id: "a-2", role: "driver", status: "assigned", name: "Suresh Singh", notes: "Prefers Japanese tea" },
        { id: "a-3", role: "vehicle", status: "assigned", reference: "DL-1VA-9999", vehicleType: "Innova" },
      ],
      specialRequests: [],
      issues: [
        { id: "iss-1", category: "special_request", description: "Vegetarian breakfast required", resolved: true, resolutionNotes: "Chef notified and menu adjusted" }
      ],
      operationalNotes: "VIP repeat customer from Tokyo",
      lastUpdated: "2026-10-18T10:00:00.000Z",
    };

    // Incoming raw Excel tour with unassigned fields
    const incomingExcelTour: Tour = {
      id: "tour-preserve-01",
      bookingReference: "SATF-2025-P01",
      group: { id: "grp-1", groupName: "Inoue Party", adultCount: 2, childCount: 0, nationality: "Japanese", language: "Japanese" },
      status: "upcoming",
      destination: "Delhi-Agra",
      arrivalDate: "2025-10-15",
      departureDate: "2025-10-22",
      flights: [],
      hotels: [{ id: "h-1", hotelName: "Oberoi Amarvilas", city: "Agra", checkIn: "2025-10-16", checkOut: "2025-10-18", roomType: "double", roomCount: 1 }],
      itinerary: [],
      assignments: [
        { id: "a-1", role: "guide", status: "unassigned" },
        { id: "a-2", role: "driver", status: "unassigned" },
        { id: "a-3", role: "vehicle", status: "unassigned" },
      ],
      specialRequests: [],
      issues: [],
      lastUpdated: "2025-10-15T00:00:00.000Z",
    };

    const merged = mergeCoordinatorFields(incomingExcelTour, existingTour);

    // Assert coordinator-managed fields are faithfully preserved
    const guide = merged.assignments.find((a) => a.role === "guide");
    assert.strictEqual(guide?.status, "assigned");
    assert.strictEqual(guide?.name, "Rajesh Kumar");

    const driver = merged.assignments.find((a) => a.role === "driver");
    assert.strictEqual(driver?.status, "assigned");
    assert.strictEqual(driver?.name, "Suresh Singh");
    assert.strictEqual(driver?.notes, "Prefers Japanese tea");

    const vehicle = merged.assignments.find((a) => a.role === "vehicle");
    assert.strictEqual(vehicle?.reference, "DL-1VA-9999");

    const hotel = merged.hotels[0];
    assert.strictEqual(hotel?.confirmationNumber, "AGRA-OB-9988");

    assert.strictEqual(merged.issues?.length, 1);
    assert.strictEqual(merged.issues?.[0]?.resolved, true);
    assert.strictEqual(merged.operationalNotes, "VIP repeat customer from Tokyo");
  });

  test("mergeCoordinatorFields preserves manual tour cancellation and reason on Excel re-import", () => {
    const cancelledExistingTour: Tour = {
      id: "tour-cancelled-01",
      bookingReference: "SATF-2025-C01",
      group: { id: "grp-c", groupName: "Tanaka Group", adultCount: 3, childCount: 0, nationality: "Japanese", language: "Japanese" },
      status: "cancelled",
      cancellationReason: "Cancelled due to international flight disruption",
      cancelledAt: "2025-10-14T08:00:00.000Z",
      destination: "Golden Triangle",
      arrivalDate: "2025-10-16",
      departureDate: "2025-10-23",
      flights: [],
      hotels: [],
      itinerary: [],
      assignments: [],
      specialRequests: [],
      issues: [],
      lastUpdated: "2025-10-14T08:00:00.000Z",
    };

    const incomingRawTour: Tour = {
      id: "tour-cancelled-01",
      bookingReference: "SATF-2025-C01",
      group: { id: "grp-c", groupName: "Tanaka Group", adultCount: 3, childCount: 0, nationality: "Japanese", language: "Japanese" },
      status: "upcoming",
      destination: "Golden Triangle",
      arrivalDate: "2025-10-16",
      departureDate: "2025-10-23",
      flights: [],
      hotels: [],
      itinerary: [],
      assignments: [],
      specialRequests: [],
      issues: [],
      lastUpdated: "2025-10-16T00:00:00.000Z",
    };

    const merged = mergeCoordinatorFields(incomingRawTour, cancelledExistingTour);
    assert.strictEqual(merged.status, "cancelled");
    assert.strictEqual(merged.cancellationReason, "Cancelled due to international flight disruption");
    assert.strictEqual(merged.cancelledAt, "2025-10-14T08:00:00.000Z");
  });

  test("POST /api/operations/tours validates newTourInput departure date order (HTTP 400)", async () => {
    const { token, payload } = createSessionToken("Operations Coordinator");
    const req = new NextRequest("http://localhost:3000/api/operations/tours", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        cookie: `${COOKIE_NAME}=${token}`,
        "x-csrf-token": payload.csrfToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        newTourInput: {
          bookingReference: "SATF-INVALID-DATE",
          groupName: "Test Group",
          adultCount: 2,
          nationality: "Japanese",
          language: "Japanese",
          destination: "Delhi",
          arrivalDate: "2026-11-15",
          departureDate: "2026-11-10", // Departure BEFORE arrival!
        },
      }),
    });
    const res = await postOperationsToursRoute(req);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.validationErrors?.departureDate);
  });

  test("POST /api/operations/tours/[id] (cancel) with valid reason fails closed with 503 when Supabase unconfigured", async () => {
    const { token, payload } = createSessionToken("Operations Coordinator");
    const req = new NextRequest("http://localhost:3000/api/operations/tours/tour-001", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        cookie: `${COOKIE_NAME}=${token}`,
        "x-csrf-token": payload.csrfToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({ action: "cancel", reason: "Guest requested cancellation via travel agency" }),
    });
    const res = await postOperationsTourActionRoute(req, { params: Promise.resolve({ id: "tour-001" }) });
    assert.strictEqual(res.status, 503);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.code, "DATABASE_NOT_CONFIGURED");
  });

  test("GET /api/operations/tours/[id] rejects unauthenticated callers with HTTP 401", async () => {
    const req = new NextRequest("http://localhost:3000/api/operations/tours/tour-001", {
      method: "GET",
    });
    const res = await getOperationsTourByIdRoute(req, { params: Promise.resolve({ id: "tour-001" }) });
    assert.strictEqual(res.status, 401);
  });

  test("satf_schema.sql audit log FK uses ON DELETE SET NULL to preserve history on tour deletion", () => {
    const schemaPath = path.join(__dirname, "..", "supabase", "satf_schema.sql");
    const schemaContent = fs.readFileSync(schemaPath, "utf-8");

    // Ensure audit log uses SET NULL so deleting a tour never cascades or erases dispatch audit history
    assert.ok(
      schemaContent.includes("REFERENCES public.satf_operational_tours(id) ON DELETE SET NULL"),
      "satf_audit_log must use ON DELETE SET NULL to preserve audit entries when tours are deleted"
    );
    assert.ok(
      !schemaContent.includes("REFERENCES public.satf_operational_tours(id) ON DELETE CASCADE"),
      "satf_audit_log must NOT use ON DELETE CASCADE"
    );
    // Ensure booking_reference in audit log is NOT NULL
    assert.ok(
      schemaContent.includes("booking_reference TEXT NOT NULL"),
      "satf_audit_log must keep booking_reference NOT NULL"
    );
  });

  test("satf_schema.sql defines atomic transaction RPC satf_mutate_tour_atomic", () => {
    const schemaPath = path.join(__dirname, "..", "supabase", "satf_schema.sql");
    const schemaContent = fs.readFileSync(schemaPath, "utf-8");

    assert.ok(
      schemaContent.includes("FUNCTION public.satf_mutate_tour_atomic"),
      "Schema must provide satf_mutate_tour_atomic for transactional tour and audit consistency"
    );
    assert.ok(
      schemaContent.includes("CONCURRENCY_CONFLICT"),
      "Atomic procedure must enforce optimistic concurrency checks"
    );
    assert.ok(
      schemaContent.includes("INSERT INTO public.satf_audit_log"),
      "Atomic procedure must write audit log inside the same transaction"
    );
  });

  test("logAuditEvent fails cleanly without throwing when database is unconfigured", async () => {
    const res = await logAuditEvent("tour-001", "SATF-TEST-REF", "create", "test-operator");
    assert.strictEqual(res.success, false);
    assert.ok(res.error);
    assert.ok(res.error.includes("Database not configured") || res.error.includes("audit"));
  });

  test("persistent operations fail closed when database unconfigured without claiming unverified success", async () => {
    const sampleTour: Tour = {
      id: "tour-test-atomic",
      bookingReference: "SATF-ATOMIC-01",
      group: { id: "grp-a", groupName: "Atomic Test", adultCount: 2, childCount: 0, nationality: "Japanese", language: "Japanese" },
      status: "upcoming",
      destination: "Delhi",
      arrivalDate: "2026-11-01",
      departureDate: "2026-11-05",
      flights: [],
      hotels: [],
      itinerary: [],
      assignments: [],
      specialRequests: [],
      lastUpdated: new Date().toISOString(),
    };

    const createRes = await createPersistentTour(sampleTour);
    assert.strictEqual(createRes.success, false);
    assert.strictEqual(createRes.code, "DATABASE_NOT_CONFIGURED");

    const updateRes = await updatePersistentTour(sampleTour, sampleTour.lastUpdated);
    assert.strictEqual(updateRes.success, false);
    assert.strictEqual(updateRes.code, "DATABASE_NOT_CONFIGURED");

    const cancelRes = await cancelPersistentTour("tour-test-atomic", "Reason text here", sampleTour.lastUpdated);
    assert.strictEqual(cancelRes.success, false);
    assert.strictEqual(cancelRes.code, "DATABASE_NOT_CONFIGURED");
  });

  test("satf_schema.sql revokes RPC execute permissions from untrusted callers and grants only to service_role", () => {
    const schemaPath = path.join(__dirname, "..", "supabase", "satf_schema.sql");
    const schemaContent = fs.readFileSync(schemaPath, "utf-8");

    // Must revoke from untrusted callers
    assert.ok(
      schemaContent.includes("REVOKE ALL ON FUNCTION public.satf_mutate_tour_atomic"),
      "Must explicitly revoke satf_mutate_tour_atomic from PUBLIC/anon/authenticated"
    );
    assert.ok(
      schemaContent.includes("REVOKE ALL ON FUNCTION public.satf_mutate_tour_atomic(JSONB, TEXT, TEXT, TIMESTAMPTZ) FROM anon;"),
      "Must revoke satf_mutate_tour_atomic from anon"
    );
    assert.ok(
      schemaContent.includes("GRANT EXECUTE ON FUNCTION public.satf_mutate_tour_atomic(JSONB, TEXT, TEXT, TIMESTAMPTZ) TO service_role;"),
      "Must grant satf_mutate_tour_atomic exclusively to service_role"
    );
  });

  test("executeAtomicTourMutation routes mutations to rpc/satf_mutate_tour_atomic and fails closed when unconfigured", async () => {
    const sampleTour: Tour = {
      id: "tour-atomic-route-check",
      bookingReference: "SATF-RPC-01",
      group: { id: "grp-r", groupName: "RPC Group", adultCount: 1, childCount: 0, nationality: "Japanese", language: "Japanese" },
      status: "upcoming",
      destination: "Delhi-Jaipur",
      arrivalDate: "2026-12-01",
      departureDate: "2026-12-05",
      flights: [],
      hotels: [],
      itinerary: [],
      assignments: [],
      specialRequests: [],
      lastUpdated: new Date().toISOString(),
    };

    const res = await executeAtomicTourMutation(sampleTour, "create", "test-operator");
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, "DATABASE_NOT_CONFIGURED");
  });
});
