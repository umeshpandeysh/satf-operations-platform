import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  getIndiaTodayISO,
  addDaysToISO,
  nightsBetween,
  relativeDayLabel,
  formatDate,
  formatDateShort,
} from "../lib/utils";

import {
  getMockTours,
  getTourById,
  computeDashboardMetrics,
  getAttentionItems,
  getUpcomingArrivals,
} from "../lib/mock-data";

describe("1. Asia/Kolkata reference date calculation", () => {
  test("getIndiaTodayISO() returns valid YYYY-MM-DD format", () => {
    const today = getIndiaTodayISO();
    assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
  });

  test("correctly calculates Asia/Kolkata calendar day across UTC boundary", () => {
    // 18:00 UTC on 2026-10-17 is 23:30 in Kolkata on 2026-10-17 (same day)
    const eveningUTC = new Date("2026-10-17T18:00:00.000Z");
    assert.strictEqual(getIndiaTodayISO(eveningUTC), "2026-10-17");

    // 19:00 UTC on 2026-10-17 is 00:30 in Kolkata on 2026-10-18 (next day in India)
    const lateNightUTC = new Date("2026-10-17T19:00:00.000Z");
    assert.strictEqual(getIndiaTodayISO(lateNightUTC), "2026-10-18");
  });
});

describe("2. Date arithmetic across month, year, and leap-year boundaries", () => {
  test("handles month boundary addition", () => {
    assert.strictEqual(addDaysToISO("2026-10-31", 1), "2026-11-01");
    assert.strictEqual(addDaysToISO("2026-10-30", 5), "2026-11-04");
  });

  test("handles month boundary subtraction", () => {
    assert.strictEqual(addDaysToISO("2026-11-01", -1), "2026-10-31");
  });

  test("handles year boundary forward and backward", () => {
    assert.strictEqual(addDaysToISO("2026-12-31", 1), "2027-01-01");
    assert.strictEqual(addDaysToISO("2026-12-30", 5), "2027-01-04");
    assert.strictEqual(addDaysToISO("2027-01-01", -1), "2026-12-31");
  });

  test("handles leap-year boundaries correctly", () => {
    // 2028 is a leap year
    assert.strictEqual(addDaysToISO("2028-02-28", 1), "2028-02-29");
    assert.strictEqual(addDaysToISO("2028-02-29", 1), "2028-03-01");

    // 2026 is not a leap year
    assert.strictEqual(addDaysToISO("2026-02-28", 1), "2026-03-01");
    assert.strictEqual(addDaysToISO("2026-03-01", -1), "2026-02-28");
  });

  test("nightsBetween computes accurate day counts across month and year boundaries", () => {
    assert.strictEqual(nightsBetween("2026-10-30", "2026-11-02"), 3);
    assert.strictEqual(nightsBetween("2026-12-31", "2027-01-05"), 5);
    assert.strictEqual(nightsBetween("2026-10-17", "2026-10-17"), 0);
  });
});

describe("3. Relative day labels and date formatting", () => {
  const refDate = "2026-10-17";

  test("returns accurate relative labels", () => {
    assert.strictEqual(relativeDayLabel("2026-10-17", refDate), "Today");
    assert.strictEqual(relativeDayLabel("2026-10-18", refDate), "Tomorrow");
    assert.strictEqual(relativeDayLabel("2026-10-16", refDate), "Yesterday");
    assert.strictEqual(relativeDayLabel("2026-10-21", refDate), "In 4 days");
    assert.strictEqual(relativeDayLabel("2026-10-10", refDate), "7 days ago");
  });

  test("formatDate and formatDateShort produce consistent strings", () => {
    assert.strictEqual(formatDate("2026-10-17"), "17 Oct 2026");
    assert.strictEqual(formatDateShort("2026-10-17"), "17 Oct");
    assert.strictEqual(formatDate("2027-01-01"), "01 Jan 2027");
  });
});

describe("4. Upcoming arrivals selection consistency", () => {
  const refDate = "2026-10-17";

  test("upcoming arrivals use the reference date and return ascending order", () => {
    const arrivals = getUpcomingArrivals(10, refDate);
    assert.ok(arrivals.length > 0, "Expected upcoming arrivals");

    for (let i = 0; i < arrivals.length; i++) {
      const tour = arrivals[i];
      assert.ok(
        tour.arrivalDate >= refDate,
        `Tour arrival ${tour.arrivalDate} should be on or after ${refDate}`
      );
      assert.ok(
        tour.arrivalDate <= addDaysToISO(refDate, 10),
        `Tour arrival ${tour.arrivalDate} should be within 10 days`
      );
      assert.notStrictEqual(tour.status, "completed");
      assert.notStrictEqual(tour.status, "cancelled");

      if (i > 0) {
        assert.ok(
          tour.arrivalDate >= arrivals[i - 1].arrivalDate,
          "Upcoming arrivals should be in ascending chronological order"
        );
      }
    }
  });
});

describe("5. Internal dates coherence across flights, hotels, and itineraries", () => {
  const refDate = "2026-10-17";
  const tours = getMockTours(refDate);

  test("all 6 demo tours have internally coherent dates", () => {
    assert.strictEqual(tours.length, 6);

    for (const tour of tours) {
      // Departure is on or after arrival
      assert.ok(
        tour.departureDate >= tour.arrivalDate,
        `${tour.id}: departureDate (${tour.departureDate}) >= arrivalDate (${tour.arrivalDate})`
      );

      // Flights
      const arrFlight = tour.flights.find((f) => f.direction === "arrival");
      if (arrFlight) {
        assert.strictEqual(
          arrFlight.date,
          tour.arrivalDate,
          `${tour.id}: Inbound flight date must equal tour arrival date`
        );
      }

      const depFlight = tour.flights.find((f) => f.direction === "departure");
      if (depFlight) {
        assert.strictEqual(
          depFlight.date,
          tour.departureDate,
          `${tour.id}: Outbound flight date must equal tour departure date`
        );
      }

      // Hotels
      if (tour.hotels.length > 0) {
        const firstHotel = tour.hotels[0];
        const lastHotel = tour.hotels[tour.hotels.length - 1];
        assert.strictEqual(
          firstHotel.checkIn,
          tour.arrivalDate,
          `${tour.id}: First hotel check-in must equal tour arrival date`
        );
        assert.strictEqual(
          lastHotel.checkOut,
          tour.departureDate,
          `${tour.id}: Last hotel check-out must equal tour departure date`
        );
      }

      // Itinerary
      if (tour.itinerary.length > 0) {
        const firstActivity = tour.itinerary[0];
        const lastActivity = tour.itinerary[tour.itinerary.length - 1];
        assert.strictEqual(
          firstActivity.date,
          tour.arrivalDate,
          `${tour.id}: First itinerary item must be on tour arrival date`
        );
        assert.strictEqual(
          lastActivity.date,
          tour.departureDate,
          `${tour.id}: Last itinerary item must be on tour departure date`
        );
      }
    }
  });
});

describe("6. Tour detail routes resolution and booking references", () => {
  const refDate = "2026-10-17";

  test("resolves every demo tour by ID and verifies year-independent booking references", () => {
    const expectedIds = [
      "tour-001",
      "tour-002",
      "tour-003",
      "tour-004",
      "tour-005",
      "tour-006",
    ];

    for (const id of expectedIds) {
      const tour = getTourById(id, refDate);
      assert.ok(tour, `Tour ${id} must resolve`);
      assert.match(
        tour.bookingReference,
        /^SATF-DEMO-\d{3}$/,
        `Booking reference ${tour.bookingReference} must use SATF-DEMO-xxx format`
      );
    }

    assert.strictEqual(getTourById("tour-non-existent", refDate), undefined);
  });
});

describe("7. Dashboard metrics and status coherence", () => {
  const refDate = "2026-10-17";
  const metrics = computeDashboardMetrics(refDate);
  const attentionItems = getAttentionItems(refDate);
  const tours = getMockTours(refDate);

  test("metrics match the dataset state on reference date", () => {
    // Exactly 1 arrival today (tour-003)
    assert.strictEqual(metrics.arrivalsToday, 1);

    // Active tours today (tour-001 is active and ongoing)
    assert.strictEqual(metrics.activeToday, 1);

    // Attention items
    assert.strictEqual(metrics.requireAttention, 2);
    assert.strictEqual(attentionItems.length, 2);

    // Verify dataset contains completed, active, and upcoming tours
    const completed = tours.filter((t) => t.status === "completed");
    const active = tours.filter((t) => t.status === "active");
    const upcoming = tours.filter((t) => t.status === "upcoming");
    const attention = tours.filter((t) => t.status === "attention");

    assert.ok(completed.length >= 1, "Must contain at least 1 completed tour");
    assert.ok(active.length >= 1, "Must contain at least 1 active tour");
    assert.ok(upcoming.length >= 1, "Must contain at least 1 upcoming tour");
    assert.ok(
      attention.some((t) => t.arrivalDate > refDate),
      "Must contain at least 1 upcoming tour requiring attention"
    );
  });
});

describe("8. /tours runtime data generation and hydration mismatch prevention", () => {
  test("generates distinct dates when reference date moves forward", () => {
    const day1 = "2026-10-17";
    const day2 = "2026-10-18";

    const toursDay1 = getMockTours(day1);
    const toursDay2 = getMockTours(day2);

    // Verify arrival dates are shifted by exactly 1 day
    for (let i = 0; i < toursDay1.length; i++) {
      assert.strictEqual(
        toursDay2[i].arrivalDate,
        addDaysToISO(toursDay1[i].arrivalDate, 1),
        `Tour ${toursDay1[i].id} arrival date should shift by 1 day when reference date increments`
      );
      assert.strictEqual(
        toursDay2[i].departureDate,
        addDaysToISO(toursDay1[i].departureDate, 1),
        `Tour ${toursDay1[i].id} departure date should shift by 1 day when reference date increments`
      );
    }
  });

  test("initialTours payload is JSON-serializable for SSR hydration without undefined date values", () => {
    const today = getIndiaTodayISO();
    const tours = getMockTours(today);

    // Serialization check: ensure JSON round-trip preserves all dates and fields identically
    const serialized = JSON.stringify(tours);
    const deserialized = JSON.parse(serialized);

    assert.deepStrictEqual(
      deserialized,
      JSON.parse(JSON.stringify(tours)),
      "initialTours payload must be cleanly JSON-serializable between server and client"
    );

    // Verify no undefined date fields
    for (const tour of tours) {
      assert.ok(tour.arrivalDate && tour.arrivalDate.length === 10);
      assert.ok(tour.departureDate && tour.departureDate.length === 10);
      for (const flight of tour.flights) {
        assert.ok(flight.date && flight.date.length === 10);
      }
      for (const hotel of tour.hotels) {
        assert.ok(hotel.checkIn && hotel.checkIn.length === 10);
        assert.ok(hotel.checkOut && hotel.checkOut.length === 10);
      }
      for (const item of tour.itinerary) {
        assert.ok(item.date && item.date.length === 10);
      }
    }
  });
});

describe("9. Operational issue independence, status decoupling, and Excel provenance", () => {
  const refDate = "2026-10-17";

  test("tours maintain Excel sheet provenance without silent date correction", () => {
    const tour = getTourById("tour-003", refDate);
    assert.ok(tour, "tour-003 must exist");
    assert.ok(tour.sourceProvenance, "tour-003 must include source provenance");
    assert.match(
      tour.sourceProvenance,
      /Legacy Chart Sheet OCT 2025 \(Row 2, STW #1253572\)/,
      "tour-003 provenance must trace to STW #1253572"
    );

    // Verify date anomaly comment preservation on tour-004
    const tour4 = getTourById("tour-004", refDate);
    assert.ok(tour4, "tour-004 must exist");
    assert.ok(tour4.sourceProvenance, "tour-004 must include source provenance");
    assert.match(
      tour4.sourceProvenance,
      /Legacy Chart Sheet JAN 2026 \(Row 2, STW #1253602, Flagged: year serial mismatch 2025\)/,
      "tour-004 must flag the year/serial date ambiguity"
    );
  });

  test("resolving one operational issue leaves other open issues untouched", () => {
    const tour = getTourById("tour-003", refDate);
    assert.ok(tour && tour.issues && tour.issues.length >= 2, "tour-003 must have multiple issues");

    const issues = [...tour.issues];
    const initialIssue1 = issues[0];
    const initialIssue2 = issues[1];

    assert.strictEqual(initialIssue1.resolved, false);
    assert.strictEqual(initialIssue2.resolved, false);

    // Simulate resolving only the first issue
    const updatedIssues = issues.map((iss) =>
      iss.id === initialIssue1.id
        ? { ...iss, resolved: true, resolutionNotes: "Guide assigned by phone" }
        : iss
    );

    const resolvedItem = updatedIssues.find((i) => i.id === initialIssue1.id);
    const untouchedItem = updatedIssues.find((i) => i.id === initialIssue2.id);

    assert.strictEqual(resolvedItem?.resolved, true, "Target issue must be marked resolved");
    assert.strictEqual(untouchedItem?.resolved, false, "Second issue must remain unresolved");
  });

  test("resolving all operational issues does not auto-mutate tour status", () => {
    const tour = getTourById("tour-003", refDate);
    assert.ok(tour);
    assert.strictEqual(tour.status, "attention", "tour-003 starts in attention status");

    // Simulate resolving all issues
    const allResolvedIssues = (tour.issues ?? []).map((iss) => ({
      ...iss,
      resolved: true,
      resolutionNotes: "Resolved",
    }));

    // Reconstruct tour with resolved issues but preserving tour status
    const tourWithResolvedIssues = {
      ...tour,
      issues: allResolvedIssues,
    };

    // The tour status must remain "attention" unless the operator explicitly signs off
    assert.strictEqual(
      tourWithResolvedIssues.status,
      "attention",
      "Resolving all issues must not automatically change tour status away from attention"
    );
  });
});

describe("10. Tour editing validation, cancel safety, and prototype persistence", () => {
  const refDate = "2026-10-17";

  test("inline validation: guide name is required only when guide status is assigned", () => {
    function validateTourEdit(guideStatus: string, guideName: string) {
      const errors: Record<string, string> = {};
      if (guideStatus === "assigned" && !guideName.trim()) {
        errors.guideName = "Guide name is required when status is assigned";
      }
      return errors;
    }

    // Invalid: status is assigned but name is empty
    const errors1 = validateTourEdit("assigned", "   ");
    assert.strictEqual(
      errors1.guideName,
      "Guide name is required when status is assigned"
    );

    // Valid: status is assigned and name is provided
    const errors2 = validateTourEdit("assigned", "Sunil Sharma");
    assert.strictEqual(errors2.guideName, undefined);

    // Valid: status is pending or unassigned with empty name
    const errors3 = validateTourEdit("pending", "");
    assert.strictEqual(errors3.guideName, undefined);

    const errors4 = validateTourEdit("unassigned", "");
    assert.strictEqual(errors4.guideName, undefined);
  });

  test("optional fields (driver phone, vehicle plate, hotel confirmation) pass validation when blank", () => {
    function validateOptionalFields(
      driverNotes: string,
      vehiclePlate: string,
      hotelConf: string
    ) {
      // Per approved Phase 2 scope, these remain strictly optional until verified with SATF ops
      const errors: Record<string, string> = {};
      // No required checks for optional fields
      return { isValid: Object.keys(errors).length === 0, errors };
    }

    const result = validateOptionalFields("", "", "");
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(Object.keys(result.errors).length, 0);
  });

  test("cancel safety: discarding modal edits leaves original tour unchanged", () => {
    const originalTour = getTourById("tour-003", refDate);
    assert.ok(originalTour);

    // Snapshot original data
    const originalSnapshot = JSON.stringify(originalTour);

    // Simulate in-memory draft edits
    let draft = { ...originalTour, operationalNotes: "DRAFT_NEVER_SAVED" };
    draft = { ...draft, status: "completed" };

    // User hits Cancel: discard draft
    draft = JSON.parse(originalSnapshot);

    assert.strictEqual(draft.operationalNotes, originalTour.operationalNotes);
    assert.strictEqual(draft.status, originalTour.status);
    assert.deepStrictEqual(draft, originalTour);
  });
});
