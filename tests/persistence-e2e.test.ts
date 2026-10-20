import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";

// Load environment variables from .env.local if present
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        const key = trimmed.substring(0, idx).trim();
        const val = trimmed.substring(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

import {
  getEffectiveServerTours,
  getEffectiveServerTourById,
} from "../lib/server-tours";
import {
  getDatabaseConfigStatus,
  getPersistentTourById,
} from "../lib/operational-store";
import { createSessionToken, COOKIE_NAME } from "../lib/auth";
import {
  GET as getOperationsToursRoute,
  POST as postOperationsToursRoute,
} from "../app/api/operations/tours/route";
import {
  GET as getOperationsTourByIdRoute,
  PUT as putOperationsTourRoute,
  POST as postOperationsTourActionRoute,
} from "../app/api/operations/tours/[id]/route";
import type { Tour } from "../lib/types";

describe("Phase 20: End-to-End Persistence & UI Data Flow Verification", () => {
  const config = getDatabaseConfigStatus();
  if (!config.configured) {
    console.warn("Skipping live database E2E tests: Supabase is not configured.");
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  // Track specifically created test records for guaranteed cleanup
  const trackedTours: { id: string; bookingRef: string }[] = [];

  /**
   * Surgical cleanup helper: deletes ONLY the exact records created by the test run.
   * Deletes audit rows FIRST (and filters by both booking_reference and tour_id)
   * to prevent FK ON DELETE SET NULL from orphaning audit records with tour_id = NULL.
   */
  async function cleanupSpecificTour(tourId: string, bookingRef: string) {
    try {
      // 1. Delete audit rows by exact booking_reference (handles both tour_id set and tour_id NULL)
      await fetch(
        `${supabaseUrl}/rest/v1/satf_audit_log?booking_reference=eq.${encodeURIComponent(bookingRef)}`,
        {
          method: "DELETE",
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
          },
        }
      );

      // 2. Also delete audit rows by tour_id if any remain
      await fetch(
        `${supabaseUrl}/rest/v1/satf_audit_log?tour_id=eq.${encodeURIComponent(tourId)}`,
        {
          method: "DELETE",
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
          },
        }
      );

      // 3. Delete the operational tour row
      await fetch(
        `${supabaseUrl}/rest/v1/satf_operational_tours?id=eq.${encodeURIComponent(tourId)}`,
        {
          method: "DELETE",
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
          },
        }
      );
    } catch (err) {
      console.error(`Failed to clean up test tour ${tourId}:`, err);
    }
  }

  // Guaranteed cleanup in after() lifecycle hook (runs even if any test fails)
  after(async () => {
    for (const item of trackedTours) {
      await cleanupSpecificTour(item.id, item.bookingRef);
    }
  });

  const dummyTourId = "dummy-p20-" + Date.now();
  const dummyBookingRef = "SATF-P20-" + Math.floor(Math.random() * 90000 + 10000);
  trackedTours.push({ id: dummyTourId, bookingRef: dummyBookingRef });

  const session1 = createSessionToken("Coordinator-1", { role: "lead_coordinator" });
  const session2 = createSessionToken("Coordinator-2");

  const headersSession1: Record<string, string> = {
    host: "localhost:3000",
    origin: "http://localhost:3000",
    cookie: `${COOKIE_NAME}=${session1.token}`,
    "x-csrf-token": session1.payload.csrfToken,
    "content-type": "application/json",
  };

  const headersSession2: Record<string, string> = {
    host: "localhost:3000",
    origin: "http://localhost:3000",
    cookie: `${COOKIE_NAME}=${session2.token}`,
    "x-csrf-token": session2.payload.csrfToken,
    "content-type": "application/json",
  };

  let session1CreatedTour: Tour;
  let initialLastUpdated: string;

  test("1. Create Tour via Authenticated API (Session 1)", async () => {
    const newTourPayload = {
      id: dummyTourId,
      bookingReference: dummyBookingRef,
      group: {
        id: "grp-p20",
        groupName: "Sato Luxury Group",
        adultCount: 4,
        childCount: 0,
        nationality: "Japanese",
        language: "Japanese",
      },
      status: "upcoming" as const,
      destination: "Delhi-Agra-Varanasi",
      arrivalDate: "2026-12-05",
      departureDate: "2026-12-14",
      flights: [],
      hotels: [
        {
          id: "ht-p20-1",
          hotelName: "Taj Mahal Hotel",
          city: "Delhi",
          checkIn: "2026-12-05",
          checkOut: "2026-12-08",
          roomType: "double" as const,
          roomCount: 2,
        },
      ],
      itinerary: [],
      assignments: [
        { id: "as-1", role: "guide" as const, status: "unassigned" as const },
        { id: "as-2", role: "driver" as const, status: "unassigned" as const },
        { id: "as-3", role: "vehicle" as const, status: "unassigned" as const },
      ],
      specialRequests: [
        { id: "sr-1", category: "dietary" as const, description: "Low sodium meals", resolved: false },
      ],
      issues: [
        {
          id: "iss-1",
          severity: "medium" as const,
          category: "vehicle" as const,
          description: "Flight timing shifted by 30 mins",
          resolved: false,
        },
      ],
      operationalNotes: "VIP guest VIP welcome required at DEL T3.",
    };

    const req = new NextRequest("http://localhost:3000/api/operations/tours", {
      method: "POST",
      headers: headersSession1,
      body: JSON.stringify({ tour: newTourPayload }),
    });

    const res = await postOperationsToursRoute(req);
    assert.strictEqual(res.status, 200, `Failed to create tour: ${res.status}`);

    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.tour.id, dummyTourId);
    assert.strictEqual(data.tour.bookingReference, dummyBookingRef);
    assert.strictEqual(data.tour.group.groupName, "Sato Luxury Group");
    assert.ok(data.tour.lastUpdated, "Tour must have a lastUpdated timestamp");

    session1CreatedTour = data.tour;
    initialLastUpdated = data.tour.lastUpdated;
  });

  test("2. Hard Page Refresh & Multi-Session Visibility", async () => {
    // 2A. Server-side render (SSR) simulation for Tour Details page
    const ssrTour = await getEffectiveServerTourById(dummyTourId);
    assert.ok(ssrTour, "Tour must be loaded on SSR from persistent database on hard refresh");
    assert.strictEqual(ssrTour?.bookingReference, dummyBookingRef);
    assert.strictEqual(ssrTour?.operationalNotes, "VIP guest VIP welcome required at DEL T3.");

    // 2B. SSR simulation for Tours List / Assignments / Dashboard page
    const ssrToursList = await getEffectiveServerTours();
    const foundInList = ssrToursList.find((t) => t.id === dummyTourId);
    assert.ok(foundInList, "Tour must be present in server-rendered list without mock-only filtering");

    // 2C. Second operator session fetching the tour
    const req = new NextRequest(`http://localhost:3000/api/operations/tours/${dummyTourId}`, {
      method: "GET",
      headers: headersSession2,
    });
    const res = await getOperationsTourByIdRoute(req, { params: Promise.resolve({ id: dummyTourId }) });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.tour.id, dummyTourId);
    assert.strictEqual(data.tour.bookingReference, dummyBookingRef);
  });

  test("3. Edit Tour: Assign Guide/Driver/Vehicle, Add Notes, Resolve Issues", async () => {
    const updatedTour: Tour = {
      ...session1CreatedTour,
      assignments: [
        {
          id: "as-1",
          role: "guide",
          status: "assigned",
          name: "Kenji Sato (Japanese speaking)",
          contact: "+91-9876543210",
        },
        {
          id: "as-2",
          role: "driver",
          status: "assigned",
          name: "Rajesh Sharma",
          contact: "+91-9876501234",
        },
        {
          id: "as-3",
          role: "vehicle",
          status: "assigned",
          name: "Innova Crysta",
          vehicleType: "Innova",
          reference: "DL 1Y A 4321",
        },
      ],
      operationalNotes: "VIP guest VIP welcome required at DEL T3. Guide assigned Kenji Sato.",
      issues: [
        {
          id: "iss-1",
          category: "vehicle",
          description: "Flight timing shifted by 30 mins",
          resolved: true,
          resolvedAt: new Date().toISOString(),
          resolutionNotes: "Transfers rescheduled with driver Rajesh.",
        },
        {
          id: "iss-2",
          category: "special_request",
          description: "Extra water bottles requested in vehicle",
          resolved: false,
        },
      ],
    };

    const req = new NextRequest(`http://localhost:3000/api/operations/tours/${dummyTourId}`, {
      method: "PUT",
      headers: headersSession1,
      body: JSON.stringify({
        tour: updatedTour,
        expectedLastUpdated: initialLastUpdated,
      }),
    });

    const res = await putOperationsTourRoute(req, { params: Promise.resolve({ id: dummyTourId }) });
    assert.strictEqual(res.status, 200, `Failed to update tour: ${res.status}`);

    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.tour.assignments[0].name, "Kenji Sato (Japanese speaking)");
    assert.strictEqual(data.tour.assignments[1].name, "Rajesh Sharma");
    assert.strictEqual(data.tour.assignments[2].reference, "DL 1Y A 4321");
    assert.strictEqual(data.tour.issues.length, 2);
    assert.strictEqual(data.tour.issues[0].resolved, true);
    assert.ok(data.tour.lastUpdated !== initialLastUpdated, "lastUpdated must change upon mutation");

    session1CreatedTour = data.tour;
  });

  test("4. Optimistic Concurrency Conflict (HTTP 409)", async () => {
    // Session 2 submits a conflicting update using the STALE initialLastUpdated
    const conflictingTour: Tour = {
      ...session1CreatedTour,
      operationalNotes: "Conflicting notes from Session 2 attempting to overwrite Session 1",
    };

    const req = new NextRequest(`http://localhost:3000/api/operations/tours/${dummyTourId}`, {
      method: "PUT",
      headers: headersSession2,
      body: JSON.stringify({
        tour: conflictingTour,
        expectedLastUpdated: initialLastUpdated, // Stale!
      }),
    });

    const res = await putOperationsTourRoute(req, { params: Promise.resolve({ id: dummyTourId }) });
    assert.strictEqual(res.status, 409, `Expected HTTP 409 conflict, got ${res.status}`);

    const data = await res.json();
    assert.ok(
      data.error.includes("updated by another coordinator") || data.error.includes("modified by another operator"),
      `Unexpected conflict message: ${data.error}`
    );
  });

  test("5. Cancel Tour with Explanatory Reason", async () => {
    const cancelPayload = {
      action: "cancel",
      reason: "Client postponed entire Golden Triangle itinerary due to medical emergency.",
      expectedLastUpdated: session1CreatedTour.lastUpdated,
    };

    const req = new NextRequest(`http://localhost:3000/api/operations/tours/${dummyTourId}`, {
      method: "POST",
      headers: headersSession1,
      body: JSON.stringify(cancelPayload),
    });

    const res = await postOperationsTourActionRoute(req, { params: Promise.resolve({ id: dummyTourId }) });
    assert.strictEqual(res.status, 200, `Failed to cancel tour: ${res.status}`);

    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.tour.status, "cancelled");
    assert.strictEqual(data.tour.cancellationReason, "Client postponed entire Golden Triangle itinerary due to medical emergency.");
    assert.ok(data.tour.cancelledAt, "cancelledAt must be recorded");

    // Verify SSR reflects the cancellation
    const ssrTour = await getEffectiveServerTourById(dummyTourId);
    assert.strictEqual(ssrTour?.status, "cancelled");
    assert.strictEqual(ssrTour?.cancellationReason, cancelPayload.reason);
  });

  test("6. Security & Failure Validation", async () => {
    // 6A. Unauthenticated request -> HTTP 401
    const origBypass = process.env.SATF_DEV_AUTH_BYPASS;
    delete process.env.SATF_DEV_AUTH_BYPASS;
    try {
      const unauthReq = new NextRequest(`http://localhost:3000/api/operations/tours/${dummyTourId}`, {
        method: "GET",
      });
      const unauthRes = await getOperationsTourByIdRoute(unauthReq, { params: Promise.resolve({ id: dummyTourId }) });
      assert.strictEqual(unauthRes.status, 401);
    } finally {
      if (origBypass !== undefined) process.env.SATF_DEV_AUTH_BYPASS = origBypass;
    }

    // 6B. Invalid CSRF token -> HTTP 403
    const badCsrfHeaders = { ...headersSession1, "x-csrf-token": "tampered-csrf-token" };
    const badCsrfReq = new NextRequest("http://localhost:3000/api/operations/tours", {
      method: "POST",
      headers: badCsrfHeaders,
      body: JSON.stringify({ id: "dummy-bad-csrf" }),
    });
    const badCsrfRes = await postOperationsToursRoute(badCsrfReq);
    assert.strictEqual(badCsrfRes.status, 403);

    // 6C. Short cancellation reason (< 5 characters) -> HTTP 400
    const shortReasonReq = new NextRequest(`http://localhost:3000/api/operations/tours/${dummyTourId}`, {
      method: "POST",
      headers: headersSession1,
      body: JSON.stringify({ action: "cancel", reason: "no" }),
    });
    const shortReasonRes = await postOperationsTourActionRoute(shortReasonReq, { params: Promise.resolve({ id: dummyTourId }) });
    assert.strictEqual(shortReasonRes.status, 400);

    // 6D. Invalid date range (departure before arrival) -> HTTP 400
    const badDatesReq = new NextRequest("http://localhost:3000/api/operations/tours", {
      method: "POST",
      headers: headersSession1,
      body: JSON.stringify({
        tour: {
          id: "dummy-bad-dates-validation",
          bookingReference: "SATF-BAD-VAL",
          group: { groupName: "Bad Group", adultCount: 1, childCount: 0, nationality: "Japanese", language: "Japanese" },
          status: "upcoming",
          arrivalDate: "2026-12-10",
          departureDate: "2026-12-05", // before arrival!
        },
      }),
    });
    const badDatesRes = await postOperationsToursRoute(badDatesReq);
    assert.strictEqual(badDatesRes.status, 400);
  });

  test("7. Audit Log Integrity in Supabase & Targeted Test Cleanup", async () => {
    // Query audit log by exact booking reference
    const auditRes = await fetch(
      `${supabaseUrl}/rest/v1/satf_audit_log?booking_reference=eq.${encodeURIComponent(dummyBookingRef)}&select=*&order=created_at.asc`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    );
    assert.strictEqual(auditRes.status, 200, "Failed to query audit log");
    const auditRows = await auditRes.json();
    assert.strictEqual(auditRows.length, 3, `Expected 3 audit rows (create, update, cancel), found ${auditRows.length}`);

    const [createAudit, updateAudit, cancelAudit] = auditRows;
    assert.strictEqual(createAudit.action, "create");
    assert.strictEqual(createAudit.operator, "Coordinator-1");
    assert.strictEqual(updateAudit.action, "update");
    assert.strictEqual(updateAudit.operator, "Coordinator-1");
    assert.strictEqual(cancelAudit.action, "cancel");
    assert.strictEqual(cancelAudit.operator, "Coordinator-1");

    // Execute surgical cleanup for this specific test tour and its audit records
    await cleanupSpecificTour(dummyTourId, dummyBookingRef);

    // Verify deletion of operational tour
    const verifyDelete = await getPersistentTourById(dummyTourId);
    assert.strictEqual(verifyDelete.data, null, "Dummy tour must be fully deleted from Supabase");

    // Verify deletion of audit records
    const verifyAuditRes = await fetch(
      `${supabaseUrl}/rest/v1/satf_audit_log?booking_reference=eq.${encodeURIComponent(dummyBookingRef)}&select=id`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    );
    const remainingAudits = await verifyAuditRes.json();
    assert.strictEqual(remainingAudits.length, 0, "All audit records for this test tour must be deleted");
  });

  test("8. Regression: Cleanup handles audit rows when tour is deleted first (tour_id IS NULL)", async () => {
    const regressTourId = "dummy-p20-regress-" + Date.now();
    const regressBookingRef = "SATF-P20-REG-" + Math.floor(Math.random() * 90000 + 10000);
    trackedTours.push({ id: regressTourId, bookingRef: regressBookingRef });

    // Create tour
    const req = new NextRequest("http://localhost:3000/api/operations/tours", {
      method: "POST",
      headers: headersSession1,
      body: JSON.stringify({
        tour: {
          id: regressTourId,
          bookingReference: regressBookingRef,
          group: { id: "grp-reg", groupName: "Regression Group", adultCount: 2, childCount: 0, nationality: "Japanese", language: "Japanese" },
          status: "upcoming" as const,
          destination: "Delhi-Agra",
          arrivalDate: "2026-12-05",
          departureDate: "2026-12-10",
          flights: [],
          hotels: [],
          itinerary: [],
          assignments: [],
          specialRequests: [],
        },
      }),
    });

    const res = await postOperationsToursRoute(req);
    assert.strictEqual(res.status, 200);

    // Intentionally simulate deleting the tour first:
    // This triggers PostgreSQL's ON DELETE SET NULL on satf_audit_log
    const deleteTourDirect = await fetch(
      `${supabaseUrl}/rest/v1/satf_operational_tours?id=eq.${encodeURIComponent(regressTourId)}`,
      {
        method: "DELETE",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    );
    assert.ok(deleteTourDirect.status === 200 || deleteTourDirect.status === 204);

    // Confirm that the audit row now has tour_id = null but still has booking_reference
    const checkAuditNull = await fetch(
      `${supabaseUrl}/rest/v1/satf_audit_log?booking_reference=eq.${encodeURIComponent(regressBookingRef)}&select=id,tour_id`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    );
    const nullRows = await checkAuditNull.json();
    assert.strictEqual(nullRows.length, 1);
    assert.strictEqual(nullRows[0].tour_id, null, "Foreign key ON DELETE SET NULL must have nullified tour_id");

    // Now execute cleanupSpecificTour: it must successfully purge rows even when tour_id is null!
    await cleanupSpecificTour(regressTourId, regressBookingRef);

    // Confirm audit row was deleted
    const verifyPurged = await fetch(
      `${supabaseUrl}/rest/v1/satf_audit_log?booking_reference=eq.${encodeURIComponent(regressBookingRef)}&select=id`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    );
    const purgedRows = await verifyPurged.json();
    assert.strictEqual(purgedRows.length, 0, "Cleanup must purge audit row even when tour_id is null");
  });

  test("9. Regression: Cleanup executes inside a try-finally block on failure", async () => {
    const throwTourId = "dummy-p20-throw-" + Date.now();
    const throwBookingRef = "SATF-P20-THRW-" + Math.floor(Math.random() * 90000 + 10000);
    trackedTours.push({ id: throwTourId, bookingRef: throwBookingRef });

    // Create tour
    const req = new NextRequest("http://localhost:3000/api/operations/tours", {
      method: "POST",
      headers: headersSession1,
      body: JSON.stringify({
        tour: {
          id: throwTourId,
          bookingReference: throwBookingRef,
          group: { id: "grp-thrw", groupName: "Throw Test Group", adultCount: 1, childCount: 0, nationality: "Japanese", language: "Japanese" },
          status: "upcoming" as const,
          destination: "Delhi",
          arrivalDate: "2026-12-05",
          departureDate: "2026-12-08",
          flights: [],
          hotels: [],
          itinerary: [],
          assignments: [],
          specialRequests: [],
        },
      }),
    });
    const res = await postOperationsToursRoute(req);
    assert.strictEqual(res.status, 200);

    // Simulate an unexpected failure during test execution within try-finally
    let errorCaught = false;
    try {
      try {
        throw new Error("Simulated test failure inside coordinator workflow");
      } finally {
        await cleanupSpecificTour(throwTourId, throwBookingRef);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("Simulated test failure")) {
        errorCaught = true;
      }
    }

    assert.strictEqual(errorCaught, true, "Simulated error must be captured");

    // Verify cleanup executed despite the error
    const tourCheck = await getPersistentTourById(throwTourId);
    assert.strictEqual(tourCheck.data, null, "Tour must be cleaned up in finally block");

    const auditCheck = await fetch(
      `${supabaseUrl}/rest/v1/satf_audit_log?booking_reference=eq.${encodeURIComponent(throwBookingRef)}&select=id`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    );
    const auditRows = await auditCheck.json();
    assert.strictEqual(auditRows.length, 0, "Audit rows must be cleaned up in finally block");
  });
});
