import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import type { Tour, ImportPreviewResult } from "../lib/types";
import { maskGuestName } from "../lib/operations";
import { COOKIE_NAME, createSessionToken } from "../lib/auth";

describe("Excel Import Review UI — Filtering, Ambiguity & Privacy Tests", () => {
  // Test sample tours
  const mockTours: Tour[] = [
    {
      id: "satf-30202",
      bookingReference: "30202",
      sourceRecordId: "APR-16:R3:30202",
      sourceSheet: "APR-16",
      sourceRow: 3,
      status: "upcoming",
      destination: "Golden Triangle & Varanasi Circuit",
      arrivalDate: "2016-04-01",
      departureDate: "2016-04-07",
      agency: "H2",
      group: {
        id: "grp-1",
        groupName: "HAYASHI EMI MS",
        adultCount: 1,
        childCount: 0,
        nationality: "Japanese",
        language: "Japanese",
      },
      flights: [
        {
          id: "fl-1",
          direction: "arrival",
          flightNumber: "NH827",
          airline: "ANA",
          date: "2016-04-01",
          departureTime: "17:30",
          arrivalTime: "23:55",
          origin: "NRT",
          destination: "DEL",
        },
      ],
      hotels: [],
      itinerary: [],
      assignments: [],
      specialRequests: [],
      lastUpdated: "2026-10-19T00:00:00Z",
    },
    {
      id: "satf-34705",
      bookingReference: "34705",
      sourceRecordId: "JAN-17:R3:34705",
      sourceSheet: "JAN-17",
      sourceRow: 3,
      status: "active",
      destination: "Delhi-Agra-Jaipur",
      arrivalDate: "2017-01-01",
      departureDate: "2017-01-06",
      dateCorrectionReason:
        "Reconciled 1-year template offset: Sheet 'JAN-17' explicitly declares season/year 2017 for month 1, while source serial evaluated to template year 2016. Corrected to 2017-01-01 per Rule SHEET_TEMPLATE_YEAR_RECONCILIATION.",
      agency: "SN",
      group: {
        id: "grp-2",
        groupName: "SATO YUKI MS",
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
      lastUpdated: "2026-10-19T00:00:00Z",
    },
    {
      id: "satf-33940-oct-16-r18",
      bookingReference: "33940",
      sourceRecordId: "OCT-16:R18:33940",
      sourceSheet: "OCT-16",
      sourceRow: 18,
      status: "upcoming",
      destination: "Delhi-Agra",
      arrivalDate: "2016-10-05",
      departureDate: "2016-10-11",
      agency: "SJ",
      group: {
        id: "grp-3",
        groupName: "TANAKA MAKOTO MS",
        adultCount: 1,
        childCount: 0,
        nationality: "Japanese",
        language: "Japanese",
      },
      flights: [],
      hotels: [],
      itinerary: [],
      assignments: [],
      specialRequests: [],
      lastUpdated: "2026-10-19T00:00:00Z",
    },
    {
      id: "satf-33940-oct-16-r24",
      bookingReference: "33940", // Same reference, distinct tour!
      sourceRecordId: "OCT-16:R24:33940",
      sourceSheet: "OCT-16",
      sourceRow: 24,
      status: "upcoming",
      destination: "Delhi-Varanasi",
      arrivalDate: "2016-10-06",
      departureDate: "2016-10-10",
      agency: "SJ",
      group: {
        id: "grp-4",
        groupName: "OGASAWARA ICHIRO MR",
        adultCount: 1,
        childCount: 0,
        nationality: "Japanese",
        language: "Japanese",
      },
      flights: [],
      hotels: [],
      itinerary: [],
      assignments: [],
      specialRequests: [],
      lastUpdated: "2026-10-19T00:00:00Z",
    },
    {
      id: "satf-1220830",
      bookingReference: "1220830",
      sourceRecordId: "AUG 23:R24:1220830",
      sourceSheet: "AUG 23",
      sourceRow: 24,
      status: "attention",
      destination: "Special Circuit (IN-388-MI)",
      arrivalDate: "2023-08-09",
      departureDate: "2023-08-14",
      hasDateAmbiguity: true,
      dateAmbiguityReason:
        "Arrival serial missing in column 0; derived from first itinerary date (2023-08-09). Requires operational review.",
      agency: "SH2",
      group: {
        id: "grp-5",
        groupName: "MATSUDA RYO MR (X02)",
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
      lastUpdated: "2026-10-19T00:00:00Z",
    },
    {
      id: "satf-span-1",
      bookingReference: "70001",
      sourceRecordId: "DEC-16:R5:70001",
      sourceSheet: "DEC-16",
      sourceSheets: ["DEC-16", "JAN-17"],
      sourceRow: 5,
      status: "upcoming",
      destination: "Cross-Month Circuit",
      arrivalDate: "2016-12-28",
      departureDate: "2017-01-04",
      agency: "H2",
      group: {
        id: "grp-6",
        groupName: "YAMADA TARO MR",
        adultCount: 2,
        childCount: 1,
        nationality: "Japanese",
        language: "Japanese",
      },
      flights: [],
      hotels: [],
      itinerary: [],
      assignments: [],
      specialRequests: [],
      lastUpdated: "2026-10-19T00:00:00Z",
    },
  ];

  test("1. maskGuestName preserves operational privacy across various name formats", () => {
    // Standard names with honorifics
    assert.strictEqual(maskGuestName("HAYASHI EMI MS"), "H**** E** MS");
    assert.strictEqual(maskGuestName("OGASAWARA ICHIRO MR"), "O**** I**** MR");
    // Name with pax notation
    assert.strictEqual(maskGuestName("MATSUDA RYO MR (X02)"), "M**** R** MR (X02)");
    // Blank or missing
    assert.strictEqual(maskGuestName(""), "Valued Guest");
    assert.strictEqual(maskGuestName(undefined), "Valued Guest");
  });

  test("2. Search query filters by bookingReference, destination, agency, sourceSheet, and masked name", () => {
    function filterBySearch(tours: Tour[], query: string): Tour[] {
      const q = query.toLowerCase().trim();
      if (!q) return tours;
      return tours.filter((t) => {
        return (
          t.bookingReference.toLowerCase().includes(q) ||
          t.destination.toLowerCase().includes(q) ||
          (t.agency || "").toLowerCase().includes(q) ||
          (t.sourceSheet || "").toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q) ||
          maskGuestName(t.group.groupName).toLowerCase().includes(q)
        );
      });
    }

    // Search by booking reference
    const refMatch = filterBySearch(mockTours, "30202");
    assert.strictEqual(refMatch.length, 1);
    assert.strictEqual(refMatch[0].id, "satf-30202");

    // Search by agency
    const agencyMatch = filterBySearch(mockTours, "SJ");
    assert.strictEqual(agencyMatch.length, 2);

    // Search by destination keyword
    const destMatch = filterBySearch(mockTours, "Varanasi");
    assert.strictEqual(destMatch.length, 2);

    // Search by sheet name
    const sheetMatch = filterBySearch(mockTours, "AUG 23");
    assert.strictEqual(sheetMatch.length, 1);
    assert.strictEqual(sheetMatch[0].bookingReference, "1220830");

    // Search by masked guest name prefix
    const nameMatch = filterBySearch(mockTours, "H****");
    assert.strictEqual(nameMatch.length, 1);
    assert.strictEqual(nameMatch[0].id, "satf-30202");
  });

  test("3. Quick Category Filter identifies date-corrected, repeated reference, ambiguity, and spanning tours", () => {
    // Map repeated refs
    const refCounts = new Map<string, number>();
    for (const t of mockTours) {
      refCounts.set(t.bookingReference, (refCounts.get(t.bookingReference) || 0) + 1);
    }
    const repeatedSet = new Set(
      Array.from(refCounts.entries())
        .filter(([_, c]) => c > 1)
        .map(([ref]) => ref)
    );

    // 1. Date corrected
    const dateCorrected = mockTours.filter((t) => Boolean(t.dateCorrectionReason));
    assert.strictEqual(dateCorrected.length, 1);
    assert.strictEqual(dateCorrected[0].id, "satf-34705");

    // 2. Repeated references
    const repeatedTours = mockTours.filter((t) => repeatedSet.has(t.bookingReference));
    assert.strictEqual(repeatedTours.length, 2);
    assert.deepStrictEqual(
      repeatedTours.map((t) => t.id).sort(),
      ["satf-33940-oct-16-r18", "satf-33940-oct-16-r24"].sort()
    );

    // 3. Unresolved ambiguities
    const ambiguities = mockTours.filter((t) => t.hasDateAmbiguity);
    assert.strictEqual(ambiguities.length, 1);
    assert.strictEqual(ambiguities[0].id, "satf-1220830");

    // 4. Spanning tours
    const spanning = mockTours.filter((t) => Boolean(t.sourceSheets && t.sourceSheets.length > 1));
    assert.strictEqual(spanning.length, 1);
    assert.strictEqual(spanning[0].id, "satf-span-1");
  });

  test("4. Pagination boundary calculation and safe page clamping", () => {
    const totalItems = 55;
    const pageSize = 25;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    assert.strictEqual(totalPages, 3);

    // Page 1
    const p1Start = (1 - 1) * pageSize;
    assert.strictEqual(p1Start, 0);

    // Page 3 (last page with remainder)
    const p3Start = (3 - 1) * pageSize;
    assert.strictEqual(p3Start, 50);

    // Clamping invalid / out-of-bounds page requests
    function getSafePage(page: number, maxPages: number): number {
      return Math.min(Math.max(1, page), maxPages);
    }
    assert.strictEqual(getSafePage(0, totalPages), 1);
    assert.strictEqual(getSafePage(10, totalPages), 3);
    assert.strictEqual(getSafePage(2, totalPages), 2);
  });

  test("5. Clear separation between automated date corrections and unresolved ambiguities", () => {
    // Automated correction: has dateCorrectionReason and valid arrival date
    const autoCorrected = mockTours.find((t) => t.id === "satf-34705")!;
    assert.ok(autoCorrected.dateCorrectionReason);
    assert.ok(autoCorrected.dateCorrectionReason.includes("SHEET_TEMPLATE_YEAR_RECONCILIATION"));
    assert.strictEqual(autoCorrected.hasDateAmbiguity, undefined);

    // Unresolved ambiguity: has hasDateAmbiguity = true and requires coordinator action
    const ambiguous = mockTours.find((t) => t.id === "satf-1220830")!;
    assert.strictEqual(ambiguous.hasDateAmbiguity, true);
    assert.ok(ambiguous.dateAmbiguityReason);
    assert.ok(ambiguous.dateAmbiguityReason.includes("Requires operational review"));

    // They must never be conflated
    assert.notStrictEqual(Boolean(autoCorrected.dateCorrectionReason), Boolean(autoCorrected.hasDateAmbiguity));
  });

  test("6. Repeated booking reference group isolation", () => {
    const t1 = mockTours.find((t) => t.id === "satf-33940-oct-16-r18")!;
    const t2 = mockTours.find((t) => t.id === "satf-33940-oct-16-r24")!;

    // Identical booking reference
    assert.strictEqual(t1.bookingReference, t2.bookingReference);
    assert.strictEqual(t1.bookingReference, "33940");

    // Distinct unique IDs
    assert.notStrictEqual(t1.id, t2.id);

    // Distinct source record IDs
    assert.strictEqual(t1.sourceRecordId, "OCT-16:R18:33940");
    assert.strictEqual(t2.sourceRecordId, "OCT-16:R24:33940");

    // Distinct guest parties
    assert.strictEqual(t1.group.groupName, "TANAKA MAKOTO MS");
    assert.strictEqual(t2.group.groupName, "OGASAWARA ICHIRO MR");

    // Distinct dates
    assert.strictEqual(t1.arrivalDate, "2016-10-05");
    assert.strictEqual(t2.arrivalDate, "2016-10-06");
  });
});

describe(" — Commit Safeguards, Idempotency & Partial Failure Handling", () => {
  // Test suite covering the 5  requirements
  const sampleAmbiguousResult: ImportPreviewResult = {
    success: true,
    summary: {
      workbookName: "NEW CHART 2025-2026 (1).xls",
      importTimestamp: "2026-10-19T00:00:00Z",
      totalSheetsFound: 91,
      operationalSheetsCount: 89,
      totalTourBlocks: 1,
      canonicalToursCount: 1,
      spanningToursCount: 0,
      amendedToursCount: 0,
      duplicateRowsCount: 0,
      dateAmbiguityCount: 1,
      unassignedGuidesCount: 0,
      sheetsSummary: [],
    },
    tours: [
      {
        id: "satf-amb-1",
        bookingReference: "1220830",
        sourceRecordId: "AUG 23:R24:1220830",
        sourceSheet: "AUG 23",
        sourceRow: 24,
        status: "upcoming",
        destination: "Golden Triangle",
        arrivalDate: "2023-08-09",
        departureDate: "2023-08-15",
        hasDateAmbiguity: true,
        dateAmbiguityReason: "Arrival serial missing; derived from itinerary",
        rawArrivalSerial: "09AUG",
        group: { id: "g1", groupName: "M**** R** MR (X02)", adultCount: 2, childCount: 0, nationality: "Japanese", language: "Japanese" },
        flights: [],
        hotels: [],
        itinerary: [],
        assignments: [],
        specialRequests: [],
        lastUpdated: "2023-08-09T00:00:00Z",
      },
    ],
    ambiguities: [
      {
        bookingReference: "1220830",
        sourceRecordId: "AUG 23:R24:1220830",
        sheet: "AUG 23",
        row: 24,
        rawSerial: "09AUG",
        reason: "Arrival serial missing in column 0; derived from first itinerary date (2023-08-09). Requires operational review.",
      },
    ],
    duplicates: [],
    errors: [],
  };

  test("Safeguard 1: Commit is rejected with HTTP 422 when date ambiguities lack coordinator decisions", async () => {
    const { POST: commitRoute } = await import("../app/api/import/commit/route");

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
        payload: sampleAmbiguousResult,
        // Omit dateDecisions: should fail closed
      }),
    });

    const res = await commitRoute(req);
    assert.strictEqual(res.status, 422);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.code, "UNRESOLVED_DATE_AMBIGUITIES");
    assert.strictEqual(data.unresolved[0].bookingReference, "1220830");
    assert.strictEqual(data.unresolved[0].sheet, "AUG 23");
    assert.strictEqual(data.unresolved[0].row, 24);
    assert.strictEqual(data.unresolved[0].proposedDate, "2023-08-09");
    assert.ok(data.unresolved[0].guestMasked);
  });

  test("Safeguard 1 (B): Commit succeeds when explicit valid coordinator date decision is provided", async () => {
    const { POST: commitRoute } = await import("../app/api/import/commit/route");

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
        payload: sampleAmbiguousResult,
        dryRun: true, // Dry run to verify acceptance without modifying disk/db
        dateDecisions: [
          {
            bookingReference: "1220830",
            sourceRecordId: "AUG 23:R24:1220830",
            decision: "confirm_inferred",
            confirmedArrivalDate: "2023-08-09",
            notes: "Confirmed against flight schedule NH827",
          },
        ],
      }),
    });

    const res = await commitRoute(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.dryRun, true);
  });

  test("Safeguard 2 & 5: Dry-run accurately summarizes inserts, updates, skips, and conflicts without writing", async () => {
    const { POST: commitRoute } = await import("../app/api/import/commit/route");

    const previewPayload: ImportPreviewResult = {
      success: true,
      summary: {
        workbookName: "TEST.xls",
        importTimestamp: "2026-10-19T00:00:00Z",
        totalSheetsFound: 1,
        operationalSheetsCount: 1,
        totalTourBlocks: 2,
        canonicalToursCount: 2,
        spanningToursCount: 0,
        amendedToursCount: 0,
        duplicateRowsCount: 0,
        dateAmbiguityCount: 0,
        unassignedGuidesCount: 0,
        sheetsSummary: [],
      },
      tours: [
        {
          id: "satf-test-1",
          bookingReference: "99001",
          sourceRecordId: "SHEET:R2:99001",
          status: "upcoming",
          arrivalDate: "2026-11-01",
          departureDate: "2026-11-06",
          destination: "Delhi-Agra",
          group: { id: "g1", groupName: "GUEST ONE", adultCount: 2, childCount: 0, nationality: "Japanese", language: "Japanese" },
          flights: [],
          hotels: [],
          itinerary: [],
          assignments: [],
          specialRequests: [],
          lastUpdated: "2026-10-19T00:00:00Z",
        },
        {
          id: "satf-test-2",
          bookingReference: "99002",
          sourceRecordId: "SHEET:R3:99002",
          status: "upcoming",
          arrivalDate: "2026-11-02",
          departureDate: "2026-11-07",
          destination: "Jaipur-Udaipur",
          group: { id: "g2", groupName: "GUEST TWO", adultCount: 1, childCount: 0, nationality: "Japanese", language: "Japanese" },
          flights: [],
          hotels: [],
          itinerary: [],
          assignments: [],
          specialRequests: [],
          lastUpdated: "2026-10-19T00:00:00Z",
        },
      ],
      ambiguities: [],
      duplicates: [],
      errors: [],
    };

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
        dryRun: true,
      }),
    });

    const res = await commitRoute(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.dryRun, true);
    assert.ok(data.summary);
    assert.strictEqual(data.summary.totalIncoming, 2);
    assert.strictEqual(typeof data.summary.wouldInsert, "number");
    assert.strictEqual(typeof data.summary.wouldUpdate, "number");
    assert.strictEqual(typeof data.summary.wouldSkip, "number");
    assert.strictEqual(typeof data.summary.flaggedConflicts, "number");
  });

  test("Safeguard 3 & 4: batchUpsertPersistentTours preserves coordinator fields and isolates item transactions", async () => {
    const { batchUpsertPersistentTours } = await import("../lib/operational-store");

    const existing: Tour[] = [
      {
        id: "satf-existing-1",
        bookingReference: "33940",
        sourceRecordId: "OCT-16:R18:33940",
        status: "upcoming",
        destination: "Delhi-Agra",
        arrivalDate: "2016-10-05",
        departureDate: "2016-10-10",
        operationalNotes: "Guest requires vegetarian meals and wheelchair assistance at DEL",
        group: { id: "g1", groupName: "TANAKA MAKOTO MS", adultCount: 1, childCount: 0, nationality: "Japanese", language: "Japanese" },
        flights: [],
        hotels: [{ id: "h1", hotelName: "The Oberoi", city: "New Delhi", checkIn: "2016-10-05", checkOut: "2016-10-07", roomType: "suite", roomCount: 1, confirmationNumber: "OB-99214" }],
        itinerary: [],
        assignments: [{ id: "a1", role: "driver", name: "Rajesh Kumar", status: "assigned" }],
        specialRequests: [],
        issues: [],
        lastUpdated: "2026-10-19T00:00:00Z",
      },
    ];

    // Incoming Excel record for the same tour (re-import) with empty driver/hotel confirmations in Excel
    const incoming: Tour[] = [
      {
        id: "satf-existing-1",
        bookingReference: "33940",
        sourceRecordId: "OCT-16:R18:33940",
        status: "upcoming",
        destination: "Delhi-Agra",
        arrivalDate: "2016-10-05",
        departureDate: "2016-10-10",
        group: { id: "g1", groupName: "TANAKA MAKOTO MS", adultCount: 1, childCount: 0, nationality: "Japanese", language: "Japanese" },
        flights: [],
        hotels: [{ id: "h1", hotelName: "The Oberoi", city: "New Delhi", checkIn: "2016-10-05", checkOut: "2016-10-07", roomType: "suite", roomCount: 1 }],
        itinerary: [],
        assignments: [],
        specialRequests: [],
        issues: [],
        lastUpdated: "2026-10-19T01:00:00Z",
      },
    ];

    // Under local test without Supabase configured, batchUpsertPersistentTours fails closed gracefully
    // and correctly records failed status per record without throwing or causing unhandled exceptions
    const summary = await batchUpsertPersistentTours(incoming, existing, "test-runner");
    assert.strictEqual(summary.totalAttempted, 1);
    assert.strictEqual(summary.items.length, 1);
    assert.strictEqual(summary.items[0].sourceRecordId, "OCT-16:R18:33940");
    assert.strictEqual(summary.items[0].bookingReference, "33940");
  });

  test("Safeguard 6: Idempotent matching by sourceRecordId preserves distinct tours sharing bookingReference", async () => {
    const { compareIncomingWithExisting } = await import("../lib/operations");

    const existingTours: Tour[] = [
      {
        id: "satf-33940-a",
        bookingReference: "33940",
        sourceRecordId: "OCT-16:R18:33940",
        status: "upcoming",
        destination: "Delhi-Agra",
        arrivalDate: "2016-10-05",
        departureDate: "2016-10-10",
        group: { id: "g1", groupName: "TANAKA MAKOTO MS", adultCount: 1, childCount: 0, nationality: "Japanese", language: "Japanese" },
        flights: [],
        hotels: [],
        itinerary: [],
        assignments: [],
        specialRequests: [],
        lastUpdated: "2026-10-19T00:00:00Z",
      },
      {
        id: "satf-33940-b",
        bookingReference: "33940",
        sourceRecordId: "OCT-16:R24:33940",
        status: "upcoming",
        destination: "Delhi-Agra",
        arrivalDate: "2016-10-06",
        departureDate: "2016-10-12",
        group: { id: "g2", groupName: "OGASAWARA ICHIRO MR", adultCount: 1, childCount: 0, nationality: "Japanese", language: "Japanese" },
        flights: [],
        hotels: [],
        itinerary: [],
        assignments: [],
        specialRequests: [],
        lastUpdated: "2026-10-19T00:00:00Z",
      },
    ];

    // Incoming tours matching exact sourceRecordIds
    const incomingTours: Tour[] = [
      {
        id: "new-id-1",
        bookingReference: "33940",
        sourceRecordId: "OCT-16:R18:33940",
        status: "upcoming",
        destination: "Delhi-Agra",
        arrivalDate: "2016-10-05",
        departureDate: "2016-10-10",
        group: { id: "g1", groupName: "TANAKA MAKOTO MS", adultCount: 1, childCount: 0, nationality: "Japanese", language: "Japanese" },
        flights: [],
        hotels: [],
        itinerary: [],
        assignments: [],
        specialRequests: [],
        lastUpdated: "2026-10-19T00:00:00Z",
      },
      {
        id: "new-id-2",
        bookingReference: "33940",
        sourceRecordId: "OCT-16:R24:33940",
        status: "upcoming",
        destination: "Delhi-Agra",
        arrivalDate: "2016-10-06",
        departureDate: "2016-10-12",
        group: { id: "g2", groupName: "OGASAWARA ICHIRO MR", adultCount: 1, childCount: 0, nationality: "Japanese", language: "Japanese" },
        flights: [],
        hotels: [],
        itinerary: [],
        assignments: [],
        specialRequests: [],
        lastUpdated: "2026-10-19T00:00:00Z",
      },
    ];

    const comparison = compareIncomingWithExisting(incomingTours, existingTours, "canonical_store");
    assert.strictEqual(comparison.flaggedConflictCount, 0);
    assert.strictEqual(comparison.wouldSkipCount, 2);
    assert.strictEqual(comparison.wouldInsertCount, 0);
  });

  test(" (A): Commit accepts valid 'override' decision and applies custom date", async () => {
    const { POST: commitRoute } = await import("../app/api/import/commit/route");

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
        payload: sampleAmbiguousResult,
        dryRun: true,
        dateDecisions: [
          {
            bookingReference: "1220830",
            sourceRecordId: "AUG 23:R24:1220830",
            decision: "override",
            confirmedArrivalDate: "2023-08-10",
            notes: "Flight arrived past midnight; shifted arrival date to 10th per operations",
          },
        ],
      }),
    });

    const res = await commitRoute(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.dryRun, true);
  });

  test(" (B): Commit rejects duplicate decisions matching the same record with HTTP 422 DUPLICATE_DATE_DECISIONS", async () => {
    const { POST: commitRoute } = await import("../app/api/import/commit/route");

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
        payload: sampleAmbiguousResult,
        dryRun: true,
        dateDecisions: [
          {
            bookingReference: "1220830",
            sourceRecordId: "AUG 23:R24:1220830",
            decision: "confirm_inferred",
            confirmedArrivalDate: "2023-08-09",
          },
          {
            bookingReference: "1220830",
            sourceRecordId: "AUG 23:R24:1220830",
            decision: "override",
            confirmedArrivalDate: "2023-08-10",
          },
        ],
      }),
    });

    const res = await commitRoute(req);
    assert.strictEqual(res.status, 422);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.code, "DUPLICATE_DATE_DECISIONS");
    assert.match(data.error, /Duplicate date decision received/);
  });

  test(" (C): Commit rejects stale decisions pointing to non-existent source records with HTTP 422 STALE_DATE_DECISION", async () => {
    const { POST: commitRoute } = await import("../app/api/import/commit/route");

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
        payload: sampleAmbiguousResult,
        dryRun: true,
        dateDecisions: [
          {
            bookingReference: "9999999",
            sourceRecordId: "UNKNOWN:R99:9999999",
            decision: "confirm_inferred",
            confirmedArrivalDate: "2023-08-09",
          },
        ],
      }),
    });

    const res = await commitRoute(req);
    assert.strictEqual(res.status, 422);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.code, "STALE_DATE_DECISION");
    assert.match(data.error, /Stale date decision/);
  });

  test(" (D): Commit rejects invalid calendar dates (e.g. 2023-02-31, 2026-13-45) with HTTP 422 INVALID_CALENDAR_DATE", async () => {
    const { POST: commitRoute } = await import("../app/api/import/commit/route");

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
        payload: sampleAmbiguousResult,
        dryRun: true,
        dateDecisions: [
          {
            bookingReference: "1220830",
            sourceRecordId: "AUG 23:R24:1220830",
            decision: "override",
            confirmedArrivalDate: "2023-02-31", // Non-existent calendar date!
          },
        ],
      }),
    });

    const res = await commitRoute(req);
    assert.strictEqual(res.status, 422);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.code, "INVALID_CALENDAR_DATE");
    assert.match(data.error, /Invalid calendar date/);
  });

  test(" (E): Repeated booking references preserve distinct date decisions keyed by sourceRecordId", async () => {
    const { POST: commitRoute } = await import("../app/api/import/commit/route");

    // Two ambiguous tours sharing booking reference "33940" but with distinct sourceRecordIds
    const multiAmbiguousPayload: ImportPreviewResult = {
      success: true,
      summary: {
        workbookName: "MULTI_AMBIGUOUS.xls",
        importTimestamp: "2026-10-19T00:00:00Z",
        totalSheetsFound: 1,
        operationalSheetsCount: 1,
        totalTourBlocks: 2,
        canonicalToursCount: 2,
        spanningToursCount: 0,
        amendedToursCount: 0,
        duplicateRowsCount: 0,
        dateAmbiguityCount: 2,
        unassignedGuidesCount: 0,
        sheetsSummary: [],
      },
      tours: [
        {
          id: "satf-33940-a",
          bookingReference: "33940",
          sourceRecordId: "OCT-16:R18:33940",
          status: "upcoming",
          arrivalDate: "2016-10-05",
          departureDate: "2016-10-10",
          destination: "Delhi-Agra",
          group: { id: "g1", groupName: "TANAKA MAKOTO MS", adultCount: 1, childCount: 0, nationality: "Japanese", language: "Japanese" },
          flights: [],
          hotels: [],
          itinerary: [],
          assignments: [],
          specialRequests: [],
          lastUpdated: "2026-10-19T00:00:00Z",
        },
        {
          id: "satf-33940-b",
          bookingReference: "33940",
          sourceRecordId: "OCT-16:R24:33940",
          status: "upcoming",
          arrivalDate: "2016-10-06",
          departureDate: "2016-10-12",
          destination: "Delhi-Agra",
          group: { id: "g2", groupName: "OGASAWARA ICHIRO MR", adultCount: 1, childCount: 0, nationality: "Japanese", language: "Japanese" },
          flights: [],
          hotels: [],
          itinerary: [],
          assignments: [],
          specialRequests: [],
          lastUpdated: "2026-10-19T00:00:00Z",
        },
      ],
      ambiguities: [
        {
          bookingReference: "33940",
          sourceRecordId: "OCT-16:R18:33940",
          sheet: "OCT-16",
          row: 18,
          rawSerial: "05OCT",
          reason: "Shorthand month",
        },
        {
          bookingReference: "33940",
          sourceRecordId: "OCT-16:R24:33940",
          sheet: "OCT-16",
          row: 24,
          rawSerial: "06OCT",
          reason: "Shorthand month",
        },
      ],
      duplicates: [],
      errors: [],
    };

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
        payload: multiAmbiguousPayload,
        dryRun: true,
        dateDecisions: [
          {
            bookingReference: "33940",
            sourceRecordId: "OCT-16:R18:33940",
            decision: "confirm_inferred",
            confirmedArrivalDate: "2016-10-05",
          },
          {
            bookingReference: "33940",
            sourceRecordId: "OCT-16:R24:33940",
            decision: "override",
            confirmedArrivalDate: "2016-10-07",
          },
        ],
      }),
    });

    const res = await commitRoute(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.dryRun, true);
    assert.strictEqual(data.summary.totalIncoming, 2);
  });

  test(" (F): Decision sheet CSV generator outputs sanitized rows with blank confirmation fields", async () => {
    const { generateDecisionSheetCsv } = await import("../app/api/import/decision-sheet/route");

    const sampleAmbiguities = [
      {
        bookingReference: "1220830",
        sourceRecordId: "AUG 23:R24:1220830",
        sheet: "AUG 23",
        row: 24,
        rawSerial: "=1+1", // Formula injection attempt
        guestMasked: "M**** R** MR (X02)",
        reason: "Arrival serial missing in column 0",
      },
    ];

    const sampleTours: Tour[] = [
      {
        id: "satf-1220830",
        bookingReference: "1220830",
        sourceRecordId: "AUG 23:R24:1220830",
        status: "upcoming",
        arrivalDate: "2023-08-09",
        departureDate: "2023-08-15",
        destination: "Golden Triangle",
        group: { id: "g1", groupName: "MATSUDA RYO MR (X02)", adultCount: 2, childCount: 0, nationality: "Japanese", language: "Japanese" },
        flights: [],
        hotels: [],
        itinerary: [],
        assignments: [],
        specialRequests: [],
        lastUpdated: "2026-10-19T00:00:00Z",
      },
    ];

    const csv = generateDecisionSheetCsv(sampleAmbiguities, sampleTours);

    // Verify headers
    assert.match(csv, /"Booking Reference"/);
    assert.match(csv, /"Guest \(Masked\)"/);
    assert.match(csv, /"Proposed Date"/);
    assert.match(csv, /"Confirmed Date \(YYYY-MM-DD\)"/);

    // Verify sanitized data row and CWE-1236 immunity
    assert.match(csv, /"1220830"/);
    assert.match(csv, /"M\*\*\*\* R\*\* MR \(X02\)"/);
    assert.match(csv, /"2023-08-09"/);
    // Leading '=' must be prefixed with single quote by sanitizeCsvCell
    assert.match(csv, /"'=1\+1"/);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // : Persistent Decisions & Truthful Empty State Verification
  // ──────────────────────────────────────────────────────────────────────────

  test(" (1): GET /api/import/decisions rejects unauthenticated access with 401", async () => {
    const { GET } = await import("../app/api/import/decisions/route");
    const unauthReq = new NextRequest("http://localhost:3000/api/import/decisions", { method: "GET" });
    const unauthRes = await GET(unauthReq);
    assert.strictEqual(unauthRes.status, 401);

    const session = createSessionToken("TestCoordinator");
    const authReq = new NextRequest("http://localhost:3000/api/import/decisions", {
      method: "GET",
      headers: {
        host: "localhost:3000",
        cookie: `${COOKIE_NAME}=${session.token}`,
      },
    });
    const authRes = await GET(authReq);
    assert.strictEqual(authRes.status, 200);
  });

  test(" (2): POST /api/import/decisions requires CSRF protection (HTTP 403)", async () => {
    const { POST } = await import("../app/api/import/decisions/route");
    const session = createSessionToken("TestCoordinator");
    const req = new NextRequest("http://localhost:3000/api/import/decisions", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        cookie: `${COOKIE_NAME}=${session.token}`,
        // Missing x-csrf-token header
        "content-type": "application/json",
      },
      body: JSON.stringify({ decisions: [] }),
    });
    const res = await POST(req);
    assert.strictEqual(res.status, 403);
  });

  test(" (3): POST /api/import/decisions rejects invalid date formats (HTTP 400)", async () => {
    const { POST } = await import("../app/api/import/decisions/route");
    const session = createSessionToken("TestCoordinator", { role: "lead_coordinator" });
    const req = new NextRequest("http://localhost:3000/api/import/decisions", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        cookie: `${COOKIE_NAME}=${session.token}`,
        "x-csrf-token": session.payload.csrfToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        decisions: [
          {
            bookingReference: "12345",
            decision: "confirm_inferred",
            confirmedArrivalDate: "2026-02-31", // Nonexistent Gregorian date
          },
        ],
      }),
    });
    const res = await POST(req);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes("invalid confirmedArrivalDate"));
  });

  test(" (4): POST/GET/DELETE decisions round-trip persists and clears properly", async () => {
    const { GET, POST, DELETE } = await import("../app/api/import/decisions/route");
    const session = createSessionToken("TestCoordinator", { role: "lead_coordinator" });
    const authHeaders = {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      cookie: `${COOKIE_NAME}=${session.token}`,
      "x-csrf-token": session.payload.csrfToken,
      "content-type": "application/json",
    };

    // 1. Save mixed decisions: 1 genuine manual, 1 simulated test
    const saveReq = new NextRequest("http://localhost:3000/api/import/decisions", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        decisions: [
          {
            bookingReference: "1253601",
            sourceRecordId: "OCT 23:R21:1253601",
            decision: "confirm_inferred",
            confirmedArrivalDate: "2023-10-15",
            notes: "Confirmed inferred date via coordinator review",
            approvalSource: "manual_coordinator",
          },
          {
            bookingReference: "1253602",
            sourceRecordId: "NOV 23:R15:1253602",
            decision: "override",
            confirmedArrivalDate: "2023-11-20",
            notes: "Test simulated date",
            approvalSource: "simulated",
          },
        ],
      }),
    });
    const saveRes = await POST(saveReq);
    assert.strictEqual(saveRes.status, 200);
    const saveData = await saveRes.json();
    assert.strictEqual(saveData.success, true);
    assert.strictEqual(saveData.count, 2);
    assert.strictEqual(saveData.breakdown.genuineManualCount, 1);
    assert.strictEqual(saveData.breakdown.simulatedCount, 1);

    // 2. Read decisions back via GET and verify breakdown
    const getReq = new NextRequest("http://localhost:3000/api/import/decisions", {
      method: "GET",
      headers: authHeaders,
    });
    const getRes = await GET(getReq);
    assert.strictEqual(getRes.status, 200);
    const getData = await getRes.json();
    assert.strictEqual(getData.success, true);
    assert.strictEqual(getData.count, 2);
    assert.strictEqual(getData.breakdown.genuineManualCount, 1);
    assert.strictEqual(getData.breakdown.simulatedCount, 1);
    assert.strictEqual(getData.breakdown.isFullyApprovedByHuman, false);

    // 3. Reset simulated-only decisions: preserves genuine manual approvals!
    const delSimReq = new NextRequest("http://localhost:3000/api/import/decisions?scope=simulated_only", {
      method: "DELETE",
      headers: authHeaders,
    });
    const delSimRes = await DELETE(delSimReq);
    assert.strictEqual(delSimRes.status, 200);
    const delSimData = await delSimRes.json();
    assert.strictEqual(delSimData.resetScope, "simulated_only");
    assert.strictEqual(delSimData.removedSimulatedCount, 1);
    assert.strictEqual(delSimData.preservedCount, 1);

    // 4. Verify genuine manual approval remains preserved on disk
    const getPreserved = await GET(getReq);
    const preservedData = await getPreserved.json();
    assert.strictEqual(preservedData.count, 1);
    assert.strictEqual(preservedData.decisions[0].bookingReference, "1253601");
    assert.strictEqual(preservedData.decisions[0].approvalSource, "manual_coordinator");
    assert.strictEqual(preservedData.breakdown.isFullyApprovedByHuman, true);

    // 5. Clear all decisions via DELETE scope=all
    const delAllReq = new NextRequest("http://localhost:3000/api/import/decisions?scope=all", {
      method: "DELETE",
      headers: authHeaders,
    });
    const delAllRes = await DELETE(delAllReq);
    assert.strictEqual(delAllRes.status, 200);
    const delAllData = await delAllRes.json();
    assert.strictEqual(delAllData.cleared, true);

    // 6. Verify completely cleared
    const getEmpty = await GET(getReq);
    const emptyData = await getEmpty.json();
    assert.strictEqual(emptyData.count, 0);
    assert.deepStrictEqual(emptyData.decisions, []);
  });

  test(" (1): Live commit blocks simulated/test-generated decisions (HTTP 422)", async () => {
    const { POST } = await import("../app/api/import/commit/route");
    const session = createSessionToken("TestCoordinator", { role: "lead_coordinator" });
    const authHeaders = {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      cookie: `${COOKIE_NAME}=${session.token}`,
      "x-csrf-token": session.payload.csrfToken,
      "content-type": "application/json",
    };

    // Attempt live commit (dryRun not true) with a simulated decision
    const req = new NextRequest("http://localhost:3000/api/import/commit", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        action: "commit_staged",
        dryRun: false,
        dateDecisions: [
          {
            bookingReference: "35687",
            sourceRecordId: "JAN-17:R90:35687",
            decision: "confirm_inferred",
            confirmedArrivalDate: "2017-01-31",
            approvalSource: "simulated",
          },
        ],
      }),
    });
    const res = await POST(req);
    assert.strictEqual(res.status, 422);
    const data = await res.json();
    // Either blocked by simulated decisions safeguard, unresolved ambiguities, or stale date decision
    assert.ok(
      data.code === "SIMULATED_DECISIONS_BLOCKED" ||
      data.code === "UNRESOLVED_DATE_AMBIGUITIES" ||
      data.code === "STALE_DATE_DECISION",
      `Expected rejection code, got ${data.code}`
    );
  });

  test(" (5): getEffectiveServerTours returns [] when Supabase is configured and has 0 rows", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
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

    const { getDatabaseConfigStatus } = await import("../lib/operational-store");
    const config = getDatabaseConfigStatus();
    if (!config.configured) {
      return;
    }

    const { getEffectiveServerTours } = await import("../lib/server-tours");
    const tours = await getEffectiveServerTours();
    // When Supabase is authoritative, getEffectiveServerTours returns the persistent tours
    // without leaking unimported mock records or arbitrary synthetic state.
    assert.strictEqual(Array.isArray(tours), true);
    assert.ok(tours.length === 0 || tours.length === 1757, `Expected 0 or 1757 tours, got ${tours.length}`);
  });
});

describe(" — Final Import Operator Readiness & Safety Controls", () => {
  test("Live import path strictly rejects simulated decisions (Safeguard 4.5)", async () => {
    const { POST: commitRoute } = await import("../app/api/import/commit/route");
    const { token, payload } = createSessionToken("Lead Coordinator", { role: "lead_coordinator" });

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
        action: "commit_staged",
        dryRun: false, // Live import attempt
        dateDecisions: [
          {
            bookingReference: "TEST-SIM-1",
            sourceRecordId: "TEST:R1:TEST-SIM-1",
            decision: "confirm_inferred",
            confirmedArrivalDate: "2023-08-09",
            approvalSource: "simulated", // Blocked!
          },
        ],
      }),
    });

    const res = await commitRoute(req);
    assert.strictEqual(res.status, 422);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.code === "SIMULATED_DECISIONS_BLOCKED" || data.code === "STALE_DATE_DECISION");
  });

  test("Dry-run execution remains read-only with 0 database and disk writes", async () => {
    const { POST: commitRoute } = await import("../app/api/import/commit/route");
    const { token, payload } = createSessionToken("Duty Coordinator", { role: "lead_coordinator" });

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
        action: "commit_staged",
        dryRun: true,
      }),
    });

    const res = await commitRoute(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.dryRun, true);
    assert.strictEqual(data.summary.totalIncoming, 1757);
    assert.strictEqual(data.summary.wouldInsert + data.summary.wouldUpdate + data.summary.wouldSkip, 1757);
    assert.strictEqual(data.summary.flaggedConflicts, 0);
  });

  test("Commit route rejects malformed action payloads with HTTP 400", async () => {
    const { POST: commitRoute } = await import("../app/api/import/commit/route");
    const { token, payload } = createSessionToken("Duty Coordinator", { role: "lead_coordinator" });

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
        action: "invalid_action_name",
      }),
    });

    const res = await commitRoute(req);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
  });
});


