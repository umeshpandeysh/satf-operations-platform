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
  computeDashboardMetricsFromTours,
  getAttentionItemsFromTours,
  getUpcomingArrivalsFromTours,
} from "../lib/mock-data";

import {
  validateTourForm,
  applyIssueUpdate,
  cancelTourEdit,
  mergeSessionTours,
} from "../lib/operations";

import {
  saveSessionTour,
  getSessionTour,
  getSessionTours,
  clearSessionTour,
  clearAllSessionTours,
  subscribeSessionStore,
  simulateStorageFailureForTesting,
  resetSessionStoreForTesting,
  setStorageDriverForTesting,
  StorageOperationResult,
  StorageDriver,
  getSessionToursResult,
  getSessionSnapshot,
  parseSessionSnapshot,
  SESSION_READ_ERROR_PREFIX,
} from "../lib/session-store";

import { APPROVED_VEHICLE_TYPES, Tour } from "../lib/types";

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

describe("9. Provenance integrity and illustrative format notices", () => {
  const refDate = "2026-10-17";

  test("all mock tours clearly state illustrative format and do not claim unverified provenance", () => {
    const tours = getMockTours(refDate);

    for (const tour of tours) {
      assert.ok(tour.sourceProvenance, `Tour ${tour.id} must define sourceProvenance`);
      assert.match(
        tour.sourceProvenance,
        /Illustrative format sample/i,
        `Tour ${tour.id} must be explicitly labeled as an illustrative format sample`
      );
      assert.match(
        tour.sourceProvenance,
        /not verified provenance/i,
        `Tour ${tour.id} must explicitly state it is not verified provenance`
      );
    }
  });

  test("tour-004 preserves date serial ambiguity notice without false verification claim", () => {
    const tour4 = getTourById("tour-004", refDate);
    assert.ok(tour4, "tour-004 must exist");
    assert.match(
      tour4.sourceProvenance ?? "",
      /flags year\/serial date ambiguity for demonstration/i,
      "tour-004 must flag the year/serial date ambiguity illustratively"
    );
  });
});

describe("10. Shared production validation: validateTourForm", () => {
  test("mandatory resolution note: rejects issue marked resolved when resolutionNotes is empty", () => {
    const validation = validateTourForm({
      guideStatus: "unassigned",
      guideName: "",
      vehicleStatus: "unassigned",
      issues: [
        {
          id: "iss-1",
          category: "guide",
          description: "Guide missing",
          resolved: true,
          resolutionNotes: "   ", // Blank / whitespace
        },
      ],
    });

    assert.strictEqual(validation.isValid, false);
    assert.strictEqual(
      validation.errors["issue_iss-1_notes"],
      "Explanatory resolution note is required before marking this issue resolved."
    );
  });

  test("mandatory resolution note: accepts issue marked resolved when resolutionNotes is provided", () => {
    const validation = validateTourForm({
      guideStatus: "unassigned",
      guideName: "",
      vehicleStatus: "unassigned",
      issues: [
        {
          id: "iss-1",
          category: "guide",
          description: "Guide missing",
          resolved: true,
          resolutionNotes: "Guide Ramesh assigned and briefed on itinerary.",
        },
      ],
    });

    assert.strictEqual(validation.isValid, true);
    assert.strictEqual(validation.errors["issue_iss-1_notes"], undefined);
  });

  test("guide validation: guide name is required only when guideStatus is assigned", () => {
    // Assigned without name fails
    const invalid = validateTourForm({
      guideStatus: "assigned",
      guideName: "   ",
      vehicleStatus: "unassigned",
      issues: [],
    });
    assert.strictEqual(invalid.isValid, false);
    assert.strictEqual(
      invalid.errors.guideName,
      "Guide name is required when guide status is marked as 'Assigned'."
    );

    // Assigned with name passes
    const valid = validateTourForm({
      guideStatus: "assigned",
      guideName: "Sunil Sharma",
      vehicleStatus: "unassigned",
      issues: [],
    });
    assert.strictEqual(valid.isValid, true);
    assert.strictEqual(valid.errors.guideName, undefined);

    // Pending or unassigned without name passes
    const validPending = validateTourForm({
      guideStatus: "pending",
      guideName: "",
      vehicleStatus: "unassigned",
      issues: [],
    });
    assert.strictEqual(validPending.isValid, true);
  });

  test("structured vehicle type: validates approved categories and permits blank optional", () => {
    for (const vType of APPROVED_VEHICLE_TYPES) {
      const valid = validateTourForm({
        guideStatus: "unassigned",
        guideName: "",
        vehicleStatus: "assigned",
        vehicleType: vType,
        issues: [],
      });
      assert.strictEqual(valid.isValid, true);
    }

    // Invalid vehicle type fails
    const invalid = validateTourForm({
      guideStatus: "unassigned",
      guideName: "",
      vehicleStatus: "assigned",
      vehicleType: "Helicopter",
      issues: [],
    });
    assert.strictEqual(invalid.isValid, false);
    assert.match(invalid.errors.vehicleType ?? "", /Vehicle type must be one of:/);

    // Blank optional vehicle fields pass
    const blankOptional = validateTourForm({
      guideStatus: "unassigned",
      guideName: "",
      driverName: "",
      driverNotes: "",
      vehicleStatus: "unassigned",
      vehicleRef: "",
      vehicleType: "",
      hotelConfirmation: "",
      issues: [],
    });
    assert.strictEqual(blankOptional.isValid, true);
  });
});

describe("11. Shared production operations: applyIssueUpdate and cancelTourEdit", () => {
  const initialIssues = [
    {
      id: "iss-1",
      category: "guide" as const,
      description: "Guide pending",
      resolved: false,
    },
    {
      id: "iss-2",
      category: "vehicle" as const,
      description: "Vehicle maintenance pending",
      resolved: false,
    },
  ];

  test("applyIssueUpdate resolves target issue independently without mutating peer issues", () => {
    const updated = applyIssueUpdate(initialIssues, "iss-1", {
      resolved: true,
      resolutionNotes: "Guide Sunil confirmed",
    });

    assert.strictEqual(updated.length, 2);
    assert.strictEqual(updated[0].resolved, true);
    assert.strictEqual(updated[0].resolutionNotes, "Guide Sunil confirmed");
    assert.ok(updated[0].resolvedAt, "Must record resolution timestamp");

    // Peer issue must remain completely untouched
    assert.strictEqual(updated[1].resolved, false);
    assert.strictEqual(updated[1].resolutionNotes, undefined);
    assert.strictEqual(updated[1].resolvedAt, undefined);
  });

  test("applyIssueUpdate reopening an issue clears resolution timestamp", () => {
    const resolvedState = applyIssueUpdate(initialIssues, "iss-1", {
      resolved: true,
      resolutionNotes: "Guide Sunil confirmed",
    });
    assert.ok(resolvedState[0].resolvedAt);

    const reopenedState = applyIssueUpdate(resolvedState, "iss-1", {
      resolved: false,
    });
    assert.strictEqual(reopenedState[0].resolved, false);
    assert.strictEqual(reopenedState[0].resolvedAt, undefined);
  });

  test("cancelTourEdit discards in-progress draft changes and preserves saved state", () => {
    const savedTour = getTourById("tour-003", "2026-10-17");
    assert.ok(savedTour);

    // Call shared production function cancelTourEdit
    const cancelled = cancelTourEdit(savedTour);

    assert.deepStrictEqual(cancelled, savedTour, "cancelTourEdit must return saved tour intact");
  });
});

describe("12. Shared session store and dashboard-derived reactivity", () => {
  const refDate = "2026-10-17";
  const baselineTours = getMockTours(refDate);

  test("saveSessionTour and mergeSessionTours dynamically update tour list", () => {
    clearAllSessionTours();

    const targetTour = getTourById("tour-003", refDate);
    assert.ok(targetTour);
    assert.strictEqual(targetTour.status, "attention");

    // Modify tour-003 in session store: change status to active
    const modifiedTour = {
      ...targetTour,
      status: "active" as const,
      operationalNotes: "Attention cleared by operations coordinator",
    };
    saveSessionTour(modifiedTour);

    // Retrieve via session store
    const retrieved = getSessionTour("tour-003");
    assert.ok(retrieved);
    assert.strictEqual(retrieved.status, "active");

    // Merge session tours over baseline
    const merged = mergeSessionTours(baselineTours, { "tour-003": retrieved });
    const mergedTarget = merged.find((t) => t.id === "tour-003");
    assert.strictEqual(mergedTarget?.status, "active");

    // Baseline tour-001 remains unchanged
    const mergedTour1 = merged.find((t) => t.id === "tour-001");
    assert.strictEqual(mergedTour1?.status, "active");

    // Clear session tour
    clearSessionTour("tour-003");
    assert.strictEqual(getSessionTour("tour-003"), null);
  });

  test("dashboard metrics, attention items, and upcoming arrivals reflect session-modified tours", () => {
    const today = refDate;
    const initialMetrics = computeDashboardMetricsFromTours(baselineTours, today);
    const initialAttention = getAttentionItemsFromTours(baselineTours);

    assert.strictEqual(initialMetrics.requireAttention, 2);
    assert.strictEqual(initialAttention.length, 2);
    assert.ok(initialAttention.some((item) => item.tourId === "tour-003"));

    // Simulate operator resolving tour-003 and explicitly marking it active
    const tour3 = getTourById("tour-003", today)!;
    const modifiedTour3 = {
      ...tour3,
      status: "active" as const,
      operationalNotes: "All issues resolved and vehicle confirmed",
    };

    const sessionMergedTours = mergeSessionTours(baselineTours, {
      "tour-003": modifiedTour3,
    });

    // Derive metrics and attention items using shared production functions
    const reactiveMetrics = computeDashboardMetricsFromTours(sessionMergedTours, today);
    const reactiveAttention = getAttentionItemsFromTours(sessionMergedTours);
    const reactiveArrivals = getUpcomingArrivalsFromTours(sessionMergedTours, 10, today);

    // Require attention count drops from 2 to 1
    assert.strictEqual(reactiveMetrics.requireAttention, 1);
    assert.strictEqual(reactiveAttention.length, 1);

    // tour-003 is removed from attention items
    assert.strictEqual(
      reactiveAttention.some((item) => item.tourId === "tour-003"),
      false,
      "Resolved tour must be dynamically removed from attention items"
    );

    // Active tours count increases
    assert.strictEqual(reactiveMetrics.activeToday, initialMetrics.activeToday + 1);

    // Upcoming arrivals include tour-003 as active arrival today
    assert.ok(
      reactiveArrivals.some((tour) => tour.id === "tour-003"),
      "Upcoming arrivals list dynamically reflects session-updated tour status"
    );
  });
});

describe("13. Session storage failure handling, subscriber notifications, and draft preservation contract", () => {
  const refDate = getIndiaTodayISO();
  const baseTour = getTourById("tour-003", refDate)!;

  test("saveSessionTour() returns { success: true } and triggers subscriber notification on success", () => {
    resetSessionStoreForTesting();
    let notificationCount = 0;
    const unsubscribe = subscribeSessionStore(() => {
      notificationCount++;
    });

    try {
      const updatedTour: Tour = {
        ...baseTour,
        status: "active",
        operationalNotes: "Verified Ramesh Kumar driver assignment",
      };

      const result = saveSessionTour(updatedTour);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.error, undefined);
      assert.strictEqual(notificationCount, 1, "Subscriber must be notified on successful write");

      const retrieved = getSessionTour(baseTour.id);
      assert.strictEqual(retrieved?.operationalNotes, "Verified Ramesh Kumar driver assignment");
    } finally {
      unsubscribe();
      resetSessionStoreForTesting();
    }
  });

  test("saveSessionTour() returns honest error result when storage write fails (e.g. quota exceeded)", () => {
    resetSessionStoreForTesting();
    let notificationCount = 0;
    const unsubscribe = subscribeSessionStore(() => {
      notificationCount++;
    });

    try {
      simulateStorageFailureForTesting("QuotaExceededError: DomException: quota exceeded");

      const updatedTour: Tour = {
        ...baseTour,
        status: "active",
        operationalNotes: "Notes on write failure",
      };

      const result = saveSessionTour(updatedTour);
      assert.strictEqual(result.success, false, "Must return failure when storage write fails");
      assert.ok(result.error && result.error.includes("quota exceeded"), "Error message must describe failure");
      assert.strictEqual(notificationCount, 0, "Subscribers must NOT be notified if write fails");
    } finally {
      unsubscribe();
      resetSessionStoreForTesting();
    }
  });

  test("storage driver whose getItem() throws triggers detectable failure and does not report false success", () => {
    resetSessionStoreForTesting();

    try {
      const throwingReadDriver: StorageDriver = {
        getItem: () => {
          throw new Error("Quota or hardware I/O error during read");
        },
        setItem: () => {},
        removeItem: () => {},
      };
      setStorageDriverForTesting(throwingReadDriver);

      // 1. Reading returns explicit failure
      const readResult = getSessionToursResult();
      assert.strictEqual(readResult.success, false);
      assert.ok(readResult.error?.includes("hardware I/O error"));

      // 2. clearSessionTour must NOT return true when storage state cannot be read
      const clearResult = clearSessionTour(baseTour.id);
      assert.strictEqual(clearResult.success, false, "Must not return false success when storage is unreadable");
      assert.ok(clearResult.error?.includes("hardware I/O error"));

      // 3. saveSessionTour must refuse to save when storage cannot be read
      const saveResult = saveSessionTour(baseTour);
      assert.strictEqual(saveResult.success, false, "Must not overwrite when storage is unreadable");
      assert.ok(saveResult.error?.includes("hardware I/O error"));
    } finally {
      resetSessionStoreForTesting();
    }
  });

  test("distinguishes genuinely empty storage from an unreadable storage failure", () => {
    resetSessionStoreForTesting();

    try {
      // Case A: Genuinely empty storage key (no driver error) -> clearing non-existent tour is safe no-op
      const emptyResult = clearSessionTour("tour-non-existent");
      assert.strictEqual(emptyResult.success, true, "Empty store returns true for non-existent tour");

      // Case B: Unreadable storage (driver throws) -> clearing non-existent tour MUST report failure
      const brokenDriver: StorageDriver = {
        getItem: () => {
          throw new Error("SecurityError: Access is denied");
        },
        setItem: () => {},
        removeItem: () => {},
      };
      setStorageDriverForTesting(brokenDriver);

      const unreadableResult = clearSessionTour("tour-non-existent");
      assert.strictEqual(
        unreadableResult.success,
        false,
        "Unreadable store must report failure, not false success"
      );
      assert.ok(unreadableResult.error?.includes("Access is denied"));
    } finally {
      resetSessionStoreForTesting();
    }
  });

  test("failed save and failed clear operations preserve previously saved session data without corruption", () => {
    resetSessionStoreForTesting();

    try {
      let backingStore: Record<string, string> = {};
      let failNextOperation: "none" | "read" | "write" = "none";

      const controllableDriver: StorageDriver = {
        getItem: (k) => {
          if (failNextOperation === "read") {
            throw new Error("Simulated storage read error");
          }
          return backingStore[k] ?? null;
        },
        setItem: (k, v) => {
          if (failNextOperation === "write") {
            throw new Error("Simulated storage write error");
          }
          backingStore[k] = v;
        },
        removeItem: (k) => {
          delete backingStore[k];
        },
      };

      setStorageDriverForTesting(controllableDriver);

      // 1. Initial valid save
      const initialTour: Tour = {
        ...baseTour,
        operationalNotes: "Original Preserved Data A",
      };
      const initialSave = saveSessionTour(initialTour);
      assert.strictEqual(initialSave.success, true);
      assert.strictEqual(getSessionTour(baseTour.id)?.operationalNotes, "Original Preserved Data A");

      // 2. Storage write throws: save fails
      failNextOperation = "write";
      const failedSave = saveSessionTour({
        ...baseTour,
        operationalNotes: "Corrupted Note B",
      });
      assert.strictEqual(failedSave.success, false);

      // Verify original data is preserved
      failNextOperation = "none";
      assert.strictEqual(
        getSessionTour(baseTour.id)?.operationalNotes,
        "Original Preserved Data A",
        "Data preserved after write failure"
      );

      // 3. Storage read throws: clear fails
      failNextOperation = "read";
      const failedClear = clearSessionTour(baseTour.id);
      assert.strictEqual(failedClear.success, false);

      // Verify original data is still preserved
      failNextOperation = "none";
      assert.strictEqual(
        getSessionTour(baseTour.id)?.operationalNotes,
        "Original Preserved Data A",
        "Data preserved after clear failure"
      );
    } finally {
      resetSessionStoreForTesting();
    }
  });

  test("corrupted JSON payload in storage is safely rejected and protected from overwriting", () => {
    resetSessionStoreForTesting();

    try {
      let rawData = "{ invalid JSON syntax / payload";
      const corruptDriver: StorageDriver = {
        getItem: () => rawData,
        setItem: (k, v) => {
          rawData = v;
        },
        removeItem: () => {
          rawData = "";
        },
      };
      setStorageDriverForTesting(corruptDriver);

      // Reading detects corruption
      const readResult = getSessionToursResult();
      assert.strictEqual(readResult.success, false);
      assert.ok(readResult.error?.includes("Corrupted session data"));

      // Saving refuses to overwrite corrupted payload
      const saveResult = saveSessionTour(baseTour);
      assert.strictEqual(saveResult.success, false);
      assert.strictEqual(
        rawData,
        "{ invalid JSON syntax / payload",
        "Corrupted storage must not be overwritten by saveSessionTour"
      );

      // Clearing refuses to operate on corrupted payload
      const clearResult = clearSessionTour(baseTour.id);
      assert.strictEqual(clearResult.success, false);
      assert.strictEqual(
        rawData,
        "{ invalid JSON syntax / payload",
        "Corrupted storage must not be overwritten by clearSessionTour"
      );
    } finally {
      resetSessionStoreForTesting();
    }
  });

  test("clearSessionTour() and clearAllSessionTours() return detectable error when write fails", () => {
    resetSessionStoreForTesting();

    try {
      // First save an item successfully so that clearSessionTour has a record to remove
      const saveRes = saveSessionTour({ ...baseTour, operationalNotes: "To be cleared" });
      assert.strictEqual(saveRes.success, true);

      simulateStorageFailureForTesting("SecurityError: Access is denied");

      const singleClearResult = clearSessionTour(baseTour.id);
      assert.strictEqual(singleClearResult.success, false);
      assert.ok(singleClearResult.error?.includes("Access is denied"));

      const allClearResult = clearAllSessionTours();
      assert.strictEqual(allClearResult.success, false);
      assert.ok(allClearResult.error?.includes("Access is denied"));
    } finally {
      resetSessionStoreForTesting();
    }
  });

  test("clearSessionTour() and clearAllSessionTours() return { success: true } and notify subscribers on success", () => {
    resetSessionStoreForTesting();
    let notificationCount = 0;
    const unsubscribe = subscribeSessionStore(() => {
      notificationCount++;
    });

    try {
      saveSessionTour({ ...baseTour, operationalNotes: "Clear test note 1" });
      assert.strictEqual(notificationCount, 1);

      const clearSingleResult = clearSessionTour(baseTour.id);
      assert.strictEqual(clearSingleResult.success, true);
      assert.strictEqual(notificationCount, 2, "Subscriber notified on single clear");

      saveSessionTour({ ...baseTour, operationalNotes: "Clear test note 2" });
      assert.strictEqual(notificationCount, 3);

      const clearAllResult = clearAllSessionTours();
      assert.strictEqual(clearAllResult.success, true);
      assert.strictEqual(notificationCount, 4, "Subscriber notified on clear all");
      assert.strictEqual(getSessionTours(), null);
    } finally {
      unsubscribe();
      resetSessionStoreForTesting();
    }
  });

  test("UI draft preservation contract simulation (Node test runner without headless browser / DOM automation): failed save keeps draft intact and does not report success", () => {
    resetSessionStoreForTesting();

    // Contract simulation: Validates the state and error transition flow shared between EditTourModal and TourDetailClient.
    // Note: This project test runner executes via Node.js tsx --test without a DOM / jsdom environment; real browser-level DOM interaction is simulated via state contract.
    const draftState = {
      driverName: "Operator Draft Driver",
      vehicleNumber: "HR 26 DQ 9999",
      operationalNotes: "Operator draft notes awaiting persist",
    };

    // UI state flags
    let modalIsOpen = true;
    let successBannerShown = false;
    let inlineErrorMessage: string | null = null;

    // Simulate storage write failure
    simulateStorageFailureForTesting("QuotaExceededError: storage full");

    const onSaveDraft = (draft: typeof draftState): StorageOperationResult => {
      const updated: Tour = {
        ...baseTour,
        operationalNotes: draft.operationalNotes,
      };

      const result = saveSessionTour(updated);
      if (!result.success) {
        // Modal logic per EditTourModal / TourDetailClient contract:
        // Do NOT close modal, do NOT set success banner, set inline error, preserve draftState
        inlineErrorMessage = result.error ?? "Failed to save changes to session storage.";
        return result;
      }

      modalIsOpen = false;
      successBannerShown = true;
      return result;
    };

    const saveResult = onSaveDraft(draftState);

    // Verify contract expectations:
    assert.strictEqual(saveResult.success, false);
    assert.strictEqual(modalIsOpen, true, "Modal must remain open on save failure");
    assert.strictEqual(successBannerShown, false, "Success banner must NOT be shown when save fails");
    const errText = inlineErrorMessage as string | null;
    assert.ok(errText && errText.includes("storage full"), "Inline error must be set");
    assert.strictEqual(draftState.driverName, "Operator Draft Driver", "Draft values must be preserved intact in state");
    assert.strictEqual(draftState.vehicleNumber, "HR 26 DQ 9999");
    assert.strictEqual(draftState.operationalNotes, "Operator draft notes awaiting persist");

    resetSessionStoreForTesting();
  });

  test("getSessionTours() and getSessionTour() throw on storage read failure, preventing confusion with empty data (null)", () => {
    resetSessionStoreForTesting();

    try {
      // 1. Genuinely empty store returns null
      assert.strictEqual(getSessionTours(), null);
      assert.strictEqual(getSessionTour("tour-003"), null);

      // 2. Unreadable store throws Error instead of returning null
      const brokenDriver: StorageDriver = {
        getItem: () => {
          throw new Error("Simulated storage read permission denied");
        },
        setItem: () => {},
        removeItem: () => {},
      };
      setStorageDriverForTesting(brokenDriver);

      assert.throws(
        () => getSessionTours(),
        /Simulated storage read permission denied/,
        "getSessionTours must throw on read failure rather than returning null"
      );

      assert.throws(
        () => getSessionTour("tour-003"),
        /Simulated storage read permission denied/,
        "getSessionTour must throw on read failure rather than returning null"
      );
    } finally {
      resetSessionStoreForTesting();
    }
  });

  test("getSessionSnapshot() returns error-prefixed string on read failure and empty string when genuinely empty", () => {
    resetSessionStoreForTesting();

    try {
      // 1. Empty storage returns empty string
      assert.strictEqual(getSessionSnapshot(), "");

      // 2. Storage read error returns error-prefixed string
      const brokenDriver: StorageDriver = {
        getItem: () => {
          throw new Error("Quota or hardware read fault");
        },
        setItem: () => {},
        removeItem: () => {},
      };
      setStorageDriverForTesting(brokenDriver);

      const errorSnapshot = getSessionSnapshot();
      assert.ok(errorSnapshot.startsWith(SESSION_READ_ERROR_PREFIX));
      assert.ok(errorSnapshot.includes("Quota or hardware read fault"));

      // 3. Corrupted JSON payload also produces error-prefixed string
      const corruptDriver: StorageDriver = {
        getItem: () => "{ unclosed json payload",
        setItem: () => {},
        removeItem: () => {},
      };
      setStorageDriverForTesting(corruptDriver);

      const corruptSnapshot = getSessionSnapshot();
      assert.ok(corruptSnapshot.startsWith(SESSION_READ_ERROR_PREFIX));
      assert.ok(corruptSnapshot.includes("Corrupted session data"));
    } finally {
      resetSessionStoreForTesting();
    }
  });

  test("parseSessionSnapshot() accurately distinguishes empty, ready, and error states without silent fallback", () => {
    // A: Genuinely empty
    const emptyState = parseSessionSnapshot("");
    assert.strictEqual(emptyState.status, "empty");
    assert.strictEqual(emptyState.tours, null);
    assert.strictEqual(emptyState.error, null);

    // B: Valid session data
    const validJson = JSON.stringify({ "tour-003": baseTour });
    const readyState = parseSessionSnapshot(validJson);
    assert.strictEqual(readyState.status, "ready");
    assert.ok(readyState.tours && readyState.tours["tour-003"]);
    assert.strictEqual(readyState.error, null);

    // C: Prefixed storage read error
    const errState = parseSessionSnapshot(`${SESSION_READ_ERROR_PREFIX}Access denied by browser`);
    assert.strictEqual(errState.status, "error");
    assert.strictEqual(errState.tours, null);
    assert.strictEqual(errState.error, "Access denied by browser");

    // D: Corrupted JSON syntax
    const badJsonState = parseSessionSnapshot("{ invalid json");
    assert.strictEqual(badJsonState.status, "error");
    assert.strictEqual(badJsonState.tours, null);
    assert.ok(badJsonState.error && badJsonState.error.includes("Corrupted session data"));

    // E: Non-object JSON
    const numberState = parseSessionSnapshot("12345");
    assert.strictEqual(numberState.status, "error");
    assert.strictEqual(numberState.tours, null);
    assert.ok(numberState.error && numberState.error.includes("Corrupted session data"));
  });

  test("UI data layer consumer simulation (Node test runner without headless browser): read failure exposes error state and prevents mistaking unreadable storage for empty store", () => {
    resetSessionStoreForTesting();

    try {
      // Contract simulation: Validates that consumers (DashboardView, ToursView, TourDetailClient)
      // do NOT mistake a failed read for an empty store and do NOT present baseline without alert.
      const brokenDriver: StorageDriver = {
        getItem: () => {
          throw new Error("Sandbox filesystem error");
        },
        setItem: () => {},
        removeItem: () => {},
      };
      setStorageDriverForTesting(brokenDriver);

      // 1. Snapshot taken by useSyncExternalStore
      const snapshot = getSessionSnapshot();

      // 2. Consumer parses snapshot
      const consumerState = parseSessionSnapshot(snapshot);

      // 3. Consumer state guarantees:
      assert.strictEqual(
        consumerState.status,
        "error",
        "Consumer must be informed of error status, not empty status"
      );
      assert.strictEqual(consumerState.tours, null, "Corrupt or unreadable tours must not be merged");
      assert.ok(
        consumerState.error && consumerState.error.includes("Sandbox filesystem error"),
        "Error message must be passed to UI banner"
      );

      // 4. Verify merge behavior with null tours produces clean fallback without corrupting state
      const fallbackTours = mergeSessionTours([baseTour], consumerState.tours);
      assert.strictEqual(fallbackTours[0].id, baseTour.id);
    } finally {
      resetSessionStoreForTesting();
    }
  });
});

