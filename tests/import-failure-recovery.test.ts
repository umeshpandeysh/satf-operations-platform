import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  batchUpsertPersistentTours,
  getPersistentTours,
  tourToRow,
  rowToTour,
} from "../lib/operational-store";
import { POST as commitRoute } from "../app/api/import/commit/route";
import { createSessionToken, COOKIE_NAME } from "../lib/auth";
import type { Tour, ImportPreviewResult } from "../lib/types";

// In-memory Supabase Mock Engine
class MockSupabaseDatabase {
  tours = new Map<string, any>();
  auditLogs: any[] = [];
  shouldFailOnId = new Set<string>();
  failErrorText = "SIMULATED_TRANSACTION_FAILURE: Simulated PostgreSQL RPC error";

  reset() {
    this.tours.clear();
    this.auditLogs = [];
    this.shouldFailOnId.clear();
  }

  handleFetch(url: string, init?: RequestInit): Response {
    const urlStr = String(url);

    // 1. RPC satf_mutate_tour_atomic
    if (urlStr.includes("rpc/satf_mutate_tour_atomic")) {
      const payload = JSON.parse(String(init?.body || "{}"));
      const { p_tour, p_action, p_operator } = payload;
      const tourId = String(p_tour?.id || "").toLowerCase();

      // Check if this tour should fail
      if (this.shouldFailOnId.has(tourId)) {
        return new Response(this.failErrorText, {
          status: 500,
          headers: { "Content-Type": "text/plain" },
        });
      }

      // Successful mutation: commit row and audit record atomically
      const rowToStore = {
        ...p_tour,
        last_updated: new Date().toISOString(),
      };
      this.tours.set(tourId, rowToStore);

      this.auditLogs.push({
        id: `audit-${this.auditLogs.length + 1}`,
        tour_id: p_tour.id,
        booking_reference: p_tour.booking_reference,
        action: p_action,
        operator: p_operator || "coordinator",
        created_at: new Date().toISOString(),
      });

      return new Response(JSON.stringify(rowToStore), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 2. Select all tours: satf_operational_tours?select=*
    if (urlStr.includes("satf_operational_tours?select=*")) {
      return new Response(JSON.stringify(Array.from(this.tours.values())), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 3. Select single tour by ID: satf_operational_tours?id=eq.
    if (urlStr.includes("satf_operational_tours?id=eq.")) {
      const match = urlStr.match(/id=eq\.([^&]+)/);
      const id = match ? decodeURIComponent(match[1]).toLowerCase() : "";
      const found = this.tours.get(id);
      return new Response(JSON.stringify(found ? [found] : []), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 4. Audit log query: satf_audit_log
    if (urlStr.includes("satf_audit_log")) {
      return new Response(JSON.stringify(this.auditLogs), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404 });
  }
}

const mockDb = new MockSupabaseDatabase();

// Test Fixtures
function createTestTours(): Tour[] {
  return [
    {
      id: "satf-101",
      bookingReference: "REF-101",
      sourceRecordId: "SHEET:R1:REF-101",
      status: "upcoming",
      destination: "Delhi-Agra",
      arrivalDate: "2026-11-01",
      departureDate: "2026-11-06",
      group: { id: "g1", groupName: "TANAKA YUKI", adultCount: 2, childCount: 0, nationality: "Japanese", language: "Japanese" },
      flights: [],
      hotels: [],
      itinerary: [],
      assignments: [],
      specialRequests: [],
      lastUpdated: "2026-10-19T00:00:00Z",
    },
    {
      id: "satf-102",
      bookingReference: "REF-102",
      sourceRecordId: "SHEET:R2:REF-102",
      status: "upcoming",
      destination: "Jaipur-Jodhpur",
      arrivalDate: "2026-11-02",
      departureDate: "2026-11-07",
      group: { id: "g2", groupName: "SATO KENJI", adultCount: 1, childCount: 0, nationality: "Japanese", language: "Japanese" },
      flights: [],
      hotels: [],
      itinerary: [],
      assignments: [],
      specialRequests: [],
      lastUpdated: "2026-10-19T00:00:00Z",
    },
    {
      id: "satf-103",
      bookingReference: "REF-103",
      sourceRecordId: "SHEET:R3:REF-103",
      status: "upcoming",
      destination: "Varanasi",
      arrivalDate: "2026-11-03",
      departureDate: "2026-11-08",
      group: { id: "g3", groupName: "SUZUKI EMI", adultCount: 2, childCount: 0, nationality: "Japanese", language: "Japanese" },
      flights: [],
      hotels: [],
      itinerary: [],
      assignments: [],
      specialRequests: [],
      lastUpdated: "2026-10-19T00:00:00Z",
    },
    {
      id: "satf-104-oct-16-r18",
      bookingReference: "REF-104",
      sourceRecordId: "OCT-16:R18:REF-104",
      status: "upcoming",
      destination: "Golden Triangle",
      arrivalDate: "2016-10-05",
      departureDate: "2016-10-10",
      group: { id: "g4", groupName: "WATANABE HIROSHI", adultCount: 1, childCount: 0, nationality: "Japanese", language: "Japanese" },
      flights: [],
      hotels: [],
      itinerary: [],
      assignments: [],
      specialRequests: [],
      lastUpdated: "2026-10-19T00:00:00Z",
    },
    {
      id: "satf-104-oct-16-r24",
      bookingReference: "REF-104",
      sourceRecordId: "OCT-16:R24:REF-104",
      status: "upcoming",
      destination: "Golden Triangle",
      arrivalDate: "2016-10-06",
      departureDate: "2016-10-12",
      group: { id: "g5", groupName: "ITO MEGUMI", adultCount: 2, childCount: 0, nationality: "Japanese", language: "Japanese" },
      flights: [],
      hotels: [],
      itinerary: [],
      assignments: [],
      specialRequests: [],
      lastUpdated: "2026-10-19T00:00:00Z",
    },
  ];
}

describe("Phase 38 — Import Failure Recovery & Idempotent Retry Verification", () => {
  let originalFetch: typeof globalThis.fetch;
  let originalSupabaseUrl: string | undefined;
  let originalServiceKey: string | undefined;

  beforeEach(() => {
    mockDb.reset();
    originalFetch = globalThis.fetch;
    originalSupabaseUrl = process.env.SUPABASE_URL;
    originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    process.env.SUPABASE_URL = "https://mock-supabase.local";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "mock-service-role-key-test";

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = String(input);
      if (urlStr.includes("mock-supabase.local")) {
        return mockDb.handleFetch(urlStr, init);
      }
      return originalFetch(input, init);
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.SUPABASE_URL = originalSupabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
    mockDb.reset();
  });

  test("1. Simulated partial failure records succeeded items, halts on error, and reports failed record", async () => {
    const incoming = createTestTours();
    // Inject failure on Tour #3
    mockDb.shouldFailOnId.add("satf-103");

    const existing: Tour[] = [];
    const summary = await batchUpsertPersistentTours(incoming, existing, "test-coordinator");

    // Total 5 attempted, 4 succeeded, 1 failed
    assert.strictEqual(summary.totalAttempted, 5);
    assert.strictEqual(summary.inserted, 4);
    assert.strictEqual(summary.failed, 1);
    assert.strictEqual(summary.skipped, 0);
    assert.strictEqual(summary.success, false);

    // Verify item-level details
    const failedItem = summary.items.find((i) => i.action === "failed");
    assert.ok(failedItem);
    assert.strictEqual(failedItem.tourId, "satf-103");
    assert.strictEqual(failedItem.sourceRecordId, "SHEET:R3:REF-103");
    assert.ok(failedItem.error?.includes("SIMULATED_TRANSACTION_FAILURE"));

    // Verify database state: exactly 4 records committed
    assert.strictEqual(mockDb.tours.size, 4);
    assert.ok(mockDb.tours.has("satf-101"));
    assert.ok(mockDb.tours.has("satf-102"));
    assert.ok(!mockDb.tours.has("satf-103")); // Rolled back / not committed
    assert.ok(mockDb.tours.has("satf-104-oct-16-r18"));
    assert.ok(mockDb.tours.has("satf-104-oct-16-r24"));

    // Verify audit logs: exactly 4 entries created (none for failed tour 103)
    assert.strictEqual(mockDb.auditLogs.length, 4);
    assert.ok(!mockDb.auditLogs.some((a) => a.tour_id === "satf-103"));
  });

  test("2. Idempotent retry skips previously inserted records and commits remaining records without duplicates", async () => {
    const incoming = createTestTours();

    // Step A: First run with failure on Tour #3
    mockDb.shouldFailOnId.add("satf-103");
    const run1 = await batchUpsertPersistentTours(incoming, [], "test-coordinator");
    assert.strictEqual(run1.inserted, 4);
    assert.strictEqual(run1.failed, 1);
    assert.strictEqual(mockDb.tours.size, 4);

    // Step B: Clear failure condition (transient error resolved)
    mockDb.shouldFailOnId.clear();

    // Fetch existing tours currently in database
    const existingDbRes = await getPersistentTours();
    assert.strictEqual(existingDbRes.success, true);
    const existingTours = existingDbRes.data || [];
    assert.strictEqual(existingTours.length, 4);

    // Step C: Retry the identical staged import against the database
    const run2 = await batchUpsertPersistentTours(incoming, existingTours, "test-coordinator");

    // Verification of retry summary:
    // 4 previously committed records must be SKIPPED
    // 1 previously failed record (satf-103) must be INSERTED
    // 0 failed
    assert.strictEqual(run2.totalAttempted, 5);
    assert.strictEqual(run2.skipped, 4, "Previously committed records must be skipped");
    assert.strictEqual(run2.inserted, 1, "Only the previously failed record must be inserted");
    assert.strictEqual(run2.failed, 0);
    assert.strictEqual(run2.success, true);

    // Total records in database must be exactly 5 (ZERO duplicates)
    assert.strictEqual(mockDb.tours.size, 5);
    assert.ok(mockDb.tours.has("satf-101"));
    assert.ok(mockDb.tours.has("satf-102"));
    assert.ok(mockDb.tours.has("satf-103"));
    assert.ok(mockDb.tours.has("satf-104-oct-16-r18"));
    assert.ok(mockDb.tours.has("satf-104-oct-16-r24"));

    // Both repeated booking references preserved as distinct records
    const ref104A = mockDb.tours.get("satf-104-oct-16-r18");
    const ref104B = mockDb.tours.get("satf-104-oct-16-r24");
    assert.ok(ref104A && ref104B);
    assert.notStrictEqual(ref104A.id, ref104B.id);
    assert.strictEqual(ref104A.booking_reference, "REF-104");
    assert.strictEqual(ref104B.booking_reference, "REF-104");

    // Audit logs: total 5 audit logs (4 from run 1 + 1 from run 2)
    assert.strictEqual(mockDb.auditLogs.length, 5);
  });

  test("3. Coordinator overrides on existing records are preserved on retry without duplicate creation", async () => {
    const incoming = createTestTours();

    // Step A: Initial successful import of Tour #1
    mockDb.shouldFailOnId.add("satf-102");
    mockDb.shouldFailOnId.add("satf-103");
    mockDb.shouldFailOnId.add("satf-104-oct-16-r18");
    mockDb.shouldFailOnId.add("satf-104-oct-16-r24");
    await batchUpsertPersistentTours(incoming, [], "test-coordinator");
    assert.strictEqual(mockDb.tours.size, 1);

    // Step B: Operator assigns a driver and hotel confirmation to Tour #1
    const tour1Row = mockDb.tours.get("satf-101");
    const tour1 = rowToTour(tour1Row);
    tour1.assignments = [{ id: "as-1", role: "driver", name: "Ramesh Sharma", status: "assigned" }];
    tour1.operationalNotes = "VIP coordinator request: vegetarian Jain meals";
    mockDb.tours.set("satf-101", tourToRow(tour1));

    // Step C: Clear failure for all tours and retry import
    mockDb.shouldFailOnId.clear();
    const existingDbRes = await getPersistentTours();
    const runRetry = await batchUpsertPersistentTours(incoming, existingDbRes.data || [], "test-coordinator");

    // Tour 1 was merged & updated (driver and notes preserved), remaining 4 inserted
    assert.strictEqual(runRetry.updated, 1, "Tour 1 with coordinator changes was merged and updated");
    assert.strictEqual(runRetry.inserted, 4, "Remaining 4 tours were inserted");
    assert.strictEqual(runRetry.failed, 0);
    assert.strictEqual(mockDb.tours.size, 5);

    // Check Tour 1 preserves coordinator assignments in database
    const updatedTour1 = rowToTour(mockDb.tours.get("satf-101"));
    assert.strictEqual(updatedTour1.assignments.find((a) => a.role === "driver")?.name, "Ramesh Sharma");
    assert.strictEqual(updatedTour1.operationalNotes, "VIP coordinator request: vegetarian Jain meals");
  });

  test("4. Import commit endpoint returns HTTP 500 PARTIAL_PERSISTENCE_FAILURE when database mutation fails", async () => {
    const incoming = createTestTours();
    const previewPayload: ImportPreviewResult = {
      success: true,
      summary: {
        workbookName: "TEST.xls",
        importTimestamp: "2026-10-19T00:00:00Z",
        totalSheetsFound: 1,
        operationalSheetsCount: 1,
        totalTourBlocks: 5,
        canonicalToursCount: 5,
        spanningToursCount: 0,
        amendedToursCount: 0,
        duplicateRowsCount: 0,
        dateAmbiguityCount: 0,
        unassignedGuidesCount: 0,
        sheetsSummary: [],
      },
      tours: incoming,
      ambiguities: [],
      duplicates: [],
      errors: [],
    };

    // Fail tour #3
    mockDb.shouldFailOnId.add("satf-103");

    const { token, payload } = createSessionToken("Lead Coordinator");
    const req = new NextRequest("http://localhost:3000/api/import/commit", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        cookie: `${COOKIE_NAME}=${token}`,
        "x-csrf-token": payload.csrfToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        payload: previewPayload,
        dryRun: false, // Live import attempt against mocked Supabase
      }),
    });

    const res = await commitRoute(req);
    assert.strictEqual(res.status, 500);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.code, "PARTIAL_PERSISTENCE_FAILURE");
    assert.ok(data.error.includes("Partial database write failure: 1 of 5 record(s) failed"));
    assert.strictEqual(data.batchSummary.totalAttempted, 5);
    assert.strictEqual(data.batchSummary.inserted, 4);
    assert.strictEqual(data.batchSummary.failed, 1);
  });
});
