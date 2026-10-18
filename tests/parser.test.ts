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
} from "../lib/excel-parser";

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

  test("flags date ambiguities when sheet season year disagrees with arrival serial", () => {
    const wsData: (string | number | undefined)[][] = [
      [undefined, undefined, undefined, undefined, undefined, undefined, 45658],
      [undefined, undefined, undefined, undefined, undefined, undefined, "WED"],
      // Row 2: Arrival serial 45658 evaluates to 2025-01-01, but sheet is named JAN 2026
      [45658, "SH2", 1253602, "IN-T402", "ENDO SATOKO MS X01", "VEG MEAL", "ARR JL-39 TRF H- AAVAAS"],
      [undefined, undefined, undefined, undefined, "JL-39 T-", undefined, undefined],
      [undefined, undefined, undefined, undefined, "G-KAMAL", undefined, undefined],
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "JAN 2026");
    const wbBuf = XLSX.write(wb, { type: "buffer", bookType: "xls" });

    const result = parseExcelWorkbook(wbBuf);
    assert.strictEqual(result.summary.dateAmbiguityCount, 1);
    assert.strictEqual(result.ambiguities[0].bookingReference, "1253602");
    assert.strictEqual(result.ambiguities[0].sheet, "JAN 2026");
    assert.ok(result.ambiguities[0].reason.includes("JAN 2026"));

    const tour = result.tours[0];
    assert.strictEqual(tour.hasDateAmbiguity, true);
    assert.strictEqual(tour.arrivalDate, "2025-01-01"); // Preserved mathematically
    assert.strictEqual(tour.rawArrivalSerial, 45658); // Preserved raw
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
    // Verified: Itinerary type and location evidence is preserved, not flattened to Delhi / sightseeing
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
    assert.ok(result.summary.totalSheetsFound >= 90);
    assert.ok(result.summary.totalTourBlocks > 1000);
    assert.ok(result.summary.canonicalToursCount > 1000);
    assert.ok(result.summary.dateAmbiguityCount > 0);
    assert.ok(result.summary.spanningToursCount > 0);

    // Verify booking reference 1253572
    const sample = result.tours.find((t) => t.bookingReference === "1253572");
    assert.ok(sample);
    assert.strictEqual(sample.agency, "SH2");
    assert.strictEqual(sample.group.adultCount, 2);
    assert.strictEqual(sample.sourceSheet, "OCT 2025");
    assert.strictEqual(sample.arrivalDate, "2025-10-03");

    // Verify ambiguous booking reference 1253602 preserves raw values
    const amb = result.tours.find((t) => t.bookingReference === "1253602");
    assert.ok(amb);
    assert.strictEqual(amb.hasDateAmbiguity, true);
    assert.strictEqual(amb.rawArrivalSerial, 45658);
  });
});
