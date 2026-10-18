"use client";

import { useState, useMemo, useSyncExternalStore } from "react";
import {
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Plane,
  UserCheck,
  Layers,
} from "lucide-react";
import {
  PageContainer,
  Card,
  CardHeader,
  CardFooter,
  Badge,
} from "@/components/ui/Primitives";
import type { Tour, TourStatus } from "@/lib/types";
import {
  subscribeSessionStore,
  getSessionSnapshot,
  getServerSnapshot,
  mergeSessionTours,
  parseSessionSnapshot,
} from "@/lib/session-store";
import { cn } from "@/components/ui/utils";
import { sanitizeCsvCell } from "@/lib/utils";

export interface ReportsViewProps {
  initialTours: Tour[];
  referenceDate: string;
}

type ReportType =
  | "tours_summary"
  | "flight_manifest"
  | "resource_allocations"
  | "open_blockers";

interface ReportTab {
  id: ReportType;
  title: string;
  description: string;
  icon: React.ElementType;
}

const REPORT_TABS: ReportTab[] = [
  {
    id: "tours_summary",
    title: "Tours Master Summary",
    description: "Operational status, passenger counts, itineraries, and assigned staff for all circuits.",
    icon: Layers,
  },
  {
    id: "flight_manifest",
    title: "Flight & Transfer Manifest",
    description: "Airport arrival and departure schedules, flight numbers, terminals, and transport dispatch.",
    icon: Plane,
  },
  {
    id: "resource_allocations",
    title: "Resource Allocations Roster",
    description: "Assigned guides, chauffeurs, and vehicle fleet allocations across active bookings.",
    icon: UserCheck,
  },
  {
    id: "open_blockers",
    title: "Operational Issues & Blockers",
    description: "Audit list of pending operational hurdles, hotel vouchers, and unresolved alerts.",
    icon: AlertCircle,
  },
];

function triggerCsvDownload(
  headers: string[],
  rows: (string | number | undefined | null)[][],
  filename: string
) {
  const content = [
    headers.map(sanitizeCsvCell).join(","),
    ...rows.map((row) => row.map(sanitizeCsvCell).join(",")),
  ].join("\r\n");

  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ReportsView({ initialTours, referenceDate }: ReportsViewProps) {
  const sessionRaw = useSyncExternalStore(
    subscribeSessionStore,
    getSessionSnapshot,
    getServerSnapshot
  );

  const sessionState = useMemo(() => {
    return parseSessionSnapshot(sessionRaw);
  }, [sessionRaw]);

  const tours = useMemo(() => {
    return mergeSessionTours(initialTours, sessionState.tours);
  }, [initialTours, sessionState.tours]);

  const [activeReport, setActiveReport] = useState<ReportType>("tours_summary");
  const [statusFilter, setStatusFilter] = useState<TourStatus | "all">("all");
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  // Filtered tours based on status selection
  const filteredTours = useMemo(() => {
    if (statusFilter === "all") return tours;
    return tours.filter((t) => t.status === statusFilter);
  }, [tours, statusFilter]);

  // Report 1: Tours Master Summary
  const toursSummaryData = useMemo(() => {
    const headers = [
      "Booking Reference",
      "Tour Group Name",
      "Nationality",
      "Total Pax",
      "Arrival Date",
      "Departure Date",
      "Circuit Destination",
      "Tour Status",
      "Assigned Guide",
      "Vehicle Type",
      "Assigned Driver",
      "Open Blockers Count",
    ];

    const rows = filteredTours.map((t) => {
      const guide = t.assignments.find((a) => a.role === "guide")?.name || "Unassigned";
      const vehicle = t.assignments.find((a) => a.role === "vehicle")?.vehicleType || "TBD";
      const driver = t.assignments.find((a) => a.role === "driver")?.name || "Unassigned";
      const blockers = t.issues?.filter((i) => !i.resolved).length || 0;
      const pax = t.group.adultCount + t.group.childCount;

      return [
        t.bookingReference,
        t.group.groupName,
        t.group.nationality,
        pax,
        t.arrivalDate,
        t.departureDate,
        t.destination,
        t.status.toUpperCase(),
        guide,
        vehicle,
        driver,
        blockers,
      ];
    });

    return { headers, rows };
  }, [filteredTours]);

  // Report 2: Flight & Transfer Manifest
  const flightManifestData = useMemo(() => {
    const headers = [
      "Movement Type",
      "Date",
      "Flight Number",
      "Airline",
      "Terminal",
      "Time (Arrival/Departure)",
      "Tour Ref",
      "Group Name",
      "Total Guests",
      "Destination / Route",
      "Allocated Driver",
      "Vehicle Plate / Type",
      "Tour Status",
    ];

    const rows: (string | number | undefined | null)[][] = [];

    filteredTours.forEach((t) => {
      const pax = t.group.adultCount + t.group.childCount;
      const driver = t.assignments.find((a) => a.role === "driver")?.name || "Pending";
      const vehicle = t.assignments.find((a) => a.role === "vehicle")?.vehicleType || "Pending";

      t.flights.forEach((f) => {
        rows.push([
          f.direction.toUpperCase(),
          f.date,
          f.flightNumber,
          f.airline || "Scheduled Carrier",
          f.terminal || "T3",
          f.direction === "arrival" ? f.arrivalTime || "TBD" : f.departureTime || "TBD",
          t.bookingReference,
          t.group.groupName,
          pax,
          t.destination,
          driver,
          vehicle,
          t.status.toUpperCase(),
        ]);
      });
    });

    // Sort by date ascending
    rows.sort((a, b) => String(a[1]).localeCompare(String(b[1])));

    return { headers, rows };
  }, [filteredTours]);

  // Report 3: Resource Allocations Roster
  const resourceAllocationsData = useMemo(() => {
    const headers = [
      "Resource Role",
      "Assigned Name",
      "Contact Number",
      "Registration / Model",
      "Allocation Status",
      "Tour Reference",
      "Group Name",
      "Circuit Dates",
      "Destination",
      "Tour Status",
    ];

    const rows: (string | number | undefined | null)[][] = [];

    filteredTours.forEach((t) => {
      t.assignments.forEach((a) => {
        rows.push([
          a.role.toUpperCase(),
          a.role === "vehicle" ? a.vehicleType || "TBD" : a.name || "Pending",
          a.contact || "—",
          a.reference || (a.vehicleType ? a.vehicleType : "—"),
          a.status.toUpperCase(),
          t.bookingReference,
          t.group.groupName,
          `${t.arrivalDate} to ${t.departureDate}`,
          t.destination,
          t.status.toUpperCase(),
        ]);
      });
    });

    return { headers, rows };
  }, [filteredTours]);

  // Report 4: Open Operational Issues & Blockers
  const openBlockersData = useMemo(() => {
    const headers = [
      "Tour Reference",
      "Group Name",
      "Tour Status",
      "Issue Category",
      "Issue Description",
      "Resolution Status",
      "Resolution Notes",
    ];

    const rows: (string | number | undefined | null)[][] = [];

    filteredTours.forEach((t) => {
      t.issues?.forEach((i) => {
        rows.push([
          t.bookingReference,
          t.group.groupName,
          t.status.toUpperCase(),
          i.category.toUpperCase(),
          i.description,
          i.resolved ? "RESOLVED" : "OPEN ACTION REQUIRED",
          i.resolutionNotes || "—",
        ]);
      });
    });

    return { headers, rows };
  }, [filteredTours]);

  // Active data bundle
  const currentReportData = useMemo(() => {
    switch (activeReport) {
      case "tours_summary":
        return toursSummaryData;
      case "flight_manifest":
        return flightManifestData;
      case "resource_allocations":
        return resourceAllocationsData;
      case "open_blockers":
        return openBlockersData;
    }
  }, [
    activeReport,
    toursSummaryData,
    flightManifestData,
    resourceAllocationsData,
    openBlockersData,
  ]);

  function handleExportCsv() {
    const filename = `satf_${activeReport}_${referenceDate}.csv`;
    triggerCsvDownload(
      currentReportData.headers,
      currentReportData.rows,
      filename
    );
    setDownloadSuccess(`Generated ${filename} (${currentReportData.rows.length} rows).`);
    setTimeout(() => setDownloadSuccess(null), 4000);
  }

  return (
    <PageContainer>
      {/* Session storage alert */}
      {sessionState.status === "error" && (
        <div
          role="alert"
          className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-2.5 text-xs font-medium text-amber-900 flex items-center gap-2 shadow-xs"
        >
          <AlertTriangle size={16} className="text-amber-600 shrink-0" />
          <span>
            <strong>Storage Warning:</strong> Could not retrieve saved session modifications ({sessionState.error}). Showing baseline operational report data.
          </span>
        </div>
      )}

      {/* Success banner */}
      {downloadSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2 text-xs font-medium text-emerald-800 flex items-center gap-2 shadow-xs">
          <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
          <span>{downloadSuccess}</span>
        </div>
      )}

      {/* ── Report Selector Header ─────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200/90 rounded-lg p-3.5 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Operational Reporting & Manifest Center
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Select an operational data view to inspect or export RFC 4180-compliant CSV manifests for field teams.
            </p>
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 shrink-0 self-start sm:self-auto"
          >
            <Download size={13} />
            <span>Export to CSV</span>
          </button>
        </div>

        {/* Report tabs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-2 border-t border-slate-100">
          {REPORT_TABS.map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeReport === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveReport(tab.id)}
                className={cn(
                  "p-2.5 rounded-lg border text-left transition-all flex items-start gap-2.5",
                  isSelected
                    ? "bg-blue-50/70 border-blue-400 ring-1 ring-blue-400"
                    : "bg-slate-50/60 border-slate-200 hover:bg-white hover:border-slate-300"
                )}
              >
                <div
                  className={cn(
                    "p-1.5 rounded-md shrink-0 mt-0.5",
                    isSelected ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600"
                  )}
                >
                  <Icon size={14} />
                </div>
                <div className="min-w-0">
                  <h3
                    className={cn(
                      "text-xs font-bold truncate",
                      isSelected ? "text-blue-900" : "text-slate-800"
                    )}
                  >
                    {tab.title}
                  </h3>
                  <p className="text-[10px] text-slate-500 line-clamp-2 mt-0.5 leading-snug">
                    {tab.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Filter controls */}
        <div className="flex items-center justify-between pt-1 text-xs border-t border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Filter Status:
            </span>
            <div className="flex items-center gap-1">
              {(["all", "active", "upcoming", "attention", "completed", "cancelled"] as const).map(
                (st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={cn(
                      "px-2 py-0.5 rounded text-[11px] font-semibold capitalize transition-colors",
                      statusFilter === st
                        ? "bg-slate-900 text-white shadow-xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    )}
                  >
                    {st}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="text-[11px] text-slate-400 font-mono hidden sm:inline">
            Active Dataset: {currentReportData.rows.length} rows
          </div>
        </div>
      </div>

      {/* ── Table Preview Card ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="bg-slate-50/50 py-2.5 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={15} className="text-blue-600" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              {REPORT_TABS.find((t) => t.id === activeReport)?.title} Preview
            </h2>
            <Badge variant="neutral" className="font-mono text-[10px]">
              {currentReportData.rows.length} entries
            </Badge>
          </div>

          <span className="text-[11px] text-slate-400 font-mono">
            RFC 4180 Format Ready
          </span>
        </CardHeader>

        {currentReportData.rows.length === 0 ? (
          <div className="p-8 text-center">
            <FileSpreadsheet size={28} className="text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-700">No records found for current filter</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Switch status filter to &quot;all&quot; to inspect all records.</p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[520px]">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50/90 text-slate-600 text-[11px] uppercase font-bold tracking-wider border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  {currentReportData.headers.map((h, i) => (
                    <th key={i} className="py-2.5 px-3 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentReportData.rows.map((row, rowIdx) => (
                  <tr key={rowIdx} className="hover:bg-slate-50/80 transition-colors">
                    {row.map((cell, cellIdx) => (
                      <td
                        key={cellIdx}
                        className={cn(
                          "py-2 px-3 whitespace-nowrap",
                          cellIdx === 0 && "font-mono font-bold text-slate-900"
                        )}
                      >
                        {cell === undefined || cell === null || cell === "" ? "—" : String(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <CardFooter className="flex items-center justify-between text-xs text-slate-500">
          <span>Clicking &quot;Export to CSV&quot; exports all {currentReportData.rows.length} rows directly.</span>
          <span className="text-[11px] font-mono text-slate-400">SATF Operations Manifest</span>
        </CardFooter>
      </Card>
    </PageContainer>
  );
}
