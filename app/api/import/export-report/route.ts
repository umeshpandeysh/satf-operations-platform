import { NextRequest, NextResponse } from "next/server";
import { getCanonicalDataset } from "@/lib/canonical-store";
import { sanitizeCsvCell } from "@/lib/utils";
import { authenticateOperatorRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = authenticateOperatorRequest(req, { checkCsrf: false });
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    const dataset = getCanonicalDataset();
    if (!dataset || dataset.tours.length === 0) {
      return NextResponse.json(
        { error: "No canonical dataset imported yet." },
        { status: 404 }
      );
    }

    const headers = [
      "Booking Reference",
      "Guest Name",
      "Pax",
      "Agency",
      "Package",
      "Source Sheet",
      "Source Row",
      "Source Sheets (Spanning)",
      "Raw Arrival Serial",
      "Arrival Date",
      "Departure Date",
      "Destination Circuit",
      "Assigned Guide",
      "Assigned Vehicle",
      "Has Date Ambiguity",
      "Date Ambiguity Reason",
      "Operational Notes",
    ];

    const rows = dataset.tours.map((t) => {
      const guide = t.assignments.find((a) => a.role === "guide")?.name || "Unassigned";
      const vehicle = t.assignments.find((a) => a.role === "vehicle")?.notes || "Unassigned";
      return [
        sanitizeCsvCell(t.bookingReference),
        sanitizeCsvCell(t.group.groupName),
        sanitizeCsvCell(t.group.adultCount),
        sanitizeCsvCell(t.agency || ""),
        sanitizeCsvCell(t.packageCode || ""),
        sanitizeCsvCell(t.sourceSheet || ""),
        sanitizeCsvCell(t.sourceRow || ""),
        sanitizeCsvCell(t.sourceSheets?.join(", ") || ""),
        sanitizeCsvCell(t.rawArrivalSerial || ""),
        sanitizeCsvCell(t.arrivalDate),
        sanitizeCsvCell(t.departureDate),
        sanitizeCsvCell(t.destination),
        sanitizeCsvCell(guide),
        sanitizeCsvCell(vehicle),
        sanitizeCsvCell(t.hasDateAmbiguity ? "YES" : "NO"),
        sanitizeCsvCell(t.dateAmbiguityReason || ""),
        sanitizeCsvCell(t.operationalNotes || ""),
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\r\n");

    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="SATF_Reconciliation_Report.csv"',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
