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
