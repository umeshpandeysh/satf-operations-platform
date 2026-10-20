import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { parseExcelWorkbook } from "@/lib/excel-parser";
import { sanitizeCsvCell } from "@/lib/utils";
import { maskGuestName } from "@/lib/operations";
import { authenticateOperatorRequest } from "@/lib/auth";
import type { ImportPreviewResult, DateAmbiguity } from "@/lib/types";

export const dynamic = "force-dynamic";

export function generateDecisionSheetCsv(
  ambiguities: DateAmbiguity[],
  tours: ImportPreviewResult["tours"]
): string {
  const headers = [
    "Booking Reference",
    "Guest (Masked)",
    "Source Sheet",
    "Source Row",
    "Source Record ID",
    "Raw Excel Date",
    "Proposed Date",
    "Confirmed Date (YYYY-MM-DD)",
    "Decision (confirm_inferred/override)",
    "Coordinator Notes",
  ];

  const rows = ambiguities.map((item) => {
    const matchingTour = tours.find(
      (t) =>
        (item.sourceRecordId && t.sourceRecordId === item.sourceRecordId) ||
        t.bookingReference.toLowerCase() === item.bookingReference.toLowerCase()
    );
    const guestMasked =
      item.guestMasked ||
      (matchingTour ? maskGuestName(matchingTour.group.groupName) : "Guest");
    const proposedDate = matchingTour?.arrivalDate || "";

    return [
      sanitizeCsvCell(item.bookingReference),
      sanitizeCsvCell(guestMasked),
      sanitizeCsvCell(item.sheet),
      sanitizeCsvCell(item.row),
      sanitizeCsvCell(item.sourceRecordId || ""),
      sanitizeCsvCell(String(item.rawSerial ?? "")),
      sanitizeCsvCell(proposedDate),
      '""', // Blank confirmed date
      '""', // Blank decision field
      '""', // Blank coordinator notes
    ].join(",");
  });

  return [headers.map(sanitizeCsvCell).join(","), ...rows].join("\r\n");
}

export async function GET(req: NextRequest) {
  try {
    const auth = authenticateOperatorRequest(req, { checkCsrf: false });
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    const stagedPath = path.resolve(
      process.cwd(),
      "data/source/NEW CHART 2025-2026 (1).xls"
    );
    if (!fs.existsSync(stagedPath)) {
      return NextResponse.json(
        { success: false, error: "Staged workbook not found." },
        { status: 404 }
      );
    }

    const buffer = fs.readFileSync(stagedPath);
    const preview = parseExcelWorkbook(buffer);
    const csvContent = generateDecisionSheetCsv(preview.ambiguities, preview.tours);

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="satf-date-ambiguities-decision-sheet.csv"',
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (err) {
    console.error("Decision sheet export error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
