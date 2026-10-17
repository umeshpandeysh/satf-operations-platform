import { NextResponse } from "next/server";
import { getCanonicalDataset } from "@/lib/canonical-store";

export const dynamic = "force-dynamic";

function escapeCSV(val: unknown): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

export async function GET() {
  try {
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
        escapeCSV(t.bookingReference),
        escapeCSV(t.group.groupName),
        escapeCSV(t.group.adultCount),
        escapeCSV(t.agency || ""),
        escapeCSV(t.packageCode || ""),
        escapeCSV(t.sourceSheet || ""),
        escapeCSV(t.sourceRow || ""),
        escapeCSV(t.sourceSheets?.join(", ") || ""),
        escapeCSV(t.rawArrivalSerial || ""),
        escapeCSV(t.arrivalDate),
        escapeCSV(t.departureDate),
        escapeCSV(t.destination),
        escapeCSV(guide),
        escapeCSV(vehicle),
        escapeCSV(t.hasDateAmbiguity ? "YES" : "NO"),
        escapeCSV(t.dateAmbiguityReason || ""),
        escapeCSV(t.operationalNotes || ""),
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
