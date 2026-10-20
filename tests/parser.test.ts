import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

import {
  xldateToISO,
  getSheetSeason,
  extractGuestAndPax,
  extractFlights,
  extractGuideAssignment,
  extractVehicleAssignment,
  inferCircuitDestination,
  extractHotels,
  parseExcelWorkbook,
  extractTrainJourneys,
  detectSheetLayout,
  resolveHistoricalDateCandidate,
} from "../lib/excel-parser";
import {
  mergeCoordinatorFields,
  compareIncomingWithExisting,
  maskGuestName,
  validateNewTourForm,
  createNewTour,
} from "../lib/operations";
import { tourToRow, rowToTour } from "../lib/operational-store";
import {
  getCanonicalTourById,
  getCanonicalToursByRef,
  saveCanonicalDataset,
  clearCanonicalDataset,
} from "../lib/canonical-store";
import type { Tour } from "../lib/types";

describe("Excel Parser — Core Extraction & Utility Functions", () => {
  test("xldateToISO converts numeric Excel serials correctly", () => {
    // 45962 = 2025-11-01
    assert.strictEqual(xldateToISO(45962), "2025-11-01");
    // 45658 = 2025-01-01
    assert.strictEqual(xldateToISO(45658), "2025-01-01");
    // 46056 = 2026-02-03
    assert.strictEqual(xldateToISO(46056), "2026-02-03");
  });

  test("xldateToISO converts standard date strings or returns null for non-dates", () => {
    assert.strictEqual(xldateToISO("2026-03-15"), "2026-03-15");
    assert.strictEqual(xldateToISO("15/03/2026"), "2026-03-15");
    assert.strictEqual(xldateToISO("not-a-date"), null);
    assert.strictEqual(xldateToISO(null), null);
    assert.strictEqual(xldateToISO(undefined), null);
  });

  test("getSheetSeason classifies sheet names into standard operational seasons", () => {
    assert.strictEqual(getSheetSeason("OCT 2025"), "2025-2026");
    assert.strictEqual(getSheetSeason("JAN 2026"), "2025-2026");
    assert.strictEqual(getSheetSeason("MARCH 2026"), "2025-2026");
    assert.strictEqual(getSheetSeason("JAN 2025"), "2024-2025");
    assert.strictEqual(getSheetSeason("APR-19"), "2018-2019");
    assert.strictEqual(getSheetSeason("DEC 22"), "2021-2022");
  });

  test("extractGuestAndPax correctly extracts guest name and pax counts", () => {
    const p1 = extractGuestAndPax("MATSUZAWA RIO MS X03");
    assert.strictEqual(p1.guestName, "MATSUZAWA RIO MS");
    assert.strictEqual(p1.pax, 3);

    const p2 = extractGuestAndPax("KANI CHIE MS X04PAX");
    assert.strictEqual(p2.guestName, "KANI CHIE MS");
    assert.strictEqual(p2.pax, 4);

    const p3 = extractGuestAndPax("FUJITA NAOSUKE MR X01");
    assert.strictEqual(p3.guestName, "FUJITA NAOSUKE MR");
    assert.strictEqual(p3.pax, 1);

    const p4 = extractGuestAndPax("ABE SHINJI MR *2");
    assert.strictEqual(p4.guestName, "ABE SHINJI MR");
    assert.strictEqual(p4.pax, 2);

    const p5 = extractGuestAndPax("SINGLE TRAVELLER");
    assert.strictEqual(p5.guestName, "SINGLE TRAVELLER");
    assert.strictEqual(p5.pax, 1);
  });

  test("extractFlights extracts valid flight codes and airline names", () => {
    const flights = extractFlights("JL-39 T-URBANIA", "2025-10-05", "1253572");
    assert.strictEqual(flights.length, 1);
    assert.strictEqual(flights[0].flightNumber, "JL-39");
    assert.strictEqual(flights[0].airline, "Japan Airlines");
    assert.strictEqual(flights[0].date, "2025-10-05");

    const multiFlights = extractFlights("ARR SQ-406 DEP SQ-403", "2025-10-03", "1253572");
    assert.strictEqual(multiFlights.length, 2);
    assert.strictEqual(multiFlights[0].flightNumber, "SQ-406");
    assert.strictEqual(multiFlights[0].airline, "Singapore Airlines");
    assert.strictEqual(multiFlights[1].flightNumber, "SQ-403");
  });

  test("extractGuideAssignment handles assigned and unassigned guide rows", () => {
    const assigned = extractGuideAssignment("G-MANGE RAM", "1253572");
    assert.strictEqual(assigned.status, "assigned");
    assert.strictEqual(assigned.name, "MANGE RAM");

    const unassignedEmpty = extractGuideAssignment("G-", "1253572");
    assert.strictEqual(unassignedEmpty.status, "pending");
    assert.strictEqual(unassignedEmpty.name, "Unassigned Guide");

    const unassignedNil = extractGuideAssignment("NIL", "1253572");
    assert.strictEqual(unassignedNil.status, "pending");
  });

  test("extractVehicleAssignment extracts vehicle models from transport rows", () => {
    const urbania = extractVehicleAssignment("JL-39 T-URBANIA", "1253572");
    assert.ok(urbania);
    assert.strictEqual(urbania.vehicleType, "Urbania");

    const innova = extractVehicleAssignment("INNOVA CRYSTAL", "1253572");
    assert.ok(innova);
    assert.strictEqual(innova.vehicleType, "Innova");

    const none = extractVehicleAssignment("", "1253572");
    assert.strictEqual(none, null);
  });

  test("inferCircuitDestination detects destinations from itinerary and package code", () => {
    const gt = inferCircuitDestination(["DEL SS", "AGRA SS", "JAI SS"], "IN-TU01-NB");
    assert.ok(gt.includes("Golden Triangle"));

    const vns = inferCircuitDestination(["DEL SS", "VNS SS", "BSB STN"], "");
    assert.ok(vns.includes("Varanasi"));
  });

  test("extractHotels extracts hotel names with H- prefix", () => {
    const itinerary = [
      { date: "2025-10-03", activity: "ARR SQ-406 TRF H- AAVAAS" },
      { date: "2025-10-04", activity: "DEL SS TRF JAI H- YASH REGENCY" },
    ];
    const hotels = extractHotels(itinerary, "1253572");
    assert.strictEqual(hotels.length, 2);
    assert.strictEqual(hotels[0].hotelName, "AAVAAS");
    assert.strictEqual(hotels[1].hotelName, "YASH REGENCY");
    assert.strictEqual(hotels[1].city, "Jaipur");
  });
});

describe("Excel Parser — Synthetic 3-Row Workbook End-to-End", () => {
  test("parses 3-row tour block architecture and preserves provenance faithfully", () => {
    // Construct a minimal in-memory workbook mimicking the SATF 3-row layout
    const wsData: (string | number | undefined)[][] = [
      // Row 0: Column headers & dates
      [undefined, undefined, undefined, undefined, undefined, undefined, 45931, 45932, 45933],
      // Row 1: Day names
      [undefined, undefined, undefined, undefined, undefined, undefined, "WED", "THU", "FRI"],
      // Row 2: Tour Row
      [45931, "SH2", 1253572, "IN-TU01-NB", "KURASHIMA YUKA MS X02", "OP SARI RENTAL", "ARR SQ-406 TRF H- AAVAAS", "DEL SS", "AGRA SS H- TAJ VIEW"],
      // Row 3: Flight/Vehicle Row
      [undefined, undefined, undefined, undefined, "SQ-406 T-URBANIA", undefined, undefined, undefined, undefined],
      // Row 4: Guide Row
      [undefined, undefined, undefined, undefined, "G-MANGE RAM", undefined, undefined, undefined, undefined],
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "OCT 2025");
    const wbBuf = XLSX.write(wb, { type: "buffer", bookType: "xls" });

    const result = parseExcelWorkbook(wbBuf);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.summary.totalTourBlocks, 1);
    assert.strictEqual(result.summary.canonicalToursCount, 1);

    const tour = result.tours[0];
    assert.strictEqual(tour.bookingReference, "1253572");
    assert.strictEqual(tour.group.groupName, "KURASHIMA YUKA MS");
    assert.strictEqual(tour.group.adultCount, 2);
    assert.strictEqual(tour.agency, "SH2");
    assert.strictEqual(tour.packageCode, "IN-TU01-NB");
    assert.strictEqual(tour.arrivalDate, "2025-10-01");
    assert.strictEqual(tour.departureDate, "2025-10-03");
    assert.strictEqual(tour.sourceSheet, "OCT 2025");
    assert.strictEqual(tour.sourceRow, 3);
    assert.strictEqual(tour.rawArrivalSerial, 45931);
    assert.strictEqual(tour.hasDateAmbiguity, false);
    assert.strictEqual(tour.assignments[0].name, "MANGE RAM");
    assert.strictEqual(tour.hotels.length, 2);
    assert.strictEqual(tour.hotels[0].hotelName, "AAVAAS");
    assert.strictEqual(tour.hotels[1].hotelName, "TAJ VIEW");
  });

  test("reconciles dates deterministically per Rule SHEET_TEMPLATE_YEAR_RECONCILIATION", () => {
    const wsData: (string | number | undefined)[][] = [
      [undefined, undefined, undefined, undefined, undefined, undefined, 45658],
      [undefined, undefined, undefined, undefined, undefined, undefined, "WED"],
      // Row 2: Arrival serial 45658 evaluates to 2025-01-01, but sheet is named JAN 2026 (1-year template offset)
      [45658, "SH2", 1253602, "IN-T402", "ENDO SATOKO MS X01", "VEG MEAL", "ARR JL-39 TRF H- AAVAAS"],
      [undefined, undefined, undefined, undefined, "JL-39 T-", undefined, undefined],
      [undefined, undefined, undefined, undefined, "G-KAMAL", undefined, undefined],
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "JAN 2026");
    const wbBuf = XLSX.write(wb, { type: "buffer", bookType: "xls" });

    const result = parseExcelWorkbook(wbBuf);
    // Verified: Deterministic 1-year template shift rule corrects the date and records in correctedDates
    assert.strictEqual(result.summary.correctedDatesCount, 1);
    assert.strictEqual(result.correctedDates?.[0].bookingReference, "1253602");
    assert.strictEqual(result.correctedDates?.[0].originalDate, "2025-01-01");
    assert.strictEqual(result.correctedDates?.[0].correctedDate, "2026-01-01");
    assert.strictEqual(result.correctedDates?.[0].rule, "SHEET_TEMPLATE_YEAR_RECONCILIATION");

    const tour = result.tours[0];
    assert.strictEqual(tour.arrivalDate, "2026-01-01");
    assert.strictEqual(tour.originalArrivalDate, "2025-01-01");
    assert.strictEqual(tour.rawArrivalSerial, 45658);
    assert.strictEqual(tour.hasDateAmbiguity, false);
    assert.ok(tour.dateCorrectionReason?.includes("SHEET_TEMPLATE_YEAR_RECONCILIATION"));
  });

  test("flags unresolved date ambiguities without silently guessing when rules do not match", () => {
    const wsData: (string | number | undefined)[][] = [
      [undefined, undefined, undefined, undefined, undefined, undefined, 44000],
      [undefined, undefined, undefined, undefined, undefined, undefined, "WED"],
      // Row 2: Date serial 44000 is year 2020 (diff > 1 year from 2026), irregular discrepancy
      [44000, "SH2", 1253605, "IN-T402", "IRREGULAR GUEST MS X01", "", "ARR JL-39 TRF H- AAVAAS"],
      [undefined, undefined, undefined, undefined, "JL-39 T-", undefined, undefined],
      [undefined, undefined, undefined, undefined, "G-KAMAL", undefined, undefined],
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "JAN 2026");
    const wbBuf = XLSX.write(wb, { type: "buffer", bookType: "xls" });

    const result = parseExcelWorkbook(wbBuf);
    assert.strictEqual(result.summary.dateAmbiguityCount, 1);
    assert.strictEqual(result.ambiguities[0].bookingReference, "1253605");
    assert.ok(result.ambiguities[0].reason.includes("mathematically calculates to"));

    const tour = result.tours[0];
    assert.strictEqual(tour.hasDateAmbiguity, true);
    // Preserved original calculated date; never silently guessed
    assert.strictEqual(tour.arrivalDate, "2020-06-18");
    assert.strictEqual(tour.rawArrivalSerial, 44000);
  });

  test("detects shifted-column layouts (DEC-17 and JAN-18) dynamically", () => {
    // Construct shifted-column layout: Col 0 is empty, Col 1 is date, Col 2 is agency, Col 3 is booking ref
    const wsData: (string | number | undefined)[][] = [
      [undefined, undefined, undefined, undefined, undefined, undefined, 43070, 43071],
      [undefined, undefined, undefined, undefined, undefined, undefined, "FRI", "SAT"],
      [undefined, 43070, "SO2", 1050052, "IN-K419-NP", "TAKAGAKI JUN MS X01", "ARR NH827 TRF H- JENIFFER", "TRF AGRA SS"],
      [undefined, undefined, undefined, undefined, undefined, "NH827 T-", undefined, undefined],
      [undefined, undefined, undefined, undefined, undefined, "G-ANIL", undefined, undefined],
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "DEC-17");
    const wbBuf = XLSX.write(wb, { type: "buffer", bookType: "xls" });

    const result = parseExcelWorkbook(wbBuf);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.summary.canonicalToursCount, 1);

    const tour = result.tours[0];
    assert.strictEqual(tour.bookingReference, "1050052");
    assert.strictEqual(tour.agency, "SO2");
    assert.strictEqual(tour.packageCode, "IN-K419-NP");
    assert.strictEqual(tour.group.groupName, "TAKAGAKI JUN MS");
    assert.strictEqual(tour.group.adultCount, 1);
    assert.strictEqual(tour.sourceSheet, "DEC-17");
    assert.strictEqual(tour.sourceRow, 3);
    assert.strictEqual(tour.assignments[0].name, "ANIL");
  });

  test("flags cancellation indicators for coordinator confirmation without altering status", () => {
    const wsData: (string | number | undefined)[][] = [
      [undefined, undefined, undefined, undefined, undefined, undefined, 45931],
      [undefined, undefined, undefined, undefined, undefined, undefined, "WED"],
      // Notes contain CNCL keyword
      [45931, "SH2", 999111, "PKG-1", "AOKI KENJI MR X01", "CNCL PER AGENT EMAIL 02 OCT", "ARR DEL TRF H- HOTEL"],
      [undefined, undefined, undefined, undefined, "T-INNOVA", undefined, undefined],
      [undefined, undefined, undefined, undefined, "G-SUNIL", undefined, undefined],
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "OCT 2025");
    const wbBuf = XLSX.write(wb, { type: "buffer", bookType: "xls" });

    const result = parseExcelWorkbook(wbBuf);
    assert.strictEqual(result.summary.possibleCancellationsCount, 1);
    assert.strictEqual(result.possibleCancellations?.[0].bookingReference, "999111");

    const tour = result.tours[0];
    // Verified: Tour status is NOT automatically set to cancelled; flagged for review, computed to completed for past 2025 date
    assert.notStrictEqual(tour.status, "cancelled");
    assert.strictEqual(tour.status, "completed");
    assert.strictEqual(tour.hasCancellationIndicator, true);
    assert.ok(tour.cancellationIndicatorReason?.includes("CNCL"));
  });

  test("preserves distinct records when booking references repeat for different guests", () => {
    const wsData: (string | number | undefined)[][] = [
      [undefined, undefined, undefined, undefined, undefined, undefined, 45212],
      [undefined, undefined, undefined, undefined, undefined, undefined, "MON"],
      // Tour 1: Guest A
      [45212, "SH2", 1222824, "PKG-A", "KIGOSHI SHINICHIRO MR X1", "", "ARR DEL TRF H- HOTEL1"],
      [undefined, undefined, undefined, undefined, "T-INNOVA", undefined, undefined],
      [undefined, undefined, undefined, undefined, "G-AMIT", undefined, undefined],
      // Tour 2: Guest B with SAME booking ref
      [45212, "SH2", 1222824, "PKG-B", "HIRAOKA SATOKO MS X1", "", "ARR DEL TRF H- HOTEL2"],
      [undefined, undefined, undefined, undefined, "T-INNOVA", undefined, undefined],
      [undefined, undefined, undefined, undefined, "G-SUNIL", undefined, undefined],
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "OCT 23");
    const wbBuf = XLSX.write(wb, { type: "buffer", bookType: "xls" });

    const result = parseExcelWorkbook(wbBuf);
    // Verified Decision 4: Preserves distinct source tours without silent merge or discard
    assert.strictEqual(result.summary.canonicalToursCount, 2);
    assert.strictEqual(result.summary.preservedDistinctCount, 2);
    assert.strictEqual(result.duplicates.length, 1);
    assert.strictEqual(result.duplicates[0].resolution, "preserved_distinct");

    // Both tours have unique distinct IDs
    assert.notStrictEqual(result.tours[0].id, result.tours[1].id);
    assert.ok(result.tours[0].id.includes("1222824"));
    assert.ok(result.tours[1].id.includes("1222824"));
  });

  test("extracts structured railway journeys while preserving full itinerary text intact", () => {
    const wsData: (string | number | undefined)[][] = [
      [undefined, undefined, undefined, undefined, undefined, undefined, 45931, 45932],
      [undefined, undefined, undefined, undefined, undefined, undefined, "WED", "THU"],
      [
        45931,
        "SH2",
        1253580,
        "IN-TU01-NB",
        "SAITO KEN MR X02",
        "",
        "ARR DEL TRF NDLS 12560 SHIVGANGA EXP 1855/0700",
        "ARR AGRA SAME DAY AGRA BY GATIMAN EXP PNR 6507470875",
      ],
      [undefined, undefined, undefined, undefined, "T-INNOVA", undefined, undefined, undefined],
      [undefined, undefined, undefined, undefined, "G-AMIT", undefined, undefined, undefined],
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "OCT 2025");
    const wbBuf = XLSX.write(wb, { type: "buffer", bookType: "xls" });

    const result = parseExcelWorkbook(wbBuf);
    const tour = result.tours[0];

    assert.ok(tour.trainJourneys);
    assert.strictEqual(tour.trainJourneys.length, 2);

    // Journey 1: Shivganga
    assert.strictEqual(tour.trainJourneys[0].trainName, "Shivganga Express");
    assert.strictEqual(tour.trainJourneys[0].trainNumber, "12560");
    assert.strictEqual(tour.trainJourneys[0].fromStation, "New Delhi (NDLS)");
    assert.strictEqual(tour.trainJourneys[0].departureTime, "18:55");
    assert.strictEqual(tour.trainJourneys[0].arrivalTime, "07:00");

    // Journey 2: Gatiman with PNR
    assert.strictEqual(tour.trainJourneys[1].trainName, "Gatimaan Express");
    assert.strictEqual(tour.trainJourneys[1].pnr, "6507470875");

    // Verified: Full itinerary text preserved intact
    assert.strictEqual(tour.itinerary[0].title, "ARR DEL TRF NDLS 12560 SHIVGANGA EXP 1855/0700");
    assert.strictEqual(tour.itinerary[1].title, "ARR AGRA SAME DAY AGRA BY GATIMAN EXP PNR 6507470875");
  });

  test("reconciles multi-sheet spanning tours across month boundaries", () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: APR-19
    const wsApr = XLSX.utils.aoa_to_sheet([
      [undefined, undefined, undefined, undefined, undefined, undefined, 43585],
      [undefined, undefined, undefined, undefined, undefined, undefined, "TUE"],
      [43585, "SH2", 1129637, "PKG-1", "GOTO GENKI MR X02", "", "ARR DEL TRF H- HOTEL1"],
      [undefined, undefined, undefined, undefined, "JL-39", undefined, undefined],
      [undefined, undefined, undefined, undefined, "G-SUNIL", undefined, undefined],
    ]);
    XLSX.utils.book_append_sheet(wb, wsApr, "APR-19");

    // Sheet 2: MAY-19 (same booking ref spanning into May)
    const wsMay = XLSX.utils.aoa_to_sheet([
      [undefined, undefined, undefined, undefined, undefined, undefined, 43586],
      [undefined, undefined, undefined, undefined, undefined, undefined, "WED"],
      [43586, "SH2", 1129637, "PKG-1", "GOTO GENKI MR X02", "", "AGRA SS TRF H- HOTEL2"],
      [undefined, undefined, undefined, undefined, "JL-39", undefined, undefined],
      [undefined, undefined, undefined, undefined, "G-SUNIL", undefined, undefined],
    ]);
    XLSX.utils.book_append_sheet(wb, wsMay, "MAY-19");

    const wbBuf = XLSX.write(wb, { type: "buffer", bookType: "xls" });
    const result = parseExcelWorkbook(wbBuf);

    assert.strictEqual(result.summary.totalTourBlocks, 2);
    assert.strictEqual(result.summary.canonicalToursCount, 1);
    assert.strictEqual(result.summary.spanningToursCount, 1);
    assert.strictEqual(result.duplicates.length, 1);
    assert.strictEqual(result.duplicates[0].resolution, "merged_spanning");

    const tour = result.tours[0];
    assert.deepStrictEqual(tour.sourceSheets, ["APR-19", "MAY-19"]);
    assert.strictEqual(tour.itinerary.length, 2);
    assert.strictEqual(tour.itinerary[0].type, "arrival_transfer");
    assert.strictEqual(tour.itinerary[0].location, "Delhi");
    assert.strictEqual(tour.itinerary[1].type, "transfer");
    assert.strictEqual(tour.itinerary[1].location, "Agra");
  });

  test("does not use fallback date 2025-10-01 and flags missing arrival serial as date ambiguity", () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      [undefined, undefined, undefined, undefined, undefined, undefined],
      [undefined, undefined, undefined, undefined, undefined, undefined],
      [undefined, "SH2", 9999999, "", "TANAKA SAN X01", "", ""],
      [undefined, undefined, undefined, undefined, "", undefined, undefined],
      [undefined, undefined, undefined, undefined, "", undefined, undefined],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "TEST-SHEET");
    const wbBuf = XLSX.write(wb, { type: "buffer", bookType: "xls" });
    const result = parseExcelWorkbook(wbBuf);

    assert.strictEqual(result.tours.length, 1);
    const tour = result.tours[0];
    assert.notStrictEqual(tour.arrivalDate, "2025-10-01");
    assert.strictEqual(tour.hasDateAmbiguity, true);
    assert.ok(tour.dateAmbiguityReason?.includes("Missing arrival date"));
  });

  test("inferCircuitDestination returns unverified circuit instead of assuming default highlights", () => {
    const unverified = inferCircuitDestination([], "");
    assert.strictEqual(unverified, "Custom Circuit (Pending Itinerary Verification)");
    assert.notStrictEqual(unverified, "North India Highlights Circuit");
  });
});

describe("Excel Parser — Actual Operational Workbook Verification", () => {
  const workbookPath = path.resolve(process.cwd(), "data/source/NEW CHART 2025-2026 (1).xls");
  const workbookExists = fs.existsSync(workbookPath);

  test("parses real SATF operations workbook faithfully if staged locally", (t) => {
    if (!workbookExists) {
      t.skip("Workbook file not present at data/source/NEW CHART 2025-2026 (1).xls");
      return;
    }

    const buf = fs.readFileSync(workbookPath);
    const result = parseExcelWorkbook(buf);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.summary.totalSheetsFound, 91);
    assert.strictEqual(result.summary.operationalSheetsCount, 89);
    assert.strictEqual(result.summary.excludedSheetsCount, 2);
    assert.ok(result.summary.totalTourBlocks >= 1700);
    assert.ok(result.summary.canonicalToursCount >= 1700);
    assert.ok(result.summary.correctedDatesCount! > 0);
    assert.strictEqual(result.summary.dateAmbiguityCount, 0);
    assert.ok(result.summary.spanningToursCount > 0);

    // Verify booking reference 1253572
    const sample = result.tours.find((t) => t.bookingReference === "1253572");
    assert.ok(sample);
    assert.strictEqual(sample.agency, "SH2");
    assert.strictEqual(sample.group.adultCount, 2);
    assert.strictEqual(sample.sourceSheet, "OCT 2025");
    assert.strictEqual(sample.arrivalDate, "2025-10-03");

    // Verify booking reference 1253602 was reconciled per Rule SHEET_TEMPLATE_YEAR_RECONCILIATION
    const reconciled = result.tours.find((t) => t.bookingReference === "1253602");
    assert.ok(reconciled);
    assert.strictEqual(reconciled.arrivalDate, "2026-01-01");
    assert.strictEqual(reconciled.originalArrivalDate, "2025-01-01");
    assert.strictEqual(reconciled.rawArrivalSerial, 45658);
    assert.ok(reconciled.dateCorrectionReason?.includes("SHEET_TEMPLATE_YEAR_RECONCILIATION"));

    // Verify shifted historical sheets DEC-17 and JAN-18 parsed without drops
    const dec17Tour = result.tours.find((t) => t.sourceSheet === "DEC-17");
    assert.ok(dec17Tour, "DEC-17 shifted sheet must contain parsed tours");
    const jan18Tour = result.tours.find((t) => t.sourceSheet === "JAN-18");
    assert.ok(jan18Tour, "JAN-18 shifted sheet must contain parsed tours");

    // Verify season groups cover full 10-year span (2015-2016 through 2025-2026)
    assert.ok(result.summary.seasons && result.summary.seasons.length >= 8);
    assert.ok(result.summary.seasons.some((s) => s.season === "2015-2016" || s.season === "2016-2017"));
    assert.ok(result.summary.seasons.some((s) => s.season === "2025-2026"));
  });
});

describe("Coordinator Field Preservation & Re-import Safety", () => {
  test("re-import preserves manually entered driver name, phone, vehicle plate, hotel confirmations, notes and issues", () => {
    // Existing tour in database with coordinator assignments
    const existingTour: Tour = {
      id: "satf-1253572",
      bookingReference: "1253572",
      status: "upcoming",
      destination: "Golden Triangle Circuit",
      arrivalDate: "2025-10-01",
      departureDate: "2025-10-06",
      group: {
        id: "grp-1",
        groupName: "KURASHIMA YUKA MS",
        adultCount: 2,
        childCount: 0,
        nationality: "Japanese",
        language: "Japanese",
      },
      flights: [],
      hotels: [
        {
          id: "htl-1",
          hotelName: "AAVAAS",
          city: "Delhi",
          checkIn: "2025-10-01",
          checkOut: "2025-10-03",
          roomType: "twin",
          roomCount: 1,
          confirmationNumber: "MANUAL-CNF-9988",
          notes: "Late check-in requested",
        },
      ],
      itinerary: [],
      assignments: [
        {
          id: "asn-guide-1",
          role: "guide",
          status: "assigned",
          name: "MANGE RAM",
          reference: "GD-MANGERAM",
          contact: "+91 98111 22334",
        },
        {
          id: "asn-driver-1",
          role: "driver",
          status: "assigned",
          name: "RAMESH KUMAR",
          reference: "DRV-RAMESH",
          contact: "+91 98765 43210",
          notes: "Speaks conversational Japanese",
        },
        {
          id: "asn-veh-1",
          role: "vehicle",
          status: "assigned",
          reference: "DL 1Y A 4321",
          vehicleType: "Innova",
          notes: "Commercial yellow plate verified",
        },
      ],
      specialRequests: [],
      issues: [
        {
          id: "iss-1",
          category: "vehicle",
          description: "Flat tyre reported on highway",
          resolved: true,
          resolvedAt: "2025-10-02T10:00:00Z",
          resolutionNotes: "Spare tyre mounted; vehicle reached safely.",
        },
      ],
      operationalNotes: "Coordinator note: VIP client from Tokyo head office.",
      lastUpdated: "2025-10-02T12:00:00Z",
    };

    // Incoming updated tour from newly uploaded Excel sheet (contains updated itinerary, but NO driver or plate)
    const incomingTour: Tour = {
      id: "satf-1253572",
      bookingReference: "1253572",
      status: "upcoming",
      destination: "Golden Triangle Circuit",
      arrivalDate: "2025-10-01",
      departureDate: "2025-10-07", // Extended by 1 day
      group: {
        id: "grp-1",
        groupName: "KURASHIMA YUKA MS",
        adultCount: 2,
        childCount: 0,
        nationality: "Japanese",
        language: "Japanese",
      },
      flights: [],
      hotels: [
        {
          id: "htl-new",
          hotelName: "AAVAAS",
          city: "Delhi",
          checkIn: "2025-10-01",
          checkOut: "2025-10-04",
          roomType: "twin",
          roomCount: 1,
        },
      ],
      itinerary: [
        {
          id: "itn-1",
          date: "2025-10-01",
          type: "arrival_transfer",
          title: "ARR NH827 TRF H- AAVAAS",
        },
      ],
      assignments: [
        {
          id: "asn-incoming-guide",
          role: "guide",
          status: "assigned",
          name: "MANGE RAM",
        },
      ],
      specialRequests: [],
      lastUpdated: "2025-10-03T00:00:00Z",
    };

    const merged = mergeCoordinatorFields(incomingTour, existingTour);

    // 1. Assert updated departure date from Excel is applied
    assert.strictEqual(merged.departureDate, "2025-10-07");

    // 2. Assert coordinator-assigned driver and phone are PRESERVED 100%
    const driver = merged.assignments.find((a) => a.role === "driver");
    assert.ok(driver, "Driver assignment must not be lost");
    assert.strictEqual(driver.name, "RAMESH KUMAR");
    assert.strictEqual(driver.contact, "+91 98765 43210");
    assert.strictEqual(driver.notes, "Speaks conversational Japanese");

    // 3. Assert vehicle registration plate is PRESERVED
    const vehicle = merged.assignments.find((a) => a.role === "vehicle");
    assert.ok(vehicle, "Vehicle assignment must not be lost");
    assert.strictEqual(vehicle.reference, "DL 1Y A 4321");

    // 4. Assert hotel confirmation number is PRESERVED
    assert.strictEqual(merged.hotels[0].confirmationNumber, "MANUAL-CNF-9988");
    assert.strictEqual(merged.hotels[0].notes, "Late check-in requested");

    // 5. Assert coordinator issues and resolutions are PRESERVED
    assert.strictEqual(merged.issues?.length, 1);
    assert.strictEqual(merged.issues?.[0].resolved, true);
    assert.strictEqual(merged.issues?.[0].resolutionNotes, "Spare tyre mounted; vehicle reached safely.");

    // 6. Assert coordinator notes are PRESERVED
    assert.strictEqual(merged.operationalNotes, "Coordinator note: VIP client from Tokyo head office.");
  });

  test("compareIncomingWithExisting identifies inserts, updates, skips, and conflicts without mutating data", () => {
    const existing: Tour[] = [
      {
        id: "satf-100",
        bookingReference: "100",
        status: "upcoming",
        destination: "Route A",
        arrivalDate: "2025-10-01",
        departureDate: "2025-10-05",
        group: { id: "g1", groupName: "TANAKA SAN", adultCount: 2, childCount: 0, nationality: "JP", language: "JP" },
        flights: [],
        hotels: [{ id: "h1", hotelName: "Hotel 1", city: "Delhi", checkIn: "2025-10-01", checkOut: "2025-10-05", roomType: "twin", roomCount: 1 }],
        itinerary: [],
        assignments: [],
        specialRequests: [],
        lastUpdated: "2025-10-01T00:00:00Z",
      },
    ];

    const incoming: Tour[] = [
      // Identical tour -> should skip
      {
        id: "satf-100",
        bookingReference: "100",
        status: "upcoming",
        destination: "Route A",
        arrivalDate: "2025-10-01",
        departureDate: "2025-10-05",
        group: { id: "g1", groupName: "TANAKA SAN", adultCount: 2, childCount: 0, nationality: "JP", language: "JP" },
        flights: [],
        hotels: [{ id: "h1", hotelName: "Hotel 1", city: "Delhi", checkIn: "2025-10-01", checkOut: "2025-10-05", roomType: "twin", roomCount: 1 }],
        itinerary: [],
        assignments: [],
        specialRequests: [],
        lastUpdated: "2025-10-01T00:00:00Z",
      },
      // New tour -> should insert
      {
        id: "satf-200",
        bookingReference: "200",
        status: "upcoming",
        destination: "Route B",
        arrivalDate: "2025-11-01",
        departureDate: "2025-11-05",
        group: { id: "g2", groupName: "SUZUKI SAN", adultCount: 1, childCount: 0, nationality: "JP", language: "JP" },
        flights: [],
        hotels: [],
        itinerary: [],
        assignments: [],
        specialRequests: [],
        lastUpdated: "2025-11-01T00:00:00Z",
      },
    ];

    const comp = compareIncomingWithExisting(incoming, existing, "canonical_store");
    assert.strictEqual(comp.wouldSkipCount, 1);
    assert.strictEqual(comp.wouldInsertCount, 1);
    assert.strictEqual(comp.wouldUpdateCount, 0);
    assert.strictEqual(comp.flaggedConflictCount, 0);
    assert.strictEqual(comp.details[0].action, "skip");
    assert.strictEqual(comp.details[1].action, "insert");
  });
});

describe("Traveller Privacy & Name Masking", () => {
  test("maskGuestName redacts traveller personal names in logs and previews", () => {
    assert.strictEqual(maskGuestName("MATSUZAWA RIO MS X03"), "M**** R** MS (X03)");
    assert.strictEqual(maskGuestName("KURASHIMA YUKA MS X02"), "K**** Y*** MS (X02)");
    assert.strictEqual(maskGuestName("TAKEMURA TAKAKO MS X1"), "T**** T**** MS (X1)");
    assert.strictEqual(maskGuestName(""), "Valued Guest");
    assert.strictEqual(maskGuestName(undefined), "Valued Guest");
  });
});

describe("Duplicate Booking References, Stable Identity & Persistence Compatibility", () => {
  test("preserves distinct IDs and separate identities for tours sharing identical booking reference", () => {
    const rawTour1: Tour = {
      id: "satf-1222824-oct-23-r21",
      bookingReference: "1222824",
      sourceRecordId: "OCT 23:R21:1222824",
      sourceSheet: "OCT 23",
      sourceRow: 21,
      status: "upcoming",
      destination: "Delhi-Agra",
      arrivalDate: "2023-10-15",
      departureDate: "2023-10-19",
      group: { id: "g1", groupName: "KIGOSHI SHINICHIRO MR", adultCount: 1, childCount: 0, nationality: "Japanese", language: "Japanese" },
      flights: [],
      hotels: [],
      itinerary: [],
      assignments: [],
      specialRequests: [],
      lastUpdated: "2023-10-15T00:00:00Z",
    };

    const rawTour2: Tour = {
      id: "satf-1222824-oct-23-r24",
      bookingReference: "1222824",
      sourceRecordId: "OCT 23:R24:1222824",
      sourceSheet: "OCT 23",
      sourceRow: 24,
      status: "upcoming",
      destination: "Delhi-Jaipur",
      arrivalDate: "2023-10-18",
      departureDate: "2023-10-22",
      group: { id: "g2", groupName: "HIRAOKA SATOKO MS", adultCount: 2, childCount: 0, nationality: "Japanese", language: "Japanese" },
      flights: [],
      hotels: [],
      itinerary: [],
      assignments: [],
      specialRequests: [],
      lastUpdated: "2023-10-18T00:00:00Z",
    };

    // 1. Both tours share the identical bookingReference
    assert.strictEqual(rawTour1.bookingReference, rawTour2.bookingReference);

    // 2. Both tours have distinct primary IDs and distinct sourceRecordIds
    assert.notStrictEqual(rawTour1.id, rawTour2.id);
    assert.notStrictEqual(rawTour1.sourceRecordId, rawTour2.sourceRecordId);
    assert.notStrictEqual(rawTour1.sourceRow, rawTour2.sourceRow);
    assert.notStrictEqual(rawTour1.group.groupName, rawTour2.group.groupName);

    // 3. Map keyed by tour.id maintains both tours without collision
    const tourMapById = new Map<string, Tour>([
      [rawTour1.id, rawTour1],
      [rawTour2.id, rawTour2],
    ]);
    assert.strictEqual(tourMapById.size, 2);
    assert.strictEqual(tourMapById.get("satf-1222824-oct-23-r21")?.group.groupName, "KIGOSHI SHINICHIRO MR");
    assert.strictEqual(tourMapById.get("satf-1222824-oct-23-r24")?.group.groupName, "HIRAOKA SATOKO MS");
  });

  test("mergeCoordinatorFields accurately targets distinct tours sharing the same reference", () => {
    const existingTour: Tour = {
      id: "satf-1222824-oct-23-r21",
      bookingReference: "1222824",
      sourceRecordId: "OCT 23:R21:1222824",
      status: "upcoming",
      destination: "Delhi-Agra",
      arrivalDate: "2023-10-15",
      departureDate: "2023-10-19",
      group: { id: "g1", groupName: "KIGOSHI SHINICHIRO MR", adultCount: 1, childCount: 0, nationality: "Japanese", language: "Japanese" },
      flights: [],
      hotels: [],
      itinerary: [],
      assignments: [
        {
          id: "as-guide",
          role: "guide",
          status: "assigned",
          name: "Ramesh Sharma",
          contact: "+91-9876543210",
        },
        {
          id: "as-driver",
          role: "driver",
          status: "assigned",
          name: "Suresh Kumar",
          reference: "DL-1V-9999",
        },
      ],
      specialRequests: [],
      operationalNotes: "Coordinator: Vegetarian meal confirmed.",
      lastUpdated: "2023-10-15T10:00:00Z",
    };

    const incomingReimport: Tour = {
      id: "satf-1222824-oct-23-r21",
      bookingReference: "1222824",
      sourceRecordId: "OCT 23:R21:1222824",
      status: "upcoming",
      destination: "Delhi-Agra",
      arrivalDate: "2023-10-15",
      departureDate: "2023-10-19",
      group: { id: "g1", groupName: "KIGOSHI SHINICHIRO MR", adultCount: 1, childCount: 0, nationality: "Japanese", language: "Japanese" },
      flights: [],
      hotels: [],
      itinerary: [],
      assignments: [
        { id: "raw-guide", role: "guide", status: "pending" },
      ],
      specialRequests: [],
      operationalNotes: undefined,
      lastUpdated: "2023-10-15T00:00:00Z",
    };

    const merged = mergeCoordinatorFields(incomingReimport, existingTour);
    assert.strictEqual(merged.id, "satf-1222824-oct-23-r21");
    assert.strictEqual(merged.operationalNotes, "Coordinator: Vegetarian meal confirmed.");

    const guide = merged.assignments.find((a) => a.role === "guide");
    assert.strictEqual(guide?.status, "assigned");
    assert.strictEqual(guide?.name, "Ramesh Sharma");

    const driver = merged.assignments.find((a) => a.role === "driver");
    assert.strictEqual(driver?.name, "Suresh Kumar");
    assert.strictEqual(driver?.reference, "DL-1V-9999");
  });

  test("enriched parser fields (trainJourneys, date correction, cancellation indicators) maintain full fidelity", () => {
    const tourWithEnrichedFields: Tour = {
      id: "satf-1250001",
      bookingReference: "1250001",
      sourceRecordId: "FEB 2026:R15:1250001",
      sourceSheet: "FEB 2026",
      sourceRow: 15,
      status: "upcoming",
      destination: "Delhi-Agra",
      arrivalDate: "2026-02-10",
      departureDate: "2026-02-15",
      originalArrivalDate: "2025-02-10",
      dateCorrectionReason: "Reconciled 1-year template offset per Rule SHEET_TEMPLATE_YEAR_RECONCILIATION",
      hasCancellationIndicator: true,
      cancellationIndicatorReason: "Possible cancellation indicated by keyword 'CNCL' in source notes.",
      trainJourneys: [
        {
          id: "tj-1",
          trainName: "Gatimaan Express",
          trainNumber: "12050",
          travelClass: "CC",
          pnr: "2456789012",
          fromStation: "NZM",
          toStation: "AGC",
          date: "2026-02-11",
          rawText: "GATIMAAN EXP 12050 CC PNR 2456789012",
        },
      ],
      group: { id: "g1", groupName: "TEST GUEST", adultCount: 2, childCount: 0, nationality: "Japanese", language: "Japanese" },
      flights: [],
      hotels: [],
      itinerary: [],
      assignments: [],
      specialRequests: [],
      lastUpdated: "2026-02-10T00:00:00Z",
    };

    // Verify all fields are present on the Tour entity
    assert.strictEqual(tourWithEnrichedFields.trainJourneys?.length, 1);
    assert.strictEqual(tourWithEnrichedFields.trainJourneys?.[0].trainName, "Gatimaan Express");
    assert.strictEqual(tourWithEnrichedFields.trainJourneys?.[0].trainNumber, "12050");
    assert.strictEqual(tourWithEnrichedFields.originalArrivalDate, "2025-02-10");
    assert.strictEqual(tourWithEnrichedFields.dateCorrectionReason?.includes("SHEET_TEMPLATE_YEAR_RECONCILIATION"), true);
    assert.strictEqual(tourWithEnrichedFields.hasCancellationIndicator, true);
    assert.strictEqual(tourWithEnrichedFields.cancellationIndicatorReason?.includes("CNCL"), true);
    assert.strictEqual(tourWithEnrichedFields.sourceRecordId, "FEB 2026:R15:1250001");
  });

  test(": tourToRow and rowToTour round-trip preserves all  fields via provenance JSONB", () => {
    const originalTour: Tour = {
      id: "satf-1250001-feb-2026-r15",
      bookingReference: "1250001",
      sourceRecordId: "FEB 2026:R15:1250001",
      sourceSheet: "FEB 2026",
      sourceRow: 15,
      sourceSheets: ["FEB 2026", "MAR 2026"],
      status: "upcoming",
      destination: "Delhi-Agra-Jaipur",
      arrivalDate: "2026-02-10",
      departureDate: "2026-02-15",
      rawArrivalSerial: 46063,
      originalArrivalDate: "2025-02-10",
      dateCorrectionReason: "Reconciled 1-year template offset per Rule SHEET_TEMPLATE_YEAR_RECONCILIATION",
      hasCancellationIndicator: true,
      cancellationIndicatorReason: "Contains CNCL in notes",
      hasDateAmbiguity: false,
      dateAmbiguityReason: undefined,
      agency: "SH2",
      packageCode: "IN-TU01-NB",
      operationalNotes: "Coordinator note: VIP guests",
      trainJourneys: [
        {
          id: "tj-101",
          trainName: "Gatimaan Exp",
          trainNumber: "12050",
          travelClass: "CC",
          pnr: "2456789012",
          fromStation: "NZM",
          toStation: "AGC",
          date: "2026-02-11",
          rawText: "GATIMAAN EXP 12050 CC PNR 2456789012",
        },
      ],
      group: {
        id: "g1",
        groupName: "YAMADA TARO MR",
        adultCount: 2,
        childCount: 0,
        nationality: "Japanese",
        language: "Japanese",
      },
      flights: [
        {
          id: "fl-1",
          direction: "arrival",
          flightNumber: "JL-39",
          airline: "Japan Airlines",
          date: "2026-02-10",
          departureTime: "10:00",
          arrivalTime: "16:00",
          origin: "HND",
          destination: "DEL",
        },
      ],
      hotels: [
        {
          id: "ht-1",
          hotelName: "TAJ PALACE",
          city: "Delhi",
          checkIn: "2026-02-10",
          checkOut: "2026-02-12",
          roomType: "double",
          roomCount: 1,
          confirmationNumber: "CONF-9988",
        },
      ],
      itinerary: [],
      assignments: [
        {
          id: "as-1",
          role: "guide",
          status: "assigned",
          name: "Ramesh Sharma",
        },
      ],
      specialRequests: [],
      isImported: true,
      lastUpdated: "2026-02-10T12:00:00.000Z",
    };

    // Serialize to PostgreSQL row
    const row = tourToRow(originalTour);
    assert.strictEqual(row.id, "satf-1250001-feb-2026-r15");
    assert.strictEqual(row.booking_reference, "1250001");
    assert.strictEqual(row.source_record_id, "FEB 2026:R15:1250001");
    assert.ok(row.provenance && typeof row.provenance === "object");

    // Deserialize back from PostgreSQL row
    const roundTripped = rowToTour(row);
    assert.strictEqual(roundTripped.id, originalTour.id);
    assert.strictEqual(roundTripped.bookingReference, originalTour.bookingReference);
    assert.strictEqual(roundTripped.sourceRecordId, originalTour.sourceRecordId);
    assert.strictEqual(roundTripped.arrivalDate, originalTour.arrivalDate);
    assert.strictEqual(roundTripped.originalArrivalDate, originalTour.originalArrivalDate);
    assert.strictEqual(roundTripped.dateCorrectionReason, originalTour.dateCorrectionReason);
    assert.strictEqual(roundTripped.hasCancellationIndicator, true);
    assert.strictEqual(roundTripped.cancellationIndicatorReason, originalTour.cancellationIndicatorReason);
    assert.deepStrictEqual(roundTripped.sourceSheets, ["FEB 2026", "MAR 2026"]);
    assert.strictEqual(roundTripped.rawArrivalSerial, 46063);
    assert.strictEqual(roundTripped.trainJourneys?.length, 1);
    assert.strictEqual(roundTripped.trainJourneys?.[0].trainNumber, "12050");
    assert.strictEqual(roundTripped.operationalNotes, originalTour.operationalNotes);
    assert.strictEqual(roundTripped.assignments?.[0].name, "Ramesh Sharma");
  });

  test(": getCanonicalTourById prioritizes exact ID and sourceRecordId over bookingReference", () => {
    // Set up a mock canonical dataset with two distinct tours sharing the same booking reference
    const tour1: Tour = {
      id: "satf-1253601-oct-23-r21",
      bookingReference: "1253601",
      sourceRecordId: "OCT 23:R21:1253601",
      sourceSheet: "OCT 23",
      sourceRow: 21,
      status: "upcoming",
      destination: "Delhi-Agra",
      arrivalDate: "2023-10-15",
      departureDate: "2023-10-19",
      group: { id: "g1", groupName: "GUEST A", adultCount: 1, childCount: 0, nationality: "Japanese", language: "Japanese" },
      flights: [],
      hotels: [],
      itinerary: [],
      assignments: [],
      specialRequests: [],
      lastUpdated: "2023-10-15T00:00:00Z",
    };

    const tour2: Tour = {
      id: "satf-1253601-nov-23-r15",
      bookingReference: "1253601",
      sourceRecordId: "NOV 23:R15:1253601",
      sourceSheet: "NOV 23",
      sourceRow: 15,
      status: "upcoming",
      destination: "Jaipur-Delhi",
      arrivalDate: "2023-11-20",
      departureDate: "2023-11-24",
      group: { id: "g2", groupName: "GUEST B", adultCount: 2, childCount: 0, nationality: "Japanese", language: "Japanese" },
      flights: [],
      hotels: [],
      itinerary: [],
      assignments: [],
      specialRequests: [],
      lastUpdated: "2023-11-20T00:00:00Z",
    };

    saveCanonicalDataset(
      {
        success: true,
        summary: {
          workbookName: "test.xls",
          importTimestamp: "2026-10-19T12:00:00.000Z",
          totalTourBlocks: 2,
          canonicalToursCount: 2,
          totalSheetsFound: 1,
          operationalSheetsCount: 1,
          excludedSheetsCount: 0,
          spanningToursCount: 0,
          amendedToursCount: 0,
          duplicateRowsCount: 0,
          unassignedGuidesCount: 0,
          sheetsSummary: [],
          preservedDistinctCount: 1,
          correctedDatesCount: 0,
          dateAmbiguityCount: 0,
          possibleCancellationsCount: 0,
          seasons: [
            {
              season: "2023-2024",
              tourCount: 2,
              sheetsCount: 1,
            },
          ],
        },
        tours: [tour1, tour2],
        ambiguities: [],
        duplicates: [],
        errors: [],
      },
      "operational"
    );

    // 1. Exact ID match gets the second tour specifically
    const byId2 = getCanonicalTourById("satf-1253601-nov-23-r15");
    assert.ok(byId2);
    assert.strictEqual(byId2?.id, "satf-1253601-nov-23-r15");
    assert.strictEqual(byId2?.sourceRecordId, "NOV 23:R15:1253601");

    // 2. Exact sourceRecordId match gets the first tour specifically
    const bySource1 = getCanonicalTourById("OCT 23:R21:1253601");
    assert.ok(bySource1);
    assert.strictEqual(bySource1?.id, "satf-1253601-oct-23-r21");

    // 3. getCanonicalToursByRef returns both distinct tours sharing ref '1253601'
    const allMatches = getCanonicalToursByRef("1253601");
    assert.strictEqual(allMatches.length, 2);
    assert.strictEqual(allMatches[0].bookingReference, "1253601");
    assert.strictEqual(allMatches[1].bookingReference, "1253601");

    clearCanonicalDataset();
  });

  test(": compareIncomingWithExisting matches by exact id and sourceRecordId without false conflicts", () => {
    const existingTourA: Tour = {
      id: "satf-1222824-oct-23-r21",
      bookingReference: "1222824",
      sourceRecordId: "OCT 23:R21:1222824",
      sourceSheet: "OCT 23",
      sourceRow: 21,
      status: "upcoming",
      destination: "Delhi-Agra",
      arrivalDate: "2023-10-15",
      departureDate: "2023-10-19",
      group: { id: "g1", groupName: "GUEST ONE", adultCount: 1, childCount: 0, nationality: "Japanese", language: "Japanese" },
      flights: [],
      hotels: [],
      itinerary: [],
      assignments: [{ id: "a1", role: "guide", status: "assigned", name: "Coordinator Guide A" }],
      specialRequests: [],
      operationalNotes: "Special note for Tour A",
      lastUpdated: "2023-10-15T00:00:00Z",
    };

    const existingTourB: Tour = {
      id: "satf-1222824-nov-23-r12",
      bookingReference: "1222824",
      sourceRecordId: "NOV 23:R12:1222824",
      sourceSheet: "NOV 23",
      sourceRow: 12,
      status: "upcoming",
      destination: "Jaipur-Delhi",
      arrivalDate: "2023-11-20",
      departureDate: "2023-11-24",
      group: { id: "g2", groupName: "GUEST TWO", adultCount: 2, childCount: 0, nationality: "Japanese", language: "Japanese" },
      flights: [],
      hotels: [],
      itinerary: [],
      assignments: [{ id: "a2", role: "driver", status: "assigned", name: "Coordinator Driver B" }],
      specialRequests: [],
      operationalNotes: "Special note for Tour B",
      lastUpdated: "2023-11-20T00:00:00Z",
    };

    const existingList = [existingTourA, existingTourB];

    // Incoming re-import of Tour A with fresh parsed rows (different arrival date to trigger update)
    const incomingTourA: Tour = {
      ...existingTourA,
      arrivalDate: "2023-10-16",
      assignments: [{ id: "a-raw", role: "guide", status: "pending" }],
      operationalNotes: undefined,
    };

    const comparison = compareIncomingWithExisting([incomingTourA], existingList);
    assert.strictEqual(comparison.wouldUpdateCount, 1);
    assert.strictEqual(comparison.flaggedConflictCount, 0);
    assert.strictEqual(comparison.details.length, 1);
    assert.strictEqual(comparison.details[0].action, "update");
    assert.strictEqual(comparison.details[0].bookingReference, "1222824");
    assert.strictEqual(comparison.details[0].sourceRecordId, "OCT 23:R21:1222824");

    // Coordinator preservation verified
    const merged = mergeCoordinatorFields(incomingTourA, existingTourA);
    const mergedGuide = merged.assignments.find((a) => a.role === "guide");
    assert.strictEqual(mergedGuide?.name, "Coordinator Guide A");
  });

  test(": validateNewTourForm enforces or permits duplicate booking reference based on allowDuplicateReference flag", () => {
    const existingReferences = ["999901", "1253601"];

    // 1. Without allowDuplicateReference: throws validation error
    const invalidResult = validateNewTourForm(
      {
        bookingReference: "999901",
        groupName: "NEW GUEST GROUP",
        adultCount: 2,
        nationality: "Japanese",
        language: "Japanese",
        arrivalDate: "2026-04-01",
        departureDate: "2026-04-05",
        destination: "Jaipur",
      },
      existingReferences
    );
    assert.strictEqual(invalidResult.isValid, false);
    assert.ok(invalidResult.errors.bookingReference?.includes("already in use"));

    // 2. With allowDuplicateReference: validation passes
    const validResult = validateNewTourForm(
      {
        bookingReference: "999901",
        groupName: "NEW GUEST GROUP",
        adultCount: 2,
        nationality: "Japanese",
        language: "Japanese",
        arrivalDate: "2026-04-01",
        departureDate: "2026-04-05",
        destination: "Jaipur",
        allowDuplicateReference: true,
        sourceRecordId: "MANUAL:999901:2",
      },
      existingReferences
    );
    assert.strictEqual(validResult.isValid, true);
    assert.strictEqual(Object.keys(validResult.errors).length, 0);

    // 3. createNewTour generates unique ID and retains sourceRecordId
    const created = createNewTour({
      bookingReference: "999901",
      groupName: "NEW GUEST GROUP",
      adultCount: 2,
      nationality: "Japanese",
      language: "Japanese",
      arrivalDate: "2026-04-01",
      departureDate: "2026-04-05",
      destination: "Jaipur",
      allowDuplicateReference: true,
      sourceRecordId: "MANUAL:999901:2",
    });
    assert.strictEqual(created.bookingReference, "999901");
    assert.strictEqual(created.sourceRecordId, "MANUAL:999901:2");
    assert.ok(created.id.startsWith("tour-"));
  });

  test(" Regression: legacy update without sourceRecordId preserves existing sourceRecordId and provenance", () => {
    const existingTour: Tour = {
      id: "satf-1222824-oct-23-r21",
      bookingReference: "1222824",
      sourceRecordId: "OCT 23:R21:1222824",
      sourceSheet: "OCT 23",
      sourceRow: 21,
      status: "upcoming",
      destination: "Delhi-Agra",
      arrivalDate: "2023-10-15",
      departureDate: "2023-10-19",
      originalArrivalDate: "2023-10-14",
      dateCorrectionReason: "Reconciled date per operational rule",
      hasCancellationIndicator: true,
      cancellationIndicatorReason: "Contains CNCL in notes",
      trainJourneys: [
        {
          id: "tj-99",
          trainName: "Shatabdi Express",
          trainNumber: "12002",
          travelClass: "CC",
          fromStation: "NDLS",
          toStation: "AGC",
          date: "2023-10-16",
          rawText: "SHATABDI EXP 12002 CC",
        },
      ],
      group: { id: "g1", groupName: "TANAKA MR", adultCount: 2, childCount: 0, nationality: "Japanese", language: "Japanese" },
      flights: [],
      hotels: [
        {
          id: "ht-1",
          hotelName: "TAJ VIEW",
          city: "Agra",
          checkIn: "2023-10-15",
          checkOut: "2023-10-17",
          roomType: "double",
          roomCount: 1,
          confirmationNumber: "CONF-AGRA-101",
        },
      ],
      itinerary: [],
      assignments: [
        { id: "as-1", role: "guide", status: "assigned", name: "Sunil Verma", contact: "+91-9876500000" },
        { id: "as-2", role: "driver", status: "assigned", name: "Rajesh Kumar", reference: "DL-1V-1234" },
      ],
      specialRequests: [{ id: "sr-1", category: "dietary", description: "Strict vegetarian", resolved: false }],
      operationalNotes: "Coordinator: Confirmed special welcome garland.",
      lastUpdated: "2023-10-15T00:00:00Z",
    };

    // Incoming legacy update that omits sourceRecordId and provenance fields
    const legacyUpdate: Tour = {
      id: "satf-1222824-oct-23-r21",
      bookingReference: "1222824",
      // sourceRecordId explicitly omitted / undefined in legacy payload
      sourceRecordId: undefined,
      status: "upcoming",
      destination: "Delhi-Agra",
      arrivalDate: "2023-10-15",
      departureDate: "2023-10-19",
      group: { id: "g1", groupName: "TANAKA MR", adultCount: 2, childCount: 0, nationality: "Japanese", language: "Japanese" },
      flights: [],
      hotels: [],
      itinerary: [],
      assignments: [
        { id: "raw-guide", role: "guide", status: "pending" },
      ],
      specialRequests: [],
      lastUpdated: "2023-10-15T12:00:00Z",
    };

    // Merging coordinator fields must preserve source identity and existing coordinator overrides
    const merged = mergeCoordinatorFields(legacyUpdate, existingTour);
    assert.strictEqual(merged.id, "satf-1222824-oct-23-r21");
    assert.strictEqual(merged.bookingReference, "1222824");
    assert.strictEqual(merged.sourceRecordId, "OCT 23:R21:1222824", "Must preserve existing sourceRecordId");
    assert.strictEqual(merged.trainJourneys?.length, 1, "Must preserve existing trainJourneys");
    assert.strictEqual(merged.trainJourneys?.[0].trainNumber, "12002");
    assert.strictEqual(merged.dateCorrectionReason, "Reconciled date per operational rule");
    assert.strictEqual(merged.hasCancellationIndicator, true);
    assert.strictEqual(merged.operationalNotes, "Coordinator: Confirmed special welcome garland.");

    // Coordinator assignments preserved
    const guide = merged.assignments.find((a) => a.role === "guide");
    assert.strictEqual(guide?.name, "Sunil Verma");
    assert.strictEqual(guide?.status, "assigned");

    const driver = merged.assignments.find((a) => a.role === "driver");
    assert.strictEqual(driver?.name, "Rajesh Kumar");

    // Hotel confirmation preserved
    assert.strictEqual(merged.hotels[0]?.confirmationNumber, "CONF-AGRA-101");
  });

  test(" Regression: migration script phase25_repeat_reference_safe.sql syntax and safety verification", () => {
    const migrationPath = path.join(__dirname, "..", "supabase", "phase25_repeat_reference_safe.sql");
    assert.ok(fs.existsSync(migrationPath), "Migration file phase25_repeat_reference_safe.sql must exist");

    const sqlContent = fs.readFileSync(migrationPath, "utf-8");

    // 1. Valid PostgreSQL dollar-quoting
    assert.ok(sqlContent.includes("AS $func$"), "Must use valid tagged dollar-quoting $func$");
    assert.ok(sqlContent.includes("$func$;"), "Must terminate with matching $func$;");

    // 2. Correct constraint name matching live schema
    assert.ok(
      sqlContent.includes("DROP CONSTRAINT IF EXISTS satf_operational_tours_booking_reference_key;"),
      "Must drop exact constraint satf_operational_tours_booking_reference_key"
    );

    // 3. Partial unique index on source_record_id for idempotent re-imports
    assert.ok(
      sqlContent.includes("CREATE UNIQUE INDEX IF NOT EXISTS idx_satf_tours_source_record_id"),
      "Must create partial unique index on source_record_id"
    );
    assert.ok(
      sqlContent.includes("WHERE source_record_id IS NOT NULL;"),
      "Unique index on source_record_id must be partial (WHERE source_record_id IS NOT NULL)"
    );

    // 4. Field-preserving update path: omitted source_record_id cannot erase existing value
    assert.ok(
      sqlContent.includes("NULLIF(p_tour->>'source_record_id', '')"),
      "Must check for non-empty source_record_id"
    );
    assert.ok(
      sqlContent.includes("source_record_id = v_source_record_id"),
      "Must update source_record_id using coalesced v_source_record_id"
    );

    // 5. Defensive optional property preservation
    assert.ok(sqlContent.includes("p_tour ? 'group_data'"), "Must check key existence for group_data");
    assert.ok(sqlContent.includes("p_tour ? 'agency'"), "Must check key existence for agency");
    assert.ok(sqlContent.includes("p_tour ? 'hotels'"), "Must check key existence for hotels");
    assert.ok(sqlContent.includes("p_tour ? 'assignments'"), "Must check key existence for assignments");
    assert.ok(sqlContent.includes("p_tour ? 'operational_notes'"), "Must check key existence for operational_notes");

    // 6. Security search_path lock
    assert.ok(
      sqlContent.includes("SET search_path = ''"),
      "Procedure must lock search_path to empty string"
    );

    // 7. Safe backfill and conflict de-duplication
    assert.ok(
      sqlContent.includes("SET source_record_id = NULLIF(trim(provenance->>'source_record_id'), '')"),
      "Must backfill source_record_id from provenance JSONB before index creation"
    );
    assert.ok(
      sqlContent.includes("WITH duplicate_sources AS ("),
      "Must de-duplicate conflicting source_record_id values prior to unique index creation"
    );
  });

  test(" Regression (Local): rowToTour backfills sourceRecordId from provenance when table column is null", () => {
    // Simulate legacy PostgreSQL row where source_record_id column is NULL,
    // but provenance JSONB contains source_record_id and enriched  fields
    const legacyRow: Record<string, unknown> = {
      id: "satf-1253601",
      booking_reference: "1253601",
      source_record_id: null, // Column is NULL before migration backfill
      group_data: { id: "g1", groupName: "YAMAMOTO MR", adultCount: 2, childCount: 0, nationality: "Japanese", language: "Japanese" },
      status: "upcoming",
      destination: "Delhi-Agra",
      arrival_date: "2026-01-05",
      departure_date: "2026-01-09",
      flights: [],
      hotels: [],
      itinerary: [],
      assignments: [],
      special_requests: [],
      issues: [],
      provenance: {
        source_record_id: "JAN 2026:R2:1253601",
        train_journeys: [
          {
            id: "tj-1",
            trainName: "Gatimaan Exp",
            trainNumber: "12050",
            travelClass: "CC",
            fromStation: "NZM",
            toStation: "AGC",
            date: "2026-01-06",
            rawText: "GATIMAAN EXP 12050",
          },
        ],
        original_arrival_date: "2025-01-05",
        date_correction_reason: "Reconciled template offset",
      },
      last_updated: "2026-01-05T00:00:00Z",
    };

    const tour = rowToTour(legacyRow);
    // Backfill verification: sourceRecordId is safely extracted from provenance JSONB
    assert.strictEqual(tour.sourceRecordId, "JAN 2026:R2:1253601");
    assert.strictEqual(tour.trainJourneys?.length, 1);
    assert.strictEqual(tour.trainJourneys?.[0].trainNumber, "12050");
    assert.strictEqual(tour.originalArrivalDate, "2025-01-05");
    assert.strictEqual(tour.dateCorrectionReason, "Reconciled template offset");

    // Re-serialization backfills both the column and the provenance container
    const serialized = tourToRow(tour);
    assert.strictEqual(serialized.source_record_id, "JAN 2026:R2:1253601");
  });

  test(" Regression (Local): compareIncomingWithExisting flags conflict when multiple existing records share booking reference without source identity", () => {
    // Two legacy existing tours sharing reference '1222824' (neither has sourceRecordId populated yet)
    const legacyTour1: Tour = {
      id: "satf-1222824-a",
      bookingReference: "1222824",
      status: "upcoming",
      destination: "Delhi",
      arrivalDate: "2023-10-15",
      departureDate: "2023-10-19",
      group: { id: "g1", groupName: "GUEST A", adultCount: 1, childCount: 0, nationality: "Japanese", language: "Japanese" },
      flights: [],
      hotels: [],
      itinerary: [],
      assignments: [],
      specialRequests: [],
      lastUpdated: "2023-10-15T00:00:00Z",
    };

    const legacyTour2: Tour = {
      id: "satf-1222824-b",
      bookingReference: "1222824",
      status: "upcoming",
      destination: "Jaipur",
      arrivalDate: "2023-11-20",
      departureDate: "2023-11-24",
      group: { id: "g2", groupName: "GUEST B", adultCount: 2, childCount: 0, nationality: "Japanese", language: "Japanese" },
      flights: [],
      hotels: [],
      itinerary: [],
      assignments: [],
      specialRequests: [],
      lastUpdated: "2023-11-20T00:00:00Z",
    };

    // Incoming tour with newly parsed sourceRecordId from workbook, but ID doesn't match legacy suffixes
    const incoming: Tour = {
      id: "satf-1222824-oct-23-r21",
      bookingReference: "1222824",
      sourceRecordId: "OCT 23:R21:1222824",
      sourceSheet: "OCT 23",
      sourceRow: 21,
      status: "upcoming",
      destination: "Delhi",
      arrivalDate: "2023-10-15",
      departureDate: "2023-10-19",
      group: { id: "g1", groupName: "GUEST A", adultCount: 1, childCount: 0, nationality: "Japanese", language: "Japanese" },
      flights: [],
      hotels: [],
      itinerary: [],
      assignments: [],
      specialRequests: [],
      lastUpdated: "2023-10-15T00:00:00Z",
    };

    // When multiple existing records share the reference without matching ID/source,
    // conflict detection must flag it rather than silently overwriting either record!
    const comparison = compareIncomingWithExisting([incoming], [legacyTour1, legacyTour2]);
    assert.strictEqual(comparison.flaggedConflictCount, 1);
    assert.strictEqual(comparison.wouldUpdateCount, 0);
    assert.strictEqual(comparison.details[0].action, "conflict");
    assert.ok(comparison.details[0].reason.includes("Multiple existing operational tours (2) share booking reference"));
  });

  test(" Regression (Local): legacy re-import matches single existing legacy record, updates it, and adopts sourceRecordId without duplication", () => {
    // Single existing legacy record: has id = 'satf-1253601', no sourceRecordId
    const legacyTour: Tour = {
      id: "satf-1253601",
      bookingReference: "1253601",
      sourceRecordId: undefined,
      status: "upcoming",
      destination: "Delhi-Agra",
      arrivalDate: "2026-01-05",
      departureDate: "2026-01-09",
      group: { id: "g1", groupName: "YAMADA TARO", adultCount: 2, childCount: 0, nationality: "Japanese", language: "Japanese" },
      flights: [],
      hotels: [
        {
          id: "ht-1",
          hotelName: "TAJ PALACE",
          city: "Delhi",
          checkIn: "2026-01-05",
          checkOut: "2026-01-07",
          roomType: "double",
          roomCount: 1,
          confirmationNumber: "CONF-TAJ-999",
        },
      ],
      itinerary: [],
      assignments: [
        { id: "as-1", role: "guide", status: "assigned", name: "Ramesh Sharma", contact: "+91-9876543210" },
      ],
      specialRequests: [],
      operationalNotes: "Coordinator note: Late check-in requested",
      lastUpdated: "2026-01-05T00:00:00Z",
    };

    // Incoming re-import of this tour from Excel workbook
    const incomingParsed: Tour = {
      id: "satf-1253601",
      bookingReference: "1253601",
      sourceRecordId: "JAN 2026:R2:1253601",
      sourceSheet: "JAN 2026",
      sourceRow: 2,
      status: "upcoming",
      destination: "Delhi-Agra",
      arrivalDate: "2026-01-05",
      departureDate: "2026-01-09",
      group: { id: "g1", groupName: "YAMADA TARO", adultCount: 2, childCount: 0, nationality: "Japanese", language: "Japanese" },
      flights: [],
      hotels: [],
      itinerary: [],
      assignments: [{ id: "raw", role: "guide", status: "pending" }],
      specialRequests: [],
      lastUpdated: "2026-01-05T10:00:00Z",
    };

    // 1. Comparison matches legacy tour and plans update (or skip), NOT insert
    const comparison = compareIncomingWithExisting([incomingParsed], [legacyTour]);
    assert.strictEqual(comparison.wouldInsertCount, 0, "Must NOT insert duplicate record");
    assert.strictEqual(comparison.wouldUpdateCount, 1, "Must update existing legacy record");
    assert.strictEqual(comparison.details[0].action, "update");
    assert.strictEqual(comparison.details[0].bookingReference, "1253601");

    // 2. mergeCoordinatorFields preserves coordinator fields and adopts sourceRecordId
    const merged = mergeCoordinatorFields(incomingParsed, legacyTour);
    assert.strictEqual(merged.id, "satf-1253601", "ID is preserved");
    assert.strictEqual(merged.sourceRecordId, "JAN 2026:R2:1253601", "Adopts sourceRecordId");
    assert.strictEqual(merged.sourceSheet, "JAN 2026");
    assert.strictEqual(merged.operationalNotes, "Coordinator note: Late check-in requested");
    assert.strictEqual(merged.assignments[0]?.name, "Ramesh Sharma", "Preserves guide assignment");
    assert.strictEqual(merged.hotels[0]?.confirmationNumber, "CONF-TAJ-999", "Preserves hotel confirmation");
  });
});

describe(" — Historical Date Ambiguity Reconciliation via Source Evidence", () => {
  test("resolveHistoricalDateCandidate parses shorthand formats with sheet context", () => {
    // Integer day 1..31
    assert.strictEqual(resolveHistoricalDateCandidate(3, 2017, 1), "2017-01-03");
    assert.strictEqual(resolveHistoricalDateCandidate(12, 2017, 1), "2017-01-12");
    assert.strictEqual(resolveHistoricalDateCandidate(31, 2017, 1), "2017-01-31");
    assert.strictEqual(resolveHistoricalDateCandidate("4", 2017, 1), "2017-01-04");

    // DDMon
    assert.strictEqual(resolveHistoricalDateCandidate("09AUG", 2023, 8), "2023-08-09");
    assert.strictEqual(resolveHistoricalDateCandidate("23AUG", 2023, 8), "2023-08-23");

    // DD-MM
    assert.strictEqual(resolveHistoricalDateCandidate("27-11", 2018, 11), "2018-11-27");
    assert.strictEqual(resolveHistoricalDateCandidate("29-11", 2018, 11), "2018-11-29");

    // M/D or MM/DD
    assert.strictEqual(resolveHistoricalDateCandidate(" 7/26", 2016, 7), "2016-07-26");
    assert.strictEqual(resolveHistoricalDateCandidate("7/26", 2016, 7), "2016-07-26");

    // Invalid formats return null
    assert.strictEqual(resolveHistoricalDateCandidate("not-a-date", 2017, 1), null);
    assert.strictEqual(resolveHistoricalDateCandidate(35, 2017, 1), null);
    assert.strictEqual(resolveHistoricalDateCandidate(0, 2017, 1), null);
    assert.strictEqual(resolveHistoricalDateCandidate(null, 2017, 1), null);
  });

  test("Historical date reconciliation preserves historical years and never rewrites to 2026", () => {
    const dates = [
      resolveHistoricalDateCandidate("09AUG", 2023, 8),
      resolveHistoricalDateCandidate("27-11", 2018, 11),
      resolveHistoricalDateCandidate(12, 2017, 1),
      resolveHistoricalDateCandidate(" 7/26", 2016, 7),
    ];
    for (const d of dates) {
      assert.ok(d, "Date must not be null");
      assert.ok(!d.startsWith("2026"), `Historical date ${d} must never be rewritten to 2026`);
    }
  });

  test("Real workbook reconciliation resolves all 24 historical dates with 0 remaining ambiguities", () => {
    const stagedPath = path.resolve(process.cwd(), "data/source/NEW CHART 2025-2026 (1).xls");
    if (!fs.existsSync(stagedPath)) return;

    const buffer = fs.readFileSync(stagedPath);
    const preview = parseExcelWorkbook(buffer);

    // Canonical tours total strictly preserved
    assert.strictEqual(preview.summary.canonicalToursCount, 1757);
    assert.strictEqual(preview.summary.totalTourBlocks, 1780);
    assert.strictEqual(preview.summary.spanningToursCount, 23);

    // All date ambiguities conclusively resolved: 0 remaining
    assert.strictEqual(preview.summary.dateAmbiguityCount, 0);
    assert.strictEqual(preview.ambiguities.length, 0);

    // Exactly 24 dates resolved via HISTORICAL_SOURCE_EVIDENCE_RECONCILIATION
    const historicalCorrections = preview.correctedDates?.filter(
      (c) => c.rule === "HISTORICAL_SOURCE_EVIDENCE_RECONCILIATION"
    ) || [];
    assert.strictEqual(historicalCorrections.length, 24);

    // Verify traceability fields preserved on all 23 records
    for (const item of historicalCorrections) {
      assert.ok(item.bookingReference, "bookingReference must be present");
      assert.ok(item.sourceRecordId, "sourceRecordId must be present");
      assert.ok(item.sheet, "sheet must be present");
      assert.ok(item.row > 0, "row must be positive");
      assert.ok(item.originalDate, "originalDate must be preserved");
      assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(item.correctedDate), "correctedDate must be YYYY-MM-DD");
      assert.ok(item.reason.includes("Resolved historical date ambiguity"), "reason must be descriptive");
    }

    // Spot check key historical records
    const aug24 = historicalCorrections.find((c) => c.sourceRecordId === "AUG 23:R24:1220830");
    assert.ok(aug24);
    assert.strictEqual(aug24.correctedDate, "2023-08-09");
    assert.strictEqual(aug24.originalDate, "09AUG");

    const nov72 = historicalCorrections.find((c) => c.sourceRecordId === "NOV-18:R72:1105216");
    assert.ok(nov72);
    assert.strictEqual(nov72.correctedDate, "2018-11-29");
    assert.strictEqual(nov72.originalDate, "29-11");

    const jan6 = historicalCorrections.find((c) => c.sourceRecordId === "JAN-17:R6:34465");
    assert.ok(jan6);
    assert.strictEqual(jan6.correctedDate, "2017-01-03");
    assert.strictEqual(jan6.originalDate, "3");

    const jul69 = historicalCorrections.find((c) => c.sourceRecordId === "JULY-16:R69:6714");
    assert.ok(jul69);
    assert.strictEqual(jul69.correctedDate, "2016-07-26");
    assert.strictEqual(jul69.originalDate, " 7/26");

    const jan90 = historicalCorrections.find((c) => c.sourceRecordId === "JAN-17:R90:35687");
    assert.ok(jan90);
    assert.strictEqual(jan90.correctedDate, "2017-01-31");
    assert.strictEqual(jan90.originalDate, "31");
    assert.ok(jan90.reason.includes("advance transfer service"), "reason must document advance transfer service");

    // Repeated booking references remain separate and distinct
    const ref34465Tours = preview.tours.filter((t) => t.bookingReference === "34465");
    const distinctSourceIds = new Set(ref34465Tours.map((t) => t.sourceRecordId));
    assert.strictEqual(distinctSourceIds.size, ref34465Tours.length, "Repeated booking references must have distinct sourceRecordIds");
  });
});

