import * as XLSX from "xlsx";
import type {
  Tour,
  ItineraryDay,
  HotelBooking,
  FlightBooking,
  StaffAssignment,
  SpecialRequest,
  ImportSummary,
  ImportPreviewResult,
  ImportAmbiguityItem,
  ImportDuplicateItem,
  ImportErrorItem,
  SheetImportDetail,
  TourStatus,
} from "./types";

export interface ParseOptions {
  /** If specified, only parse sheets belonging to this season (e.g. '2025-2026') */
  seasonFilter?: string;
  /** Custom operational reference date for calculating status (defaults to India today) */
  referenceDate?: string;
  /** Maximum number of sheets to parse (for tests or previews) */
  maxSheets?: number;
}

/**
 * Convert Excel date serial code to ISO date string (YYYY-MM-DD).
 * Returns null if invalid or cannot be parsed.
 */
export function xldateToISO(val: unknown): string | null {
  if (typeof val === "number" && val > 1000) {
    try {
      const parsed = XLSX.SSF.parse_date_code(val);
      if (parsed && parsed.y && parsed.m && parsed.d) {
        const y = String(parsed.y).padStart(4, "0");
        const m = String(parsed.m).padStart(2, "0");
        const d = String(parsed.d).padStart(2, "0");
        return `${y}-${m}-${d}`;
      }
    } catch {
      return null;
    }
  } else if (typeof val === "string") {
    const trimmed = val.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    // Check for DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dmyMatch) {
      const day = dmyMatch[1].padStart(2, "0");
      const month = dmyMatch[2].padStart(2, "0");
      const year = dmyMatch[3];
      return `${year}-${month}-${day}`;
    }
  }
  return null;
}

/**
 * Determine the season for an Excel sheet name (e.g. 'OCT 2025' -> '2025-2026').
 */
export function getSheetSeason(sheetName: string): string {
  const u = sheetName.toUpperCase().trim();
  if (u.includes("2026") || u.endsWith("-26") || u.endsWith("26")) return "2025-2026";
  if (u.includes("2025") || u.endsWith("-25") || u.endsWith("25")) {
    if (u.includes("JAN") || u.includes("FEB") || u.includes("MAR")) return "2024-2025";
    return "2025-2026";
  }
  if (u.includes("2024") || u.endsWith("-24") || u.endsWith("24")) return "2023-2024";
  if (u.includes("2023") || u.endsWith("-23") || u.endsWith("23")) return "2022-2023";
  if (u.includes("2022") || u.endsWith("-22") || u.endsWith("22")) return "2021-2022";
  if (u.includes("2019") || u.endsWith("-19") || u.endsWith("19")) return "2018-2019";
  if (u.includes("2018") || u.endsWith("-18") || u.endsWith("18")) return "2017-2018";
  if (u.includes("2017") || u.endsWith("-17") || u.endsWith("17")) return "2016-2017";
  if (u.includes("2016") || u.endsWith("-16") || u.endsWith("16")) return "2015-2016";
  return "OTHER";
}

/**
 * Extract passenger count and cleaned guest name from guest cell.
 * E.g., 'MATSUZAWA RIO MS X03' -> { guestName: 'MATSUZAWA RIO MS', pax: 3 }
 */
export function extractGuestAndPax(cellVal: unknown): { guestName: string; pax: number } {
  if (!cellVal) return { guestName: "Valued Guest", pax: 1 };
  let str = String(cellVal).trim();
  const paxMatch = str.match(/(?:[X*]|PAX\s*|\bx\s*)(\d{1,3})(?:\s*PAX)?/i);
  let pax = 1;
  if (paxMatch) {
    pax = parseInt(paxMatch[1], 10) || 1;
    str = str.replace(paxMatch[0], "").trim();
  }
  return { guestName: str || "Valued Guest", pax: Math.max(1, pax) };
}

/**
 * Extract flight codes and airline name from subrow string.
 */
export function extractFlights(rawSubrow: string, date: string, bookingRef: string): FlightBooking[] {
  if (!rawSubrow) return [];
  const flights: FlightBooking[] = [];
  const flightRegex = /\b([A-Z0-9]{2,3})[- ]?(\d{2,4})\b/g;
  let match;
  let idx = 1;

  while ((match = flightRegex.exec(rawSubrow)) !== null) {
    const carrier = match[1].toUpperCase();
    const flightNo = `${carrier}-${match[2]}`;
    let airline = "Partner Airline";
    if (carrier === "JL") airline = "Japan Airlines";
    else if (carrier === "SQ") airline = "Singapore Airlines";
    else if (carrier === "AI") airline = "Air India";
    else if (carrier === "NH") airline = "All Nippon Airways";
    else if (carrier === "TG") airline = "Thai Airways";
    else if (carrier === "CX") airline = "Cathay Pacific";
    else if (carrier === "MH") airline = "Malaysia Airlines";
    else if (carrier === "VN") airline = "Vietnam Airlines";
    else if (carrier === "UK") airline = "Vistara";
    else if (carrier === "6E") airline = "IndiGo";

    flights.push({
      id: `flt-${bookingRef}-${idx}`,
      direction: idx === 1 ? "arrival" : "departure",
      flightNumber: flightNo,
      airline,
      date,
      departureTime: "TBD",
      arrivalTime: "TBD",
      origin: idx === 1 ? "Tokyo (NRT/HND)" : "Delhi (DEL)",
      destination: idx === 1 ? "Delhi (DEL)" : "Tokyo (NRT/HND)",
      terminal: "T3",
    });
    idx++;
  }
  return flights;
}

/**
 * Extract guide assignment from subrow.
 */
export function extractGuideAssignment(guideRowVal: string, bookingRef: string): StaffAssignment {
  const raw = String(guideRowVal || "").trim();
  let name = raw;
  if (name.toUpperCase().startsWith("G-")) {
    name = name.slice(2).trim();
  } else if (name.toUpperCase().startsWith("GUIDE:")) {
    name = name.slice(6).trim();
  }

  // Check if unassigned or empty
  if (!name || name === "-" || name.toUpperCase() === "NIL" || name.toUpperCase() === "TBD") {
    return {
      id: `asn-${bookingRef}-guide`,
      role: "guide",
      status: "pending",
      name: "Unassigned Guide",
      reference: "GD-PENDING",
    };
  }

  // Clean up guide name
  const cleanName = name.replace(/\s+/g, " ");
  return {
    id: `asn-${bookingRef}-guide`,
    role: "guide",
    status: "assigned",
    name: cleanName,
    reference: `GD-${cleanName.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)}`,
  };
}

/**
 * Extract vehicle assignment from flight/transport subrow.
 */
export function extractVehicleAssignment(transRowVal: string, bookingRef: string): StaffAssignment | null {
  const raw = String(transRowVal || "").trim();
  if (!raw) return null;

  let vehicleType = "Standard Tourist Vehicle";
  if (raw.toUpperCase().includes("URBANIA")) vehicleType = "Force Urbania";
  else if (raw.toUpperCase().includes("INNOVA")) vehicleType = "Toyota Innova Crysta";
  else if (raw.toUpperCase().includes("TEMPO") || raw.toUpperCase().includes("T-")) vehicleType = "Tempo Traveller";
  else if (raw.toUpperCase().includes("SEDAN")) vehicleType = "AC Sedan";
  else if (raw.toUpperCase().includes("COACH") || raw.toUpperCase().includes("BUS")) vehicleType = "Large Tourist Coach";

  return {
    id: `asn-${bookingRef}-veh`,
    role: "vehicle",
    status: "assigned",
    reference: `VEH-${bookingRef.slice(-4)}`,
    vehicleType,
    notes: raw,
  };
}

/**
 * Detect primary destination circuit from itinerary movements and package code.
 */
export function inferCircuitDestination(itineraryTexts: string[], packageCode: string): string {
  const combined = (itineraryTexts.join(" ") + " " + (packageCode || "")).toUpperCase();
  const hasDel = combined.includes("DEL");
  const hasAgra = combined.includes("AGRA") || combined.includes("GRA") || combined.includes("TAJ");
  const hasJaipur = combined.includes("JAI");
  const hasVaranasi = combined.includes("VNS") || combined.includes("VARANASI") || combined.includes("BSB");
  const hasJodhpur = combined.includes("JOD");
  const hasUdaipur = combined.includes("UDR") || combined.includes("UDAIPUR");
  const hasKhajuraho = combined.includes("KHAJ");

  if (hasDel && hasAgra && hasJaipur && hasVaranasi) {
    return "Golden Triangle & Varanasi Circuit";
  }
  if (hasDel && hasAgra && hasJaipur) {
    return "Golden Triangle Circuit (Delhi-Agra-Jaipur)";
  }
  if (hasVaranasi) {
    return "Varanasi Heritage Circuit";
  }
  if (hasJodhpur || hasUdaipur) {
    return "Rajasthan Royal Circuit";
  }
  if (hasKhajuraho) {
    return "Central India & Khajuraho Heritage";
  }
  if (packageCode && packageCode.trim()) {
    return `Special Circuit (${packageCode.trim()})`;
  }
  return "North India Highlights Circuit";
}

/**
 * Extract hotels from itinerary movement texts.
 */
export function extractHotels(
  itineraryDays: Array<{ date: string; activity: string }>,
  bookingRef: string
): HotelBooking[] {
  const hotels: HotelBooking[] = [];
  const hotelRegex = /(?:H-\s*|HOTEL\s+)([A-Za-z0-9\s&'-]+?)(?=(?:\s+(?:ARR|TRF|SS|BSB|DEL|JAI|AGRA|VNS|APT|\/)|$))/gi;
  let hotelIndex = 1;

  for (const day of itineraryDays) {
    let match;
    while ((match = hotelRegex.exec(day.activity)) !== null) {
      const hotelRaw = match[1].trim();
      if (hotelRaw && hotelRaw.length >= 3 && !hotelRaw.toUpperCase().includes("APT")) {
        let city = "Delhi";
        const actUp = day.activity.toUpperCase();
        if (actUp.includes("JAI")) city = "Jaipur";
        else if (actUp.includes("AGRA") || actUp.includes("GRA")) city = "Agra";
        else if (actUp.includes("VNS") || actUp.includes("BSB")) city = "Varanasi";
        else if (actUp.includes("JOD")) city = "Jodhpur";
        else if (actUp.includes("UDR")) city = "Udaipur";

        hotels.push({
          id: `htl-${bookingRef}-${hotelIndex++}`,
          hotelName: hotelRaw,
          city,
          checkIn: day.date,
          checkOut: day.date,
          roomType: "twin",
          roomCount: 1,
          confirmationNumber: `CNF-${bookingRef.slice(-4)}-${hotelIndex}`,
        });
      }
    }
  }
  return hotels;
}

/**
 * Parse an Excel workbook Buffer or XLSX object into strongly-typed SATF Tour records.
 */
export function parseExcelWorkbook(
  buffer: ArrayBuffer | Buffer,
  options: ParseOptions = {}
): ImportPreviewResult {
  const wb = XLSX.read(buffer, { type: "buffer", dense: true });
  const sheetNames = wb.SheetNames;
  const ambiguities: ImportAmbiguityItem[] = [];
  const duplicates: ImportDuplicateItem[] = [];
  const errors: ImportErrorItem[] = [];
  const sheetsSummary: SheetImportDetail[] = [];

  const rawTourBlocksByRef = new Map<string, Array<{
    tour: Tour;
    sheetName: string;
    rowNumber: number;
    itineraryDays: Array<{ date: string; activity: string }>;
  }>>();

  let totalTourBlocks = 0;
  let operationalSheetsCount = 0;

  for (const sheetName of sheetNames) {
    const s = wb.Sheets[sheetName];
    if (!s || !s["!ref"]) continue;

    const season = getSheetSeason(sheetName);
    if (options.seasonFilter && season !== options.seasonFilter) {
      continue;
    }

    const range = XLSX.utils.decode_range(s["!ref"]);
    let toursInThisSheet = 0;

    // Check header date serials in row 0
    const colDates = new Map<number, string>();
    for (let c = 6; c <= range.e.c; c++) {
      const code = s[0]?.[c]?.v;
      const iso = xldateToISO(code);
      if (iso) {
        colDates.set(c, iso);
      }
    }

    // Sheet year check for date ambiguity detection
    const sheetYearMatch = sheetName.match(/(20\d\d|\b2\d\b|\b1\d\b)/);
    let expectedSheetYear: string | null = null;
    if (sheetYearMatch) {
      const rawY = sheetYearMatch[1];
      expectedSheetYear = rawY.length === 2 ? `20${rawY}` : rawY;
    }

    let r = 2;
    while (r <= range.e.r) {
      const c2 = s[r]?.[2]?.v;
      if (c2 === undefined || c2 === null) {
        r++;
        continue;
      }

      const refStr = String(c2).replace(".0", "").trim();
      // Booking reference pattern: 5 to 8 digits
      if (!/^\d{5,8}$/.test(refStr)) {
        r++;
        continue;
      }

      toursInThisSheet++;
      totalTourBlocks++;

      const c0 = s[r]?.[0]?.v;
      const c1 = s[r]?.[1]?.v;
      const c3 = s[r]?.[3]?.v;
      const c4 = s[r]?.[4]?.v;
      const c5 = s[r]?.[5]?.v;

      const sub1Val = s[r + 1]?.[4]?.v ? String(s[r + 1]?.[4]?.v).trim() : "";
      const sub2Val = s[r + 2]?.[4]?.v ? String(s[r + 2]?.[4]?.v).trim() : "";

      const rawArrivalSerial = c0;
      let arrivalDate = xldateToISO(c0);

      // Extract itinerary columns for this row
      const itineraryDays: Array<{ date: string; activity: string }> = [];
      for (let c = 6; c <= range.e.c; c++) {
        const act = s[r]?.[c]?.v;
        if (act && String(act).trim()) {
          const dayDate = colDates.get(c) || arrivalDate || "2025-10-01";
          itineraryDays.push({
            date: dayDate,
            activity: String(act).trim(),
          });
        }
      }

      // If arrival date not found in C0, fallback to first itinerary day
      if (!arrivalDate && itineraryDays.length > 0) {
        arrivalDate = itineraryDays[0].date;
      }
      if (!arrivalDate) {
        arrivalDate = "2025-10-01";
      }

      // Determine departure date
      let departureDate = arrivalDate;
      if (itineraryDays.length > 0) {
        departureDate = itineraryDays[itineraryDays.length - 1].date;
      }

      // Ambiguity detection: check if sheet year indicates e.g. 2026, but arrival date resolves to 2025
      let hasDateAmbiguity = false;
      let dateAmbiguityReason: string | undefined;

      if (expectedSheetYear && arrivalDate) {
        const arrivalYear = arrivalDate.slice(0, 4);
        if (expectedSheetYear !== arrivalYear) {
          hasDateAmbiguity = true;
          dateAmbiguityReason = `Sheet '${sheetName}' indicates season ${expectedSheetYear}, but arrival serial ${rawArrivalSerial} mathematically calculates to ${arrivalDate}. Original date faithfully preserved.`;
          ambiguities.push({
            bookingReference: refStr,
            sheet: sheetName,
            row: r + 1,
            reason: dateAmbiguityReason,
            rawSerial: rawArrivalSerial,
          });
        }
      }

      const { guestName, pax } = extractGuestAndPax(c4);
      const guideAssignment = extractGuideAssignment(sub2Val, refStr);
      const vehicleAssignment = extractVehicleAssignment(sub1Val, refStr);
      const assignments: StaffAssignment[] = [guideAssignment];
      if (vehicleAssignment) assignments.push(vehicleAssignment);

      const flights = extractFlights(sub1Val, arrivalDate, refStr);
      const packageCode = c3 ? String(c3).trim() : "";
      const destination = inferCircuitDestination(
        itineraryDays.map((d) => d.activity),
        packageCode
      );

      // Build special requests if notes exist
      const specialRequests: SpecialRequest[] = [];
      const operationalNotes = c5 ? String(c5).trim() : "";
      if (operationalNotes) {
        specialRequests.push({
          id: `sr-${refStr}-1`,
          category: operationalNotes.toUpperCase().includes("MEAL") || operationalNotes.toUpperCase().includes("VEG")
            ? "dietary"
            : "general",
          description: operationalNotes,
        });
      }

      // Build itinerary objects
      const itinerary: ItineraryDay[] = itineraryDays.map((d, i) => {
        const actUp = d.activity.toUpperCase();
        let type: ItineraryDay["type"] = "sightseeing";
        if (actUp.includes("ARR")) type = "arrival_transfer";
        else if (actUp.includes("APT") || actUp.includes("DEP")) type = "departure_transfer";
        else if (actUp.includes("TRF") || actUp.includes("TR ")) type = "transfer";
        else if (actUp.includes("SAFARI") || actUp.includes("BOAT")) type = "activity";

        let location = "Delhi";
        if (actUp.includes("JAI")) location = "Jaipur";
        else if (actUp.includes("AGRA") || actUp.includes("GRA")) location = "Agra";
        else if (actUp.includes("VNS") || actUp.includes("BSB")) location = "Varanasi";
        else if (actUp.includes("JOD")) location = "Jodhpur";
        else if (actUp.includes("UDR")) location = "Udaipur";

        return {
          id: `itn-${refStr}-${i + 1}`,
          date: d.date,
          startTime: "09:00",
          type,
          title: d.activity,
          location,
          durationMinutes: 180,
        };
      });

      const hotels = extractHotels(itineraryDays, refStr);

      // Tour status computation
      let status: TourStatus = "confirmed";
      if (operationalNotes.toUpperCase().includes("CANCEL")) {
        status = "cancelled";
      }

      const tour: Tour = {
        id: `satf-${refStr}`,
        bookingReference: refStr,
        status,
        destination,
        arrivalDate,
        departureDate,
        lastUpdated: new Date().toISOString(),
        group: {
          id: `grp-${refStr}`,
          groupName: guestName,
          adultCount: pax,
          childCount: 0,
          nationality: "Japanese",
          language: "Japanese",
          contactPerson: guestName,
          notes: operationalNotes || undefined,
        },
        flights,
        hotels,
        itinerary,
        assignments,
        specialRequests,
        sourceSheet: sheetName,
        sourceRow: r + 1,
        sourceSheets: [sheetName],
        rawArrivalSerial,
        hasDateAmbiguity,
        dateAmbiguityReason,
        agency: c1 ? String(c1).trim() : undefined,
        packageCode: packageCode || undefined,
        operationalNotes: operationalNotes || undefined,
        isImported: true,
      };

      if (!rawTourBlocksByRef.has(refStr)) {
        rawTourBlocksByRef.set(refStr, []);
      }
      rawTourBlocksByRef.get(refStr)!.push({
        tour,
        sheetName,
        rowNumber: r + 1,
        itineraryDays,
      });

      // Jump 3 rows to skip subrow 1 and subrow 2
      r += 3;
    }

    if (toursInThisSheet > 0) {
      operationalSheetsCount++;
    }

    sheetsSummary.push({
      sheetName,
      season,
      rowsCount: range.e.r + 1,
      toursCount: toursInThisSheet,
    });
  }

  // ─── Reconcile Duplicates & Spanning Tours ───────────────────────────────────

  const canonicalTours: Tour[] = [];
  let spanningToursCount = 0;
  let amendedToursCount = 0;
  let duplicateRowsCount = 0;
  let unassignedGuidesCount = 0;

  for (const [ref, occurrences] of rawTourBlocksByRef.entries()) {
    if (occurrences.length === 1) {
      const t = occurrences[0].tour;
      if (t.assignments.find((a) => a.role === "guide" && a.status === "pending")) {
        unassignedGuidesCount++;
      }
      canonicalTours.push(t);
    } else {
      // Multiple occurrences detected!
      duplicateRowsCount += occurrences.length - 1;
      const sheets = occurrences.map((o) => o.sheetName);
      const rows = occurrences.map((o) => o.rowNumber);

      // Check if this is a spanning tour across consecutive sheets (e.g. APR and MAY)
      const base = occurrences[0].tour;
      const allItineraryDays = occurrences.flatMap((o) => o.itineraryDays);

      // Deduplicate itinerary by date + activity
      const uniqueItinMap = new Map<string, { date: string; activity: string }>();
      for (const d of allItineraryDays) {
        uniqueItinMap.set(`${d.date}-${d.activity}`, d);
      }
      const mergedItineraryDays = Array.from(uniqueItinMap.values()).sort((a, b) =>
        a.date.localeCompare(b.date)
      );

      const distinctSheets = Array.from(new Set(sheets));
      let resolution: ImportDuplicateItem["resolution"] = "skipped_duplicate";

      if (distinctSheets.length > 1) {
        resolution = "merged_spanning";
        spanningToursCount++;

        base.sourceSheets = distinctSheets;
        if (mergedItineraryDays.length > 0) {
          base.arrivalDate = mergedItineraryDays[0].date;
          base.departureDate = mergedItineraryDays[mergedItineraryDays.length - 1].date;
          base.itinerary = mergedItineraryDays.map((d, i) => ({
            id: `itn-${ref}-${i + 1}`,
            date: d.date,
            startTime: "09:00",
            type: "sightseeing",
            title: d.activity,
            location: "Delhi",
            durationMinutes: 180,
          }));
          base.hotels = extractHotels(mergedItineraryDays, ref);
        }
      } else {
        resolution = "amended";
        amendedToursCount++;
      }

      duplicates.push({
        bookingReference: ref,
        sheets,
        rows,
        resolution,
      });

      if (base.assignments.find((a) => a.role === "guide" && a.status === "pending")) {
        unassignedGuidesCount++;
      }
      canonicalTours.push(base);
    }
  }

  // Sort canonical tours chronologically by arrivalDate
  canonicalTours.sort((a, b) => a.arrivalDate.localeCompare(b.arrivalDate));

  const summary: ImportSummary = {
    workbookName: "NEW CHART 2025-2026 (1).xls",
    importTimestamp: new Date().toISOString(),
    totalSheetsFound: sheetNames.length,
    operationalSheetsCount,
    totalTourBlocks,
    canonicalToursCount: canonicalTours.length,
    spanningToursCount,
    amendedToursCount,
    duplicateRowsCount,
    dateAmbiguityCount: ambiguities.length,
    unassignedGuidesCount,
    sheetsSummary,
  };

  return {
    success: errors.length === 0,
    summary,
    tours: canonicalTours,
    ambiguities,
    duplicates,
    errors,
  };
}
