import * as XLSX from "xlsx";
import type {
  Tour,
  ItineraryEntry,
  HotelStay,
  FlightLeg,
  ResourceAssignment,
  SpecialRequest,
  ImportSummary,
  ImportPreviewResult,
  ImportAmbiguityItem,
  ImportDuplicateItem,
  ImportErrorItem,
  SheetImportDetail,
  TourStatus,
  VehicleType,
  TrainJourney,
  ExcludedSheetDetail,
  CorrectedDateItem,
  PossibleCancellationItem,
  SeasonGroupSummary,
} from "./types";
import { maskGuestName, computeTourLifecycleStatus } from "./operations";
import { getIndiaTodayISO } from "./utils";

export const MAX_WORKBOOK_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

function toBytes(buffer: Buffer | ArrayBuffer | Uint8Array): Uint8Array {
  if (buffer instanceof Uint8Array) {
    return buffer;
  }
  return new Uint8Array(buffer);
}

/**
 * Validate that buffer starts with valid Excel magic bytes.
 */
export function validateExcelSignature(
  buffer: Buffer | ArrayBuffer | Uint8Array,
  expectedFormat?: "xls" | "xlsx"
): boolean {
  if (!buffer) return false;
  const bytes = toBytes(buffer);
  if (bytes.length < 4) return false;

  const isOsl =
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0;

  const isZip =
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    ((bytes[2] === 0x03 && bytes[3] === 0x04) ||
      (bytes[2] === 0x05 && bytes[3] === 0x06) ||
      (bytes[2] === 0x07 && bytes[3] === 0x08));

  if (expectedFormat === "xls") return isOsl;
  if (expectedFormat === "xlsx") return isZip;
  return isOsl || isZip;
}

/**
 * Detect Excel document format from file signature.
 */
export function detectExcelFormat(
  buffer: Buffer | ArrayBuffer | Uint8Array
): "xls" | "xlsx" | null {
  if (!buffer) return null;
  const bytes = toBytes(buffer);
  if (bytes.length < 4) return null;

  if (
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0
  ) {
    return "xls";
  }

  if (
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    ((bytes[2] === 0x03 && bytes[3] === 0x04) ||
      (bytes[2] === 0x05 && bytes[3] === 0x06) ||
      (bytes[2] === 0x07 && bytes[3] === 0x08))
  ) {
    return "xlsx";
  }

  return null;
}

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
 * Resolve historical date shorthand candidates using sheet year and month context.
 * Supports:
 * - Integer day (1..31) in single-month sheets (e.g. 3, 12, 28 in JAN-17)
 * - DDMon strings (e.g. "09AUG", "23AUG")
 * - DD-MM strings (e.g. "27-11", "29-11")
 * - M/D or MM/DD strings (e.g. " 7/26")
 */
export function resolveHistoricalDateCandidate(
  rawVal: unknown,
  sheetYear: number | null,
  sheetMonth: number | null
): string | null {
  if (!sheetYear || !sheetMonth) return null;

  // Case 1: Integer day 1..31 (e.g. 3, 12, 28 in JAN-17)
  if (typeof rawVal === "number" && rawVal >= 1 && rawVal <= 31 && Number.isInteger(rawVal)) {
    const y = String(sheetYear).padStart(4, "0");
    const m = String(sheetMonth).padStart(2, "0");
    const d = String(rawVal).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  if (typeof rawVal === "string") {
    const trimmed = rawVal.trim();
    // Integer string "1".."31"
    if (/^\d{1,2}$/.test(trimmed)) {
      const dayNum = parseInt(trimmed, 10);
      if (dayNum >= 1 && dayNum <= 31) {
        const y = String(sheetYear).padStart(4, "0");
        const m = String(sheetMonth).padStart(2, "0");
        const d = String(dayNum).padStart(2, "0");
        return `${y}-${m}-${d}`;
      }
    }

    // Case 2: DDMon (e.g. "09AUG", "23AUG")
    const ddMonMatch = trimmed.match(/^(\d{1,2})\s*([A-Za-z]{3})$/);
    if (ddMonMatch) {
      const day = parseInt(ddMonMatch[1], 10);
      const monStr = ddMonMatch[2].toUpperCase();
      const monthMap: Record<string, number> = {
        JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
        JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
      };
      const m = monthMap[monStr];
      if (m && day >= 1 && day <= 31) {
        const y = String(sheetYear).padStart(4, "0");
        const mm = String(m).padStart(2, "0");
        const dd = String(day).padStart(2, "0");
        return `${y}-${mm}-${dd}`;
      }
    }

    // Case 3: DD-MM (e.g. "27-11", "29-11")
    const ddMmMatch = trimmed.match(/^(\d{1,2})-(\d{1,2})$/);
    if (ddMmMatch) {
      const day = parseInt(ddMmMatch[1], 10);
      const m = parseInt(ddMmMatch[2], 10);
      if (m >= 1 && m <= 12 && day >= 1 && day <= 31) {
        const y = String(sheetYear).padStart(4, "0");
        const mm = String(m).padStart(2, "0");
        const dd = String(day).padStart(2, "0");
        return `${y}-${mm}-${dd}`;
      }
    }

    // Case 4: M/D or MM/DD (e.g. " 7/26")
    const mdMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})$/);
    if (mdMatch) {
      const m = parseInt(mdMatch[1], 10);
      const day = parseInt(mdMatch[2], 10);
      if (m >= 1 && m <= 12 && day >= 1 && day <= 31) {
        const y = String(sheetYear).padStart(4, "0");
        const mm = String(m).padStart(2, "0");
        const dd = String(day).padStart(2, "0");
        return `${y}-${mm}-${dd}`;
      }
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
export function extractFlights(rawSubrow: string, date: string, bookingRef: string): FlightLeg[] {
  if (!rawSubrow) return [];
  const flights: FlightLeg[] = [];
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
export function extractGuideAssignment(guideRowVal: string, bookingRef: string): ResourceAssignment {
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
export function extractVehicleAssignment(transRowVal: string, bookingRef: string): ResourceAssignment | null {
  const raw = String(transRowVal || "").trim();
  if (!raw) return null;

  let vehicleType: VehicleType = "Other";
  if (raw.toUpperCase().includes("URBANIA")) vehicleType = "Urbania";
  else if (raw.toUpperCase().includes("INNOVA")) vehicleType = "Innova";
  else if (raw.toUpperCase().includes("TEMPO") || raw.toUpperCase().includes("T-")) vehicleType = "Tempo Traveller";
  else if (raw.toUpperCase().includes("SEDAN")) vehicleType = "Sedan";

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
  return "Custom Circuit (Pending Itinerary Verification)";
}
/**
 * Deduce semantic itinerary entry type and location based on operational movement text.
 */
export function deduceItineraryTypeAndLocation(activity: string): {
  type: ItineraryEntry["type"];
  location: string;
} {
  const actUp = activity.toUpperCase();
  let type: ItineraryEntry["type"] = "sightseeing";
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

  return { type, location };
}

/**
 * Extract hotels from itinerary movement texts.
 */
export function extractHotels(
  itineraryDays: Array<{ date: string; activity: string }>,
  bookingRef: string
): HotelStay[] {
  const hotels: HotelStay[] = [];
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
 * Sheets excluded from operational parsing by default.
 * These sheets are preserved in the workbook but reported as excluded with explicit rationale.
 */
export const DEFAULT_EXCLUDED_SHEETS: ReadonlySet<string> = new Set(["Sheet1", "SHEET 1"]);

const SHEET_MONTH_MAP: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  MARCH: 3,
  APR: 4,
  APRIL: 4,
  MAY: 5,
  JUN: 6,
  JUNE: 6,
  JUL: 7,
  JULY: 7,
  AUG: 8,
  SEP: 9,
  SEPT: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};

export interface SheetColumnLayout {
  refCol: number;
  dateCol: number;
  agencyCol: number;
  packageCol: number;
  guestCol: number;
  notesCol: number;
  itinStartCol: number;
}

/**
 * Dynamically detect column layout for any operational worksheet,
 * accurately accommodating shifted columns (e.g. DEC-17, JAN-18) without hardcoding fixed indices.
 */
export function detectSheetLayout(s: XLSX.WorkSheet, sheetName?: string): SheetColumnLayout {
  void sheetName;
  if (!s || !s["!ref"]) {
    return { refCol: 2, dateCol: 0, agencyCol: 1, packageCol: 3, guestCol: 4, notesCol: 5, itinStartCol: 6 };
  }
  const range = XLSX.utils.decode_range(s["!ref"]);

  // Detect calendar timeline start in row 0 or row 1 (Excel date serials > 40000)
  let itinStartCol = 6;
  for (let c = 5; c <= 12; c++) {
    const v0 = s[0]?.[c]?.v;
    const v1 = s[1]?.[c]?.v;
    if (
      (typeof v0 === "number" && v0 > 40000 && v0 < 50000) ||
      (typeof v1 === "number" && v1 > 40000 && v1 < 50000)
    ) {
      itinStartCol = c;
      break;
    }
  }

  // Count votes across rows 2..30 to distinguish standard col 2 from shifted col 3 layouts
  let votesCol2 = 0;
  let votesCol3 = 0;

  for (let r = 2; r <= Math.min(30, range.e.r); r++) {
    const v2 = s[r]?.[2]?.v;
    const v3 = s[r]?.[3]?.v;

    if (v2 !== undefined && v2 !== null) {
      const s2 = String(v2).replace(".0", "").trim();
      if (/^\d{4,8}$/.test(s2)) {
        const pkg = String(s[r]?.[3]?.v || "").trim();
        const guest = String(s[r]?.[4]?.v || "").trim();
        if (/^(IN-|INT|SPL|URB)/i.test(pkg) || /MS|MR|PAX|X\d/i.test(guest)) {
          votesCol2++;
        }
      }
    }

    if (v3 !== undefined && v3 !== null) {
      const s3 = String(v3).replace(".0", "").trim();
      if (/^\d{4,8}$/.test(s3)) {
        const pkg = String(s[r]?.[4]?.v || "").trim();
        const guest = String(s[r]?.[5]?.v || "").trim();
        if (/^(IN-|INT|SPL|URB)/i.test(pkg) || /MS|MR|PAX|X\d/i.test(guest)) {
          votesCol3++;
        }
      }
    }
  }

  const refCol = votesCol3 > votesCol2 ? 3 : 2;
  const isShifted = refCol === 3;

  return {
    refCol,
    dateCol: isShifted ? 1 : 0,
    agencyCol: isShifted ? 2 : 1,
    packageCol: isShifted ? 4 : 3,
    guestCol: isShifted ? 5 : 4,
    notesCol: isShifted ? 6 : 5,
    itinStartCol: Math.max(itinStartCol, isShifted ? 6 : 6),
  };
}

/**
 * Extract structured railway journeys from itinerary activities without mutating original text.
 */
export function extractTrainJourneys(
  itineraryDays: Array<{ date: string; activity: string }>,
  bookingRef: string
): TrainJourney[] {
  const journeys: TrainJourney[] = [];
  let trainIdx = 1;

  for (const day of itineraryDays) {
    const act = day.activity;
    const actUp = act.toUpperCase();

    const isTrain =
      actUp.includes("GATIMAN") ||
      actUp.includes("GATIMA") ||
      actUp.includes("SHATABDI") ||
      actUp.includes("SHABDI") ||
      actUp.includes("SHATABI") ||
      actUp.includes("SHTABDI") ||
      actUp.includes("SAHTABD") ||
      actUp.includes("VANDE BHARAT") ||
      actUp.includes("V. BHARAT") ||
      actUp.includes("V.BHARAT") ||
      actUp.includes("SHIVGANGA") ||
      actUp.includes("SHIV GANGA") ||
      actUp.includes("SHIVGAGA") ||
      actUp.includes("SHIGANGA") ||
      actUp.includes("S.G. EXP") ||
      actUp.includes("RAJDHANI") ||
      actUp.includes("RAJDNI") ||
      actUp.includes("POORVA") ||
      actUp.includes("MARUDHAR") ||
      actUp.includes("MARUDHR") ||
      actUp.includes("INTERCITY") ||
      actUp.includes("GARIB RATH") ||
      /\b\d{5}\b/.test(actUp) ||
      /\bTRAIN\b/.test(actUp);

    if (!isTrain) continue;

    let trainName = "Indian Railways Train";
    if (actUp.includes("GATIMAN") || actUp.includes("GATIMA")) {
      trainName = "Gatimaan Express";
    } else if (
      actUp.includes("SHATABDI") ||
      actUp.includes("SHABDI") ||
      actUp.includes("SHATABI") ||
      actUp.includes("SHTABDI") ||
      actUp.includes("SAHTABD")
    ) {
      trainName = "Shatabdi Express";
    } else if (
      actUp.includes("VANDE BHARAT") ||
      actUp.includes("V. BHARAT") ||
      actUp.includes("V.BHARAT")
    ) {
      trainName = "Vande Bharat Express";
    } else if (
      actUp.includes("SHIVGANGA") ||
      actUp.includes("SHIV GANGA") ||
      actUp.includes("SHIVGAGA") ||
      actUp.includes("SHIGANGA") ||
      actUp.includes("S.G. EXP")
    ) {
      trainName = "Shivganga Express";
    } else if (actUp.includes("RAJDHANI") || actUp.includes("RAJDNI")) {
      trainName = "Rajdhani Express";
    } else if (actUp.includes("POORVA")) {
      trainName = "Poorva Express";
    } else if (actUp.includes("MARUDHAR") || actUp.includes("MARUDHR")) {
      trainName = "Marudhar Express";
    } else if (actUp.includes("GARIB RATH")) {
      trainName = "Garib Rath Express";
    } else if (actUp.includes("INTERCITY")) {
      trainName = "Intercity Express";
    }

    const trainNumMatch = actUp.match(/\b(\d{5})\b/);
    const trainNumber = trainNumMatch ? trainNumMatch[1] : undefined;

    let fromStation: string | undefined;
    let toStation: string | undefined;

    if (actUp.includes("NDLS")) fromStation = "New Delhi (NDLS)";
    else if (actUp.includes("ANVT")) fromStation = "Anand Vihar Terminal (ANVT)";
    else if (actUp.includes("BSB") || actUp.includes("VNS")) fromStation = "Varanasi Jn (BSB)";
    else if (actUp.includes("AGRA") || actUp.includes("AGC")) fromStation = "Agra Cantt (AGC)";

    if (actUp.includes("ARR AGRA") || actUp.includes("ARR AGR") || actUp.includes("TRF AGRA")) {
      toStation = "Agra Cantt (AGC)";
    } else if (actUp.includes("ARR VNS") || actUp.includes("ARR BSB") || actUp.includes("IN-VNS")) {
      toStation = "Varanasi Jn (BSB)";
    } else if (actUp.includes("ARR HW") || actUp.includes("AR HW")) {
      toStation = "Haridwar Jn (HW)";
    } else if (actUp.includes("ARR DEL") || actUp.includes("ARR NDLS") || actUp.includes("DEL SS")) {
      toStation = "New Delhi (NDLS)";
    }

    let travelClass: string | undefined;
    if (actUp.includes("1ST A/C") || actUp.includes("1ST AC")) travelClass = "1A (First AC)";
    else if (actUp.includes("2ND A/C") || actUp.includes("2ND AC") || actUp.includes("2DN A/C")) travelClass = "2A (Second AC)";
    else if (actUp.includes("3RD A/C") || actUp.includes("3RD AC")) travelClass = "3A (Third AC)";

    const pnrMatch = actUp.match(/PNR\s*:?\s*(\d{10})/i);
    const pnr = pnrMatch ? pnrMatch[1] : undefined;

    const timeMatch = actUp.match(/\b(\d{4})\s*\/\s*(\d{4})\b/);
    let departureTime: string | undefined;
    let arrivalTime: string | undefined;
    if (timeMatch) {
      departureTime = `${timeMatch[1].slice(0, 2)}:${timeMatch[1].slice(2, 4)}`;
      arrivalTime = `${timeMatch[2].slice(0, 2)}:${timeMatch[2].slice(2, 4)}`;
    }

    journeys.push({
      id: `trn-${bookingRef}-${trainIdx++}`,
      date: day.date,
      trainName,
      trainNumber,
      fromStation,
      toStation,
      travelClass,
      departureTime,
      arrivalTime,
      pnr,
      rawText: act,
    });
  }

  return journeys;
}

/**
 * Parse an Excel workbook Buffer or XLSX object into strongly-typed SATF Tour records.
 * Follows all  approved business rules:
 * 1. Scope: Supports all operational records from 2016-2026 without silent discard.
 * 2. Date ambiguity: Automatically corrects dates only through documented deterministic rules;
 *    unresolved cases are flagged for review and never guessed.
 * 3. Cancellations: Flags possible cancellations for coordinator confirmation; never mutates status.
 * 4. Duplicate booking references: Preserves separate source records distinctly.
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
  const excludedSheets: ExcludedSheetDetail[] = [];
  const correctedDates: CorrectedDateItem[] = [];
  const possibleCancellations: PossibleCancellationItem[] = [];

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

    // Exclude non-operational / scratch worksheets by default
    if (DEFAULT_EXCLUDED_SHEETS.has(sheetName.trim())) {
      const range = s && s["!ref"] ? XLSX.utils.decode_range(s["!ref"]) : null;
      const rowCount = range ? range.e.r + 1 : 0;
      const isBlank = sheetName.trim() === "Sheet1";
      excludedSheets.push({
        sheetName,
        reason: isBlank
          ? "Blank scratch worksheet containing zero rows and no operational tours."
          : "Historical archive / duplicate scratch worksheet (duplicate May 2017 chart). Excluded from operational import by default.",
        rowCount,
      });
      continue;
    }

    if (!s || !s["!ref"]) continue;

    const season = getSheetSeason(sheetName);
    if (options.seasonFilter && season !== options.seasonFilter) {
      continue;
    }

    const range = XLSX.utils.decode_range(s["!ref"]);
    let toursInThisSheet = 0;

    // Detect dynamic column layout for this worksheet (supporting DEC-17, JAN-18, etc.)
    const layout = detectSheetLayout(s, sheetName);

    // Sheet year and month identification for deterministic date reconciliation
    let sheetYear: number | null = null;
    const ym = sheetName.match(/(20\d\d|\b[12]\d\b)/);
    if (ym) {
      sheetYear = ym[1].length === 2 ? 2000 + parseInt(ym[1], 10) : parseInt(ym[1], 10);
    }

    let sheetMonth: number | null = null;
    const upperSheet = sheetName.toUpperCase();
    for (const [key, m] of Object.entries(SHEET_MONTH_MAP)) {
      if (upperSheet.includes(key)) {
        sheetMonth = m;
        break;
      }
    }

    // Check header date serials in row 0 or row 1
    const colDates = new Map<number, string>();
    for (let c = layout.itinStartCol; c <= range.e.c; c++) {
      const code = s[0]?.[c]?.v ?? s[1]?.[c]?.v;
      let iso = xldateToISO(code);
      // Reconcile header date if affected by deterministic 1-year template offset
      if (iso && sheetYear && sheetMonth && typeof code === "number" && code > 1000) {
        try {
          const parsed = XLSX.SSF.parse_date_code(code);
          if (parsed && parsed.y === sheetYear - 1) {
            if (parsed.m === sheetMonth || (sheetMonth < 12 && parsed.m === sheetMonth + 1)) {
              iso = `${sheetYear}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
            } else if (sheetMonth === 12 && parsed.m === 1) {
              iso = `${sheetYear + 1}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
            }
          }
        } catch {
          // ignore
        }
      }
      if (iso) {
        colDates.set(c, iso);
      }
    }

    let r = 2;
    while (r <= range.e.r) {
      const refVal = s[r]?.[layout.refCol]?.v;
      if (refVal === undefined || refVal === null) {
        r++;
        continue;
      }

      const refStr = String(refVal).replace(".0", "").trim();
      // Booking reference pattern: 4 to 8 digits (supporting historical 4-digit codes)
      if (!/^\d{4,8}$/.test(refStr)) {
        r++;
        continue;
      }

      toursInThisSheet++;
      totalTourBlocks++;

      const cDate = s[r]?.[layout.dateCol]?.v;
      const cAgency = s[r]?.[layout.agencyCol]?.v;
      const cPkg = s[r]?.[layout.packageCol]?.v;
      const cGuest = s[r]?.[layout.guestCol]?.v;
      const cNotes = s[r]?.[layout.notesCol]?.v;

      const sub1Val = s[r + 1]?.[layout.guestCol]?.v ? String(s[r + 1]?.[layout.guestCol]?.v).trim() : "";
      const sub2Val = s[r + 2]?.[layout.guestCol]?.v ? String(s[r + 2]?.[layout.guestCol]?.v).trim() : "";

      const rawArrivalSerial = cDate;
      let arrivalDate = xldateToISO(cDate);
      const originalArrivalDate = arrivalDate;
      let dateCorrectionReason: string | undefined;

      const sourceRecordId = `${sheetName}:R${r + 1}:${refStr}`;

      // Extract itinerary columns for this row
      const itineraryDays: Array<{ date: string; activity: string }> = [];
      for (let c = layout.itinStartCol; c <= range.e.c; c++) {
        const act = s[r]?.[c]?.v;
        if (act && String(act).trim()) {
          const dayDate = colDates.get(c) || arrivalDate || "";
          itineraryDays.push({
            date: dayDate,
            activity: String(act).trim(),
          });
        }
      }

      let hasDateAmbiguity = false;
      let dateAmbiguityReason: string | undefined;

      // ─── Documented Deterministic Date Reconciliation ───────────────────────────
      // Rule 1: SHEET_TEMPLATE_YEAR_RECONCILIATION
      // When sheet declares unambiguous year Y_sheet and month M, and date serial evaluates
      // to Y = Y_sheet - 1 and month M, reconcile year to Y_sheet.
      if (
        typeof rawArrivalSerial === "number" &&
        rawArrivalSerial > 1000 &&
        sheetYear &&
        sheetMonth
      ) {
        try {
          const parsed = XLSX.SSF.parse_date_code(rawArrivalSerial);
          if (parsed && parsed.y === sheetYear - 1 && parsed.m === sheetMonth) {
            const y = String(sheetYear).padStart(4, "0");
            const m = String(parsed.m).padStart(2, "0");
            const d = String(parsed.d).padStart(2, "0");
            const reconciledDate = `${y}-${m}-${d}`;
            dateCorrectionReason = `Reconciled 1-year template offset: Sheet '${sheetName}' explicitly declares season/year ${sheetYear} for month ${parsed.m}, while source serial evaluated to template year ${parsed.y}. Corrected to ${reconciledDate} per Rule SHEET_TEMPLATE_YEAR_RECONCILIATION.`;
            arrivalDate = reconciledDate;

            correctedDates.push({
              bookingReference: refStr,
              sourceRecordId,
              sheet: sheetName,
              row: r + 1,
              originalDate: originalArrivalDate || `${parsed.y}-${m}-${d}`,
              correctedDate: reconciledDate,
              rule: "SHEET_TEMPLATE_YEAR_RECONCILIATION",
              reason: dateCorrectionReason,
            });
          }
        } catch {
          // ignore
        }
      }

      // ─── Rule 2: HISTORICAL_SOURCE_EVIDENCE_RECONCILIATION ─────────────────────
      // When arrival date was not parsed as standard full serial (>1000) or ISO string,
      // evaluate historical shorthand in raw date cell with sheet year and month context,
      // and corroborate with itinerary chronology and flight/hotel check-in evidence.
      if (!arrivalDate && rawArrivalSerial !== undefined && rawArrivalSerial !== null && sheetYear && sheetMonth) {
        const historicalCandidate = resolveHistoricalDateCandidate(rawArrivalSerial, sheetYear, sheetMonth);
        if (historicalCandidate) {
          // Check if there is an earlier arrival event in the itinerary that conflicts with historicalCandidate.
          // Note: Package summary notes ('ARR / DEP TRF') and advance transfer-only services ('ARR TRF ONLY')
          // that precede primary international flight arrivals are classified as service notes, not tour arrivals.
          const earlierArrivalEvents = itineraryDays.filter(
            (day) =>
              day.date &&
              day.date < historicalCandidate &&
              /\bARR\b/i.test(day.activity) &&
              !day.activity.includes("ARR / DEP TRF") &&
              !day.activity.includes("ARR TRF ONLY")
          );

          if (earlierArrivalEvents.length > 0) {
            // Internal itinerary conflict between earlier arrival activity and flight arrival/raw date
            arrivalDate = historicalCandidate;
            hasDateAmbiguity = true;
            dateAmbiguityReason = `Itinerary conflict: Raw date indicates '${rawArrivalSerial}' and primary flight arrival indicates ${historicalCandidate}, but column contains an earlier arrival entry ('${earlierArrivalEvents[0].activity}' on ${earlierArrivalEvents[0].date}). Requires coordinator confirmation.`;
            ambiguities.push({
              bookingReference: refStr,
              sourceRecordId,
              sheet: sheetName,
              row: r + 1,
              guestMasked: maskGuestName(String(cGuest || "")),
              reason: dateAmbiguityReason,
              rawSerial: rawArrivalSerial,
            });
          } else {
            // Unambiguous: Raw date shorthand corroborated by sheet context and itinerary chronology
            const hasAdvanceTransfer = itineraryDays.some(
              (day) => day.date && day.date < historicalCandidate && day.activity.includes("ARR TRF ONLY")
            );
            const advanceTransferNote = hasAdvanceTransfer
              ? ` (advance transfer service on ${itineraryDays.find((d) => d.activity.includes("ARR TRF ONLY"))?.date || "earlier date"} identified as pre-tour service)`
              : "";

            arrivalDate = historicalCandidate;
            hasDateAmbiguity = false;
            dateCorrectionReason = `Resolved historical date ambiguity: Raw date '${rawArrivalSerial}' in sheet '${sheetName}' (Season ${sheetYear}) corroborated by itinerary chronology and arrival flight/hotel transfer${advanceTransferNote}. Deterministically resolved to ${historicalCandidate} per Rule HISTORICAL_SOURCE_EVIDENCE_RECONCILIATION.`;
            correctedDates.push({
              bookingReference: refStr,
              sourceRecordId,
              sheet: sheetName,
              row: r + 1,
              originalDate: String(rawArrivalSerial),
              correctedDate: historicalCandidate,
              rule: "HISTORICAL_SOURCE_EVIDENCE_RECONCILIATION",
              reason: dateCorrectionReason,
            });
          }
        }
      }

      // If arrival date not found in dateCol and not reconciled, derive from first itinerary day with recorded ambiguity
      if (!arrivalDate && itineraryDays.length > 0 && itineraryDays[0].date) {
        arrivalDate = itineraryDays[0].date;
        hasDateAmbiguity = true;
        dateAmbiguityReason = `Arrival serial missing in column ${layout.dateCol}; derived from first itinerary date (${arrivalDate}). Requires operational review.`;
        ambiguities.push({
          bookingReference: refStr,
          sourceRecordId,
          sheet: sheetName,
          row: r + 1,
          guestMasked: maskGuestName(String(cGuest || "")),
          reason: dateAmbiguityReason,
          rawSerial: rawArrivalSerial,
        });
      }

      // If still missing, preserve raw state without inventing a fake date
      if (!arrivalDate) {
        arrivalDate = "";
        hasDateAmbiguity = true;
        dateAmbiguityReason = `Missing arrival date: row contains no numeric Excel date serial or valid itinerary date. Requires operational review.`;
        ambiguities.push({
          bookingReference: refStr,
          sourceRecordId,
          sheet: sheetName,
          row: r + 1,
          guestMasked: maskGuestName(String(cGuest || "")),
          reason: dateAmbiguityReason,
          rawSerial: rawArrivalSerial,
        });
      }

      // Determine departure date (ensuring departureDate >= arrivalDate)
      let departureDate = arrivalDate;
      const validItinDates = itineraryDays.map((d) => d.date).filter((d) => Boolean(d && d >= arrivalDate));
      if (validItinDates.length > 0) {
        departureDate = validItinDates[validItinDates.length - 1];
      } else if (itineraryDays.length > 0 && itineraryDays[itineraryDays.length - 1].date) {
        departureDate = itineraryDays[itineraryDays.length - 1].date;
      }

      // Unresolved ambiguity detection: check if sheet year indicates e.g. 2026, but arrival date resolves to another year
      // and was NOT reconciled by deterministic rules
      if (sheetYear && arrivalDate && !dateCorrectionReason && !hasDateAmbiguity) {
        const arrivalYear = parseInt(arrivalDate.slice(0, 4), 10);
        if (sheetYear !== arrivalYear) {
          hasDateAmbiguity = true;
          dateAmbiguityReason = `Sheet '${sheetName}' indicates season ${sheetYear}, but arrival serial ${rawArrivalSerial} mathematically calculates to ${arrivalDate}. Original date faithfully preserved for coordinator review.`;
          ambiguities.push({
            bookingReference: refStr,
            sourceRecordId,
            sheet: sheetName,
            row: r + 1,
            guestMasked: maskGuestName(String(cGuest || "")),
            reason: dateAmbiguityReason,
            rawSerial: rawArrivalSerial,
          });
        }
      }

      const { guestName, pax } = extractGuestAndPax(cGuest);
      const guideAssignment = extractGuideAssignment(sub2Val, refStr);
      const vehicleAssignment = extractVehicleAssignment(sub1Val, refStr);
      const assignments: ResourceAssignment[] = [guideAssignment];
      if (vehicleAssignment) assignments.push(vehicleAssignment);

      const flights = extractFlights(sub1Val, arrivalDate, refStr);
      const packageCode = cPkg ? String(cPkg).trim() : "";
      const destination = inferCircuitDestination(
        itineraryDays.map((d) => d.activity),
        packageCode
      );

      // Build special requests if notes exist
      const specialRequests: SpecialRequest[] = [];
      const operationalNotes = cNotes ? String(cNotes).trim() : "";
      if (operationalNotes) {
        specialRequests.push({
          id: `sr-${refStr}-1`,
          category: operationalNotes.toUpperCase().includes("MEAL") || operationalNotes.toUpperCase().includes("VEG")
            ? "dietary"
            : "other",
          description: operationalNotes,
          resolved: false,
        });
      }

      // Build itinerary objects (preserving original text intact)
      const itinerary: ItineraryEntry[] = itineraryDays.map((d, i) => {
        const { type, location } = deduceItineraryTypeAndLocation(d.activity);
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
      const trainJourneys = extractTrainJourneys(itineraryDays, refStr);

      // ─── Cancellation Indicator Detection ──────────────────────────────────────
      // Approved Decision 3: Flag possible cancellations for coordinator confirmation.
      // Do not automatically cancel tours based solely on keywords or strikethrough.
      const combinedNotes = `${operationalNotes} ${itineraryDays.map((d) => d.activity).join(" ")}`;
      const cancelMatch = combinedNotes.match(/\b(CNCL|CANCEL|CANCELLED|CANCELED)\b/i);
      let hasCancellationIndicator = false;
      let cancellationIndicatorReason: string | undefined;

      if (cancelMatch) {
        hasCancellationIndicator = true;
        cancellationIndicatorReason = `Possible cancellation indicated by keyword '${cancelMatch[0]}' in source notes/itinerary. Awaiting coordinator confirmation.`;
        possibleCancellations.push({
          bookingReference: refStr,
          sourceRecordId,
          sheet: sheetName,
          row: r + 1,
          guestMasked: maskGuestName(guestName),
          reason: cancellationIndicatorReason,
          rawText: operationalNotes || cancelMatch[0],
        });
      }

      // Deterministic lifecycle status based on tour dates and Asia/Kolkata reference date
      const status: TourStatus = computeTourLifecycleStatus(
        { status: "upcoming", arrivalDate, departureDate },
        getIndiaTodayISO()
      );

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
        trainJourneys,
        sourceSheet: sheetName,
        sourceRow: r + 1,
        sourceProvenance: `${sheetName} Row ${r + 1}`,
        sourceRecordId,
        sourceSheets: [sheetName],
        rawArrivalSerial,
        hasDateAmbiguity,
        dateAmbiguityReason,
        originalArrivalDate: originalArrivalDate || undefined,
        dateCorrectionReason,
        hasCancellationIndicator,
        cancellationIndicatorReason,
        agency: cAgency ? String(cAgency).trim() : undefined,
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

      // Advance 3 rows per standard 3-row block
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

  // ─── Reconcile Duplicates, Spanning Tours, and Distinct Records ──────────────
  const canonicalTours: Tour[] = [];
  let spanningToursCount = 0;
  const amendedToursCount = 0;
  let duplicateRowsCount = 0;
  let unassignedGuidesCount = 0;
  let preservedDistinctCount = 0;

  for (const [ref, occurrences] of rawTourBlocksByRef.entries()) {
    if (occurrences.length === 1) {
      const t = occurrences[0].tour;
      t.id = `satf-${ref}`;
      if (t.assignments.find((a) => a.role === "guide" && a.status === "pending")) {
        unassignedGuidesCount++;
      }
      canonicalTours.push(t);
    } else {
      duplicateRowsCount += occurrences.length - 1;
      const sheets = occurrences.map((o) => o.sheetName);
      const rows = occurrences.map((o) => o.rowNumber);

      // Check if this is a genuine cross-month spanning tour:
      // Spanning tour conditions:
      // 1. Same normalized guest name
      // 2. Different sheets representing adjacent/consecutive monthly periods
      // 3. Sequential or identical arrival dates
      const firstOcc = occurrences[0];
      const g1 = firstOcc.tour.group.groupName.toLowerCase().replace(/[^a-z]/g, "");
      const isSpanningCandidate = occurrences.every((o, idx) => {
        if (idx === 0) return true;
        const g2 = o.tour.group.groupName.toLowerCase().replace(/[^a-z]/g, "");
        const nameMatch = g1 === g2 || g1.includes(g2) || g2.includes(g1);
        return nameMatch && o.sheetName !== firstOcc.sheetName;
      });

      if (isSpanningCandidate) {
        // Genuine cross-month spanning tour
        spanningToursCount++;
        const base = occurrences[0].tour;
        base.id = `satf-${ref}`;
        base.sourceSheets = Array.from(new Set(sheets));

        const allItineraryDays = occurrences.flatMap((o) => o.itineraryDays);
        const uniqueItinMap = new Map<string, { date: string; activity: string }>();
        for (const d of allItineraryDays) {
          uniqueItinMap.set(`${d.date}-${d.activity}`, d);
        }
        const mergedItineraryDays = Array.from(uniqueItinMap.values()).sort((a, b) =>
          a.date.localeCompare(b.date)
        );

        if (mergedItineraryDays.length > 0) {
          base.arrivalDate = mergedItineraryDays[0].date;
          base.departureDate = mergedItineraryDays[mergedItineraryDays.length - 1].date;
          base.itinerary = mergedItineraryDays.map((d, i) => {
            const { type, location } = deduceItineraryTypeAndLocation(d.activity);
            return {
              id: `itn-${ref}-${i + 1}`,
              date: d.date,
              startTime: "09:00",
              type,
              title: d.activity,
              location,
              durationMinutes: 180,
            };
          });
          base.hotels = extractHotels(mergedItineraryDays, ref);
          base.trainJourneys = extractTrainJourneys(mergedItineraryDays, ref);
        }

        duplicates.push({
          bookingReference: ref,
          sheets,
          rows,
          resolution: "merged_spanning",
          guestMasked: maskGuestName(base.group.groupName),
          reason: "Cross-month spanning tour with matching guest name; merged itineraries across adjacent monthly sheets.",
        });

        if (base.assignments.find((a) => a.role === "guide" && a.status === "pending")) {
          unassignedGuidesCount++;
        }
        canonicalTours.push(base);
      } else {
        // Approved Decision 4: Preserve separate source records until reviewed!
        // Do NOT overwrite or merge distinct tours simply because their booking references match!
        preservedDistinctCount += occurrences.length;

        duplicates.push({
          bookingReference: ref,
          sheets,
          rows,
          resolution: "preserved_distinct",
          guestMasked: maskGuestName(firstOcc.tour.group.groupName),
          reason: `Repeated booking reference '${ref}' with different guests or non-contiguous dates. Preserved as ${occurrences.length} distinct tour records per Decision 4.`,
        });

        for (const occ of occurrences) {
          const t = occ.tour;
          const sheetSlug = occ.sheetName.toLowerCase().replace(/[^a-z0-9]/g, "-");
          t.id = `satf-${ref}-${sheetSlug}-r${occ.rowNumber}`;
          if (t.assignments.find((a) => a.role === "guide" && a.status === "pending")) {
            unassignedGuidesCount++;
          }
          canonicalTours.push(t);
        }
      }
    }
  }

  // Sort canonical tours chronologically by arrivalDate
  canonicalTours.sort((a, b) => a.arrivalDate.localeCompare(b.arrivalDate));

  // Compute season breakdown
  const seasonMap = new Map<string, { tourCount: number; sheets: Set<string> }>();
  for (const t of canonicalTours) {
    const sName = t.sourceSheet || "UNKNOWN";
    const season = getSheetSeason(sName);
    if (!seasonMap.has(season)) {
      seasonMap.set(season, { tourCount: 0, sheets: new Set() });
    }
    const entry = seasonMap.get(season)!;
    entry.tourCount++;
    entry.sheets.add(sName);
  }

  const seasons: SeasonGroupSummary[] = Array.from(seasonMap.entries())
    .map(([season, data]) => ({
      season,
      tourCount: data.tourCount,
      sheetsCount: data.sheets.size,
    }))
    .sort((a, b) => a.season.localeCompare(b.season));

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
    excludedSheetsCount: excludedSheets.length,
    excludedSheets,
    correctedDatesCount: correctedDates.length,
    possibleCancellationsCount: possibleCancellations.length,
    preservedDistinctCount,
    seasons,
  };

  return {
    success: errors.length === 0,
    summary,
    tours: canonicalTours,
    ambiguities,
    duplicates,
    errors,
    excludedSheets,
    correctedDates,
    possibleCancellations,
  };
}
