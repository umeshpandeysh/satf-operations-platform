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
  Search,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Users,
  Calendar,
} from "lucide-react";
import {
  PageContainer,
  Card,
  CardHeader,
  CardContent,
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
import { sanitizeCsvCell, formatDate } from "@/lib/utils";
import { useLanguage } from "@/lib/i18n";

export interface ReportsViewProps {
  initialTours: Tour[];
  referenceDate: string;
  embedded?: boolean;
}

type ReportType =
  | "tours_summary"
  | "flight_manifest"
  | "resource_allocations"
  | "open_blockers";

interface ReportTab {
  id: ReportType;
  titleKey: string;
  defaultTitle: string;
  descKey: string;
  defaultDesc: string;
  icon: React.ElementType;
}

const REPORT_TABS_CONFIG: ReportTab[] = [
  {
    id: "tours_summary",
    titleKey: "reports.tab_summary",
    defaultTitle: "Tours Master Summary",
    descKey: "reports.tab_summary_desc",
    defaultDesc: "Operational status, passenger counts, itineraries, and assigned staff for all circuits.",
    icon: Layers,
  },
  {
    id: "flight_manifest",
    titleKey: "reports.tab_manifest",
    defaultTitle: "Flight & Transfer Manifest",
    descKey: "reports.tab_manifest_desc",
    defaultDesc: "Airport arrival and departure schedules, flight numbers, terminals, and transport dispatch.",
    icon: Plane,
  },
  {
    id: "resource_allocations",
    titleKey: "reports.tab_allocations",
    defaultTitle: "Resource Allocations Roster",
    descKey: "reports.tab_allocations_desc",
    defaultDesc: "Assigned guides, chauffeurs, and vehicle fleet allocations across active bookings.",
    icon: UserCheck,
  },
  {
    id: "open_blockers",
    titleKey: "reports.tab_blockers",
    defaultTitle: "Operational Issues & Blockers",
    descKey: "reports.tab_blockers_desc",
    defaultDesc: "Audit list of pending operational hurdles, hotel vouchers, and unresolved alerts.",
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

export function ReportsView({ initialTours, referenceDate, embedded }: ReportsViewProps) {
  const { t, language } = useLanguage();
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
  const [yearFilter, setYearFilter] = useState<string>("current");
  const [statusFilter, setStatusFilter] = useState<TourStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  const availableYears = useMemo(() => {
    const yrs = new Set<string>();
    tours.forEach((t) => {
      if (t.arrivalDate) yrs.add(t.arrivalDate.slice(0, 4));
      if (t.departureDate) yrs.add(t.departureDate.slice(0, 4));
    });
    return Array.from(yrs).filter(Boolean).sort().reverse();
  }, [tours]);

  // Operational year subset (defaults to current 2025-2026 operations)
  const yearTours = useMemo(() => {
    if (yearFilter === "all") return tours;
    return tours.filter((tour) => {
      const arrY = tour.arrivalDate?.slice(0, 4);
      const depY = tour.departureDate?.slice(0, 4);
      if (yearFilter === "current") {
        return arrY === "2025" || arrY === "2026" || depY === "2025" || depY === "2026";
      }
      return arrY === yearFilter || depY === yearFilter;
    });
  }, [tours, yearFilter]);

  // Overall Operational Metrics Calculations scoped to selected period
  const metrics = useMemo(() => {
    const totalTours = yearTours.length;
    let totalPax = 0;
    let staffedCount = 0;
    let totalFlights = 0;

    const statusCounts: Record<TourStatus, number> = {
      active: 0,
      upcoming: 0,
      attention: 0,
      completed: 0,
      cancelled: 0,
    };

    yearTours.forEach((t) => {
      totalPax += t.group.adultCount + t.group.childCount;
      if (statusCounts[t.status] !== undefined) {
        statusCounts[t.status]++;
      }
      const hasGuide = t.assignments.some((a) => a.role === "guide" && a.name);
      const hasDriver = t.assignments.some((a) => a.role === "driver" && a.name);
      if (hasGuide || hasDriver) {
        staffedCount++;
      }
      totalFlights += t.flights.length;
    });

    const staffingRate = totalTours > 0 ? Math.round((staffedCount / totalTours) * 100) : 0;

    return {
      totalTours,
      totalPax,
      staffingRate,
      totalFlights,
      statusCounts,
    };
  }, [yearTours]);

  // Filtered tours based on status selection
  const filteredTours = useMemo(() => {
    if (statusFilter === "all") return yearTours;
    return yearTours.filter((t) => t.status === statusFilter);
  }, [yearTours, statusFilter]);

  // Report 1: Tours Master Summary
  const toursSummaryData = useMemo(() => {
    const headers = [
      language === "ja" ? "予約番号" : "Booking Reference",
      language === "ja" ? "ツアー団体名" : "Tour Group Name",
      language === "ja" ? "国籍" : "Nationality",
      language === "ja" ? "人数 (Pax)" : "Total Pax",
      language === "ja" ? "到着日" : "Arrival Date",
      language === "ja" ? "出発日" : "Departure Date",
      language === "ja" ? "周遊先 / 行程" : "Circuit Destination",
      language === "ja" ? "ステータス" : "Tour Status",
      language === "ja" ? "担当ガイド" : "Assigned Guide",
      language === "ja" ? "車両種別" : "Vehicle Type",
      language === "ja" ? "担当ドライバー" : "Assigned Driver",
      language === "ja" ? "未解決課題" : "Open Blockers",
    ];

    const rows = filteredTours.map((t) => {
      const guide = t.assignments.find((a) => a.role === "guide")?.name || (language === "ja" ? "未配属" : "Unassigned");
      const vehicle = t.assignments.find((a) => a.role === "vehicle")?.vehicleType || "TBD";
      const driver = t.assignments.find((a) => a.role === "driver")?.name || (language === "ja" ? "未配属" : "Unassigned");
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
  }, [filteredTours, language]);

  // Report 2: Flight & Transfer Manifest
  const flightManifestData = useMemo(() => {
    const headers = [
      language === "ja" ? "種別" : "Movement Type",
      language === "ja" ? "日付" : "Date",
      language === "ja" ? "便名" : "Flight Number",
      language === "ja" ? "航空会社" : "Airline",
      language === "ja" ? "ターミナル" : "Terminal",
      language === "ja" ? "発着時刻" : "Scheduled Time",
      language === "ja" ? "予約番号" : "Tour Ref",
      language === "ja" ? "団体名" : "Group Name",
      language === "ja" ? "人数" : "Pax",
      language === "ja" ? "行先" : "Destination",
      language === "ja" ? "送迎ドライバー" : "Driver",
      language === "ja" ? "手配車両" : "Vehicle",
      language === "ja" ? "ステータス" : "Tour Status",
    ];

    const rows: (string | number | undefined | null)[][] = [];

    filteredTours.forEach((t) => {
      const pax = t.group.adultCount + t.group.childCount;
      const driver = t.assignments.find((a) => a.role === "driver")?.name || (language === "ja" ? "未配属" : "Pending");
      const vehicle = t.assignments.find((a) => a.role === "vehicle")?.vehicleType || (language === "ja" ? "未配属" : "Pending");

      t.flights.forEach((f) => {
        rows.push([
          f.direction === "arrival" ? (language === "ja" ? "到着" : "ARRIVAL") : (language === "ja" ? "出発" : "DEPARTURE"),
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
  }, [filteredTours, language]);

  // Report 3: Resource Allocations Roster
  const resourceAllocationsData = useMemo(() => {
    const headers = [
      language === "ja" ? "役割" : "Resource Role",
      language === "ja" ? "担当者名 / 車両" : "Assigned Name",
      language === "ja" ? "連絡先" : "Contact Number",
      language === "ja" ? "参照ID / 登録番号" : "Reference",
      language === "ja" ? "配属状態" : "Allocation Status",
      language === "ja" ? "予約番号" : "Tour Ref",
      language === "ja" ? "団体名" : "Group Name",
      language === "ja" ? "日程" : "Circuit Dates",
      language === "ja" ? "行先" : "Destination",
      language === "ja" ? "ステータス" : "Tour Status",
    ];

    const rows: (string | number | undefined | null)[][] = [];

    filteredTours.forEach((t) => {
      t.assignments.forEach((a) => {
        rows.push([
          a.role === "guide" ? (language === "ja" ? "ガイド" : "GUIDE") : a.role === "driver" ? (language === "ja" ? "ドライバー" : "DRIVER") : (language === "ja" ? "車両" : "VEHICLE"),
          a.role === "vehicle" ? a.vehicleType || "TBD" : a.name || (language === "ja" ? "未指定" : "Pending"),
          a.contact || "—",
          a.reference || (a.vehicleType ? a.vehicleType : "—"),
          a.status.toUpperCase(),
          t.bookingReference,
          t.group.groupName,
          `${t.arrivalDate} ~ ${t.departureDate}`,
          t.destination,
          t.status.toUpperCase(),
        ]);
      });
    });

    return { headers, rows };
  }, [filteredTours, language]);

  // Report 4: Open Operational Issues & Blockers
  const openBlockersData = useMemo(() => {
    const headers = [
      language === "ja" ? "予約番号" : "Tour Reference",
      language === "ja" ? "団体名" : "Group Name",
      language === "ja" ? "ステータス" : "Tour Status",
      language === "ja" ? "課題分類" : "Issue Category",
      language === "ja" ? "課題詳細" : "Issue Description",
      language === "ja" ? "対応状態" : "Resolution Status",
      language === "ja" ? "対応記録" : "Resolution Notes",
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
          i.resolved ? (language === "ja" ? "解決済" : "RESOLVED") : (language === "ja" ? "要対応" : "OPEN ACTION REQUIRED"),
          i.resolutionNotes || "—",
        ]);
      });
    });

    return { headers, rows };
  }, [filteredTours, language]);

  // Active raw data bundle
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

  // Apply search query filter across rows
  const searchedRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return currentReportData.rows;
    return currentReportData.rows.filter((row) =>
      row.some((cell) => cell !== undefined && cell !== null && String(cell).toLowerCase().includes(q))
    );
  }, [currentReportData.rows, searchQuery]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(searchedRows.length / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const paginatedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return searchedRows.slice(start, start + pageSize);
  }, [searchedRows, safePage, pageSize]);

  function handleExportCsv() {
    const filename = `satf_${activeReport}_${referenceDate}.csv`;
    triggerCsvDownload(
      currentReportData.headers,
      searchedRows,
      filename
    );
    setDownloadSuccess(
      language === "ja"
        ? `${filename} を出力しました (${searchedRows.length} 件)。`
        : `Generated ${filename} (${searchedRows.length} rows).`
    );
    setTimeout(() => setDownloadSuccess(null), 4000);
  }

  const content = (
    <div className="space-y-6">
      {/* Session storage alert */}
      {sessionState.status === "error" && (
        <div
          role="alert"
          className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-2.5 text-xs font-medium text-amber-900 flex items-center gap-2 shadow-xs"
        >
          <AlertTriangle size={16} className="text-amber-600 shrink-0" />
          <span>
            <strong>{language === "ja" ? "ストレージ注意:" : "Storage Warning:"}</strong>{" "}
            {language === "ja"
              ? "セッション保存データの読込に失敗しました。基準データを表示しています。"
              : `Could not retrieve saved session modifications (${sessionState.error}). Showing baseline operational report data.`}
          </span>
        </div>
      )}

      {/* Success banner */}
      {downloadSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5 text-xs font-medium text-emerald-800 flex items-center gap-2 shadow-xs animate-in fade-in">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{downloadSuccess}</span>
        </div>
      )}

      {/* ── Operational Scope Selector Banner ─────────────────────────────────── */}
      <div className="bg-white surface-card border border-slate-200/90 rounded-xl p-3 sm:px-4 sm:py-3.5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Calendar size={18} className="text-[#244d70] shrink-0" />
          <div className="flex flex-col">
            <span className="text-xs font-bold text-slate-800">
              {language === "ja" ? "集計対象期間・年度スコープ" : "Operational Reporting Scope"}
            </span>
            <span className="text-[11px] text-slate-500">
              {language === "ja"
                ? `運行基準日: ${formatDate(referenceDate)} (Asia/Kolkata)`
                : `Base Reference Date: ${formatDate(referenceDate)} (Asia/Kolkata)`}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            {language === "ja" ? "期間選択:" : "Period:"}
          </span>
          <select
            value={yearFilter}
            onChange={(e) => {
              setYearFilter(e.target.value);
              setCurrentPage(1);
            }}
            aria-label="Filter analytics by operational period"
            className="bg-slate-50 border border-slate-300 rounded-md px-3 py-1.5 text-xs text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-[#244d70]/20 focus:border-[#244d70] cursor-pointer shadow-2xs"
          >
            <option value="current">
              {language === "ja" ? "現行運行 (2025–2026)" : "Current Operations (2025–2026)"}
            </option>
            <option value="all">
              {language === "ja" ? "全年度・全記録 (2016–2026)" : "All Years (Complete Archive)"}
            </option>
            {availableYears.map((yr) => (
              <option key={yr} value={yr}>
                {yr}{language === "ja" ? "年度" : " Operations"}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Executive Operational Metrics Header ───────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="border-slate-200/90 surface-card bg-white shadow-2xs hover:shadow-xs transition-all">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {t("reports.total_tours")}
              </span>
              <div className="w-7 h-7 rounded-lg bg-[#dcecf7]/60 flex items-center justify-center">
                <Layers size={15} className="text-[#244d70]" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-[#172d43] font-mono tracking-tight">
              {metrics.totalTours.toLocaleString()}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {language === "ja" ? "手配確定済み全ツアー台帳" : "Confirmed operational records"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200/90 surface-card bg-white shadow-2xs hover:shadow-xs transition-all">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {t("reports.total_pax")}
              </span>
              <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
                <Users size={15} className="text-emerald-600" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-emerald-800 font-mono tracking-tight">
              {metrics.totalPax.toLocaleString()}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {language === "ja" ? "大人・子供総手配人数" : "Adults & children traveling"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200/90 surface-card bg-white shadow-2xs hover:shadow-xs transition-all">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {t("reports.staffing_rate")}
              </span>
              <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center">
                <UserCheck size={15} className="text-indigo-600" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-indigo-800 font-mono tracking-tight">
              {metrics.staffingRate}%
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {language === "ja" ? "ガイド・ドライバー手配充足率" : "Guide & chauffeur allocation"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200/90 surface-card bg-white shadow-2xs hover:shadow-xs transition-all">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {t("reports.flight_transfers")}
              </span>
              <div className="w-7 h-7 rounded-lg bg-sky-50 flex items-center justify-center">
                <Plane size={15} className="text-sky-600" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-sky-800 font-mono tracking-tight">
              {metrics.totalFlights.toLocaleString()}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {language === "ja" ? "登録済発着送迎フライト" : "Coordinated inbound/outbound legs"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Operational Status Distribution Bar ────────────────────────────── */}
      <Card className="border-slate-200/90 surface-card bg-white shadow-2xs">
        <CardContent className="p-4 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
            <span className="font-bold text-slate-800 flex items-center gap-1.5">
              <TrendingUp size={14} className="text-[#244d70]" />
              <span>{t("reports.status_distribution")}</span>
            </span>
            <span className="text-[11px] text-slate-500">
              {language === "ja" ? "運行ステータス別構成比" : "Proportional breakdown across dataset"}
            </span>
          </div>

          {/* Proportional Stacked Bar */}
          <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden flex">
            {metrics.totalTours > 0 && (
              <>
                <div
                  style={{ width: `${(metrics.statusCounts.upcoming / metrics.totalTours) * 100}%` }}
                  className="bg-[#244d70] h-full transition-all"
                  title={`Upcoming: ${metrics.statusCounts.upcoming}`}
                />
                <div
                  style={{ width: `${(metrics.statusCounts.active / metrics.totalTours) * 100}%` }}
                  className="bg-emerald-500 h-full transition-all"
                  title={`Active: ${metrics.statusCounts.active}`}
                />
                <div
                  style={{ width: `${(metrics.statusCounts.attention / metrics.totalTours) * 100}%` }}
                  className="bg-amber-500 h-full transition-all"
                  title={`Attention: ${metrics.statusCounts.attention}`}
                />
                <div
                  style={{ width: `${(metrics.statusCounts.completed / metrics.totalTours) * 100}%` }}
                  className="bg-slate-400 h-full transition-all"
                  title={`Completed: ${metrics.statusCounts.completed}`}
                />
                <div
                  style={{ width: `${(metrics.statusCounts.cancelled / metrics.totalTours) * 100}%` }}
                  className="bg-rose-500 h-full transition-all"
                  title={`Cancelled: ${metrics.statusCounts.cancelled}`}
                />
              </>
            )}
          </div>

          {/* Legend Items */}
          <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-slate-600">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#244d70]" />
              <span>{language === "ja" ? "予定" : "Upcoming"}: <strong>{metrics.statusCounts.upcoming}</strong></span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>{language === "ja" ? "運行中" : "Active"}: <strong>{metrics.statusCounts.active}</strong></span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>{language === "ja" ? "要確認" : "Attention"}: <strong>{metrics.statusCounts.attention}</strong></span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-slate-400" />
              <span>{language === "ja" ? "完了" : "Completed"}: <strong>{metrics.statusCounts.completed}</strong></span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>{language === "ja" ? "キャンセル" : "Cancelled"}: <strong>{metrics.statusCounts.cancelled}</strong></span>
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── Report Type Selector & Action Bar ───────────────────────────────── */}
      <div className="bg-white surface-card border border-slate-200/90 rounded-xl p-4 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              {t("reports.title")}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {t("reports.subtitle")}
            </p>
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={searchedRows.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#244d70] hover:bg-[#1b3b57] rounded-md shadow-2xs btn-press transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#244d70] shrink-0 self-start sm:self-auto disabled:opacity-50"
          >
            <Download size={13} />
            <span>{t("reports.download_csv")}</span>
          </button>
        </div>

        {/* 4 Manifest Types (Flexible grid without text clipping) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-3 border-t border-slate-100">
          {REPORT_TABS_CONFIG.map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeReport === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveReport(tab.id);
                  setCurrentPage(1);
                }}
                className={cn(
                  "p-3 rounded-lg border text-left transition-all flex items-start gap-2.5 min-w-0 cursor-pointer btn-press",
                  isSelected
                    ? "bg-[#dcecf7]/40 border-[#244d70] ring-1 ring-[#244d70] shadow-2xs"
                    : "bg-slate-50/60 border-slate-200/80 hover:bg-white hover:border-slate-300"
                )}
              >
                <div
                  className={cn(
                    "p-1.5 rounded-md shrink-0 mt-0.5 transition-colors",
                    isSelected ? "bg-[#244d70] text-white" : "bg-slate-200 text-slate-600"
                  )}
                >
                  <Icon size={15} />
                </div>
                <div className="min-w-0 flex-1">
                  <h2
                    className={cn(
                      "text-xs font-bold break-words",
                      isSelected ? "text-[#172d43]" : "text-slate-800"
                    )}
                  >
                    {t(tab.titleKey)}
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug break-words">
                    {t(tab.descKey)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-3 border-t border-slate-100">
          {/* Status Filter Chips (flex-wrap) */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-1">
              {t("reports.filter_status")}
            </span>
            {(["all", "active", "upcoming", "attention", "completed", "cancelled"] as const).map(
              (st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => {
                    setStatusFilter(st);
                    setCurrentPage(1);
                  }}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-[11px] font-semibold capitalize transition-all cursor-pointer btn-press",
                    statusFilter === st
                      ? "bg-[#244d70] text-white shadow-2xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  )}
                >
                  {st === "all"
                    ? (language === "ja" ? "すべて" : "All")
                    : st === "active"
                    ? (language === "ja" ? "運行中" : "Active")
                    : st === "upcoming"
                    ? (language === "ja" ? "予定" : "Upcoming")
                    : st === "attention"
                    ? (language === "ja" ? "要確認" : "Attention")
                    : st === "completed"
                    ? (language === "ja" ? "完了" : "Completed")
                    : (language === "ja" ? "キャンセル" : "Cancelled")}
                </button>
              )
            )}
          </div>

          {/* Search Input */}
          <div className="relative w-full md:w-72">
            <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder={t("reports.search_placeholder")}
              className="w-full text-xs pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#244d70]/20 focus:border-[#244d70] shadow-2xs"
            />
          </div>
        </div>
      </div>

      {/* ── Table Preview Card ──────────────────────────────────────────────── */}
      <Card className="border-slate-200/90 surface-card bg-white shadow-2xs">
        <CardHeader className="bg-slate-50/60 py-3 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200">
          <div className="flex items-center gap-2 flex-wrap">
            <FileSpreadsheet size={16} className="text-[#244d70] shrink-0" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              {t(REPORT_TABS_CONFIG.find((t) => t.id === activeReport)?.titleKey || "")} {language === "ja" ? "プレビュー" : "Manifest Preview"}
            </h2>
            <Badge variant="neutral" className="font-mono text-[10px]">
              {searchedRows.length.toLocaleString()} {language === "ja" ? "件" : "entries"}
            </Badge>
          </div>

          <span className="text-[11px] text-slate-500 font-mono">
            {language === "ja" ? "CSVエクスポート対応 (RFC 4180)" : "RFC 4180 Format Ready"}
          </span>
        </CardHeader>

        {searchedRows.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <FileSpreadsheet size={32} className="text-slate-300 mx-auto mb-1" />
            <p className="text-xs font-semibold text-slate-700">{t("reports.empty")}</p>
            <p className="text-[11px] text-slate-500 max-w-sm mx-auto leading-relaxed">
              {searchQuery
                ? (language === "ja" ? `検索ワード「${searchQuery}」に一致する行はありませんでした。` : `No records matched search term "${searchQuery}". Try clearing search.`)
                : (language === "ja" ? "選択したステータスに該当するデータはありません。ステータスを「すべて」に変更してください。" : 'No records match the selected status filter. Select "All" to inspect all tours.')}
            </p>
          </div>
        ) : (
          <div className="relative overflow-x-auto max-h-[560px]">
            <table className="w-full text-xs text-left min-w-[760px]">
              <thead className="bg-slate-50/90 text-slate-600 text-[11px] uppercase font-bold tracking-wider border-b border-slate-200 sticky top-0 z-10 backdrop-blur-xs">
                <tr>
                  {currentReportData.headers.map((h, i) => (
                    <th key={i} className="py-2.5 px-3 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedRows.map((row, rowIdx) => (
                  <tr key={rowIdx} className="hover:bg-slate-50/80 transition-colors">
                    {row.map((cell, cellIdx) => {
                      const isRef = cellIdx === 0;
                      const isStatus = cellIdx === 7 || (activeReport === "open_blockers" && cellIdx === 2);
                      const isPax = cellIdx === 3 && activeReport === "tours_summary";

                      return (
                        <td
                          key={cellIdx}
                          className={cn(
                            "py-2 px-3 text-slate-700",
                            isRef && "font-mono font-bold text-slate-900 whitespace-nowrap",
                            isPax && "font-mono font-semibold text-slate-900 whitespace-nowrap",
                            isStatus && "font-mono text-[10px] font-bold uppercase",
                            !isRef && "break-words max-w-xs"
                          )}
                        >
                          {cell === undefined || cell === null || cell === "" ? (
                            <span className="text-slate-300">—</span>
                          ) : isStatus ? (
                            <span
                              className={cn(
                                "inline-block px-1.5 py-0.5 rounded text-[10px]",
                                String(cell).includes("UPCOMING") && "bg-[#dcecf7]/80 text-[#244d70] border border-[#244d70]/20",
                                String(cell).includes("ACTIVE") && "bg-emerald-50 text-emerald-700 border border-emerald-200",
                                String(cell).includes("ATTENTION") && "bg-amber-50 text-amber-700 border border-amber-200",
                                String(cell).includes("COMPLETED") && "bg-slate-100 text-slate-700",
                                String(cell).includes("CANCELLED") && "bg-rose-50 text-rose-700 border border-rose-200"
                              )}
                            >
                              {String(cell)}
                            </span>
                          ) : (
                            String(cell)
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination & Export Footer */}
        <CardFooter className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500 py-3 px-4 border-t border-slate-200">
          <div className="flex items-center gap-2">
            <span>
              {language === "ja"
                ? `表示中: ${searchedRows.length === 0 ? 0 : (safePage - 1) * pageSize + 1} - ${Math.min(safePage * pageSize, searchedRows.length)} / 全 ${searchedRows.length.toLocaleString()} 行`
                : `Showing ${searchedRows.length === 0 ? 0 : (safePage - 1) * pageSize + 1} to ${Math.min(safePage * pageSize, searchedRows.length)} of ${searchedRows.length.toLocaleString()} entries`}
            </span>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="p-1 rounded bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 disabled:opacity-40 transition-colors"
                aria-label="Previous Page"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="font-mono text-slate-700 text-xs px-2">
                {safePage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="p-1 rounded bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 disabled:opacity-40 transition-colors"
                aria-label="Next Page"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          )}
        </CardFooter>
      </Card>
    </div>
  );

  if (embedded) {
    return content;
  }

  return <PageContainer>{content}</PageContainer>;
}

