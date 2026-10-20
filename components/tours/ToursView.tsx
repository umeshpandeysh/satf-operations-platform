"use client";

import { useState, useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  Search,
  SlidersHorizontal,
  Compass,
  ChevronRight,
  AlertTriangle,
  User,
  Car,
  Calendar,
  X,
  AlertCircle,
  PlusCircle,
  CheckCircle2,
  FileSpreadsheet,
} from "lucide-react";
import {
  PageContainer,
  Card,
  CardHeader,
  CardFooter,
  EmptyState,
  StatusBadge,
  Badge,
} from "@/components/ui/Primitives";
import { CreateTourModal } from "./CreateTourModal";
import { cn } from "@/components/ui/utils";
import type { Tour, TourStatus } from "@/lib/types";
import {
  subscribeSessionStore,
  getSessionSnapshot,
  getServerSnapshot,
  mergeSessionTours,
  parseSessionSnapshot,
} from "@/lib/session-store";
import {
  formatDate,
  formatDateShort,
  nightsBetween,
  relativeDayLabel,
} from "@/lib/utils";
import { useLanguage } from "@/lib/i18n";

export interface ToursViewProps {
  initialTours: Tour[];
  referenceDate: string;
}

export function ToursView({ initialTours, referenceDate }: ToursViewProps) {
  const { t, language } = useLanguage();

  const statusTabs: Array<{ value: TourStatus | "all"; label: string }> = [
    { value: "all", label: t("tours.filter_all") },
    { value: "active", label: t("tours.filter_active") },
    { value: "upcoming", label: t("tours.filter_upcoming") },
    { value: "attention", label: t("tours.filter_attention") },
    { value: "completed", label: t("tours.filter_completed") },
    { value: "cancelled", label: t("tours.filter_cancelled") },
  ];

  const sessionRaw = useSyncExternalStore(
    subscribeSessionStore,
    getSessionSnapshot,
    getServerSnapshot
  );

  const sessionState = useMemo(() => {
    return parseSessionSnapshot(sessionRaw);
  }, [sessionRaw]);

  const sessionTours = sessionState.tours;

  const [createdTours, setCreatedTours] = useState<Tour[]>([]);

  const tours = useMemo(() => {
    const base = mergeSessionTours(initialTours, sessionTours);
    if (createdTours.length === 0) return base;
    const existingIds = new Set(base.map((t) => t.id));
    const newItems = createdTours.filter((t) => !existingIds.has(t.id));
    return [...newItems, ...base];
  }, [initialTours, sessionTours, createdTours]);

  const [searchQuery, setSearchQuery] = useState("");
  const [yearFilter, setYearFilter] = useState<string>("current");
  const [statusFilter, setStatusFilter] = useState<TourStatus | "all">("all");
  const [sheetFilter, setSheetFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const existingReferences = useMemo(() => {
    return tours.map((t) => t.bookingReference);
  }, [tours]);

  const hasImportedTours = useMemo(() => tours.some((t) => t.isImported), [tours]);

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

  const sheets = useMemo(() => {
    const s = new Set<string>();
    yearTours.forEach((t) => {
      if (t.sourceSheet) s.add(t.sourceSheet);
    });
    return Array.from(s).sort();
  }, [yearTours]);

  // Live status counts scoped to selected operational period
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: yearTours.length,
      active: 0,
      upcoming: 0,
      attention: 0,
      completed: 0,
      cancelled: 0,
    };
    yearTours.forEach((t) => {
      if (counts[t.status] !== undefined) {
        counts[t.status]++;
      }
    });
    return counts;
  }, [yearTours]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return yearTours.filter((tour) => {
      const matchesStatus =
        statusFilter === "all" || tour.status === statusFilter;
      const matchesSheet =
        sheetFilter === "all" || tour.sourceSheet === sheetFilter;
      const matchesSearch =
        !q ||
        tour.bookingReference.toLowerCase().includes(q) ||
        tour.group.groupName.toLowerCase().includes(q) ||
        tour.destination.toLowerCase().includes(q) ||
        tour.group.nationality.toLowerCase().includes(q) ||
        (tour.agency && tour.agency.toLowerCase().includes(q)) ||
        tour.assignments.some((a) => a.name?.toLowerCase().includes(q));
      return matchesStatus && matchesSheet && matchesSearch;
    });
  }, [yearTours, searchQuery, statusFilter, sheetFilter]);

  // Sort: active first, upcoming next, attention, completed (most recent arrival date first)
  const sortedTours = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const priority = (s: TourStatus) =>
        s === "active" ? 0 : s === "upcoming" ? 1 : s === "attention" ? 2 : 3;
      const pDiff = priority(a.status) - priority(b.status);
      if (pDiff !== 0) return pDiff;
      return b.arrivalDate.localeCompare(a.arrivalDate);
    });
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(sortedTours.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedTours = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return sortedTours.slice(start, start + pageSize);
  }, [sortedTours, safeCurrentPage, pageSize]);

  return (
    <PageContainer>
      {/* Live operational dataset indicator banner */}
      {hasImportedTours && (
        <div className="bg-emerald-50/80 border border-emerald-200/90 rounded-lg p-3 text-xs text-emerald-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={16} className="text-emerald-600 shrink-0" />
            <span>
              <strong>Active Operational Dataset:</strong> Showing {tours.length} verified tours parsed from SATF Operations Chart. All sheet provenance and raw date serials preserved.
            </span>
          </div>
          <Link
            href="/settings"
            className="font-semibold text-emerald-700 hover:text-emerald-900 underline shrink-0 text-[11px]"
          >
            Manage Import & Reconciliation
          </Link>
        </div>
      )}

      {/* Operational database empty banner */}
      {tours.length === 0 && (
        <div className="bg-blue-50/80 border border-blue-200/90 rounded-lg p-3.5 text-xs text-blue-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-2.5">
            <Compass size={18} className="text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sm text-blue-950">
                Operational Database Empty (0 Active Tours)
              </p>
              <p className="text-blue-800 text-[11px] mt-0.5">
                The database currently contains zero tour records. 1,757 tours from the staged SATF workbook are available in Import Review for date decisions and dry-run reconciliation.
              </p>
            </div>
          </div>
          <Link
            href="/import/review"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-700 hover:bg-blue-800 text-white font-semibold text-xs shrink-0 transition-colors shadow-xs"
          >
            Review Staged Workbook
            <ChevronRight size={13} />
          </Link>
        </div>
      )}

      {/* Session storage read failure alert */}
      {sessionState.status === "error" && (
        <div
          role="alert"
          className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-2.5 text-xs font-medium text-amber-900 flex items-center gap-2 shadow-xs"
        >
          <AlertTriangle size={16} className="text-amber-600 shrink-0" />
          <span>
            <strong>Storage Notice:</strong> Could not retrieve saved modifications ({sessionState.error}). Showing baseline mock tours.
          </span>
        </div>
      )}

      {/* ── Filter & Search Control Panel ───────────────────────────────────── */}
      <div className="bg-white surface-card border border-slate-200/85 rounded-xl p-3.5 shadow-2xs space-y-3 overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              placeholder={t("tours.search_placeholder")}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-8 py-1.5 text-xs bg-slate-50 border border-slate-300/80 rounded-lg text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#244d70] transition-colors"
              aria-label="Filter tours"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setCurrentPage(1);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Operational Period Filter */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              {language === "ja" ? "対象期間:" : "Period:"}
            </span>
            <select
              value={yearFilter}
              onChange={(e) => {
                setYearFilter(e.target.value);
                setCurrentPage(1);
              }}
              aria-label="Filter by operational period"
              className="bg-slate-50 border border-slate-300 rounded px-2.5 py-1 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-[#244d70] cursor-pointer shadow-2xs"
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

          {/* Reference Date Context */}
          <div className="text-right text-[11px] text-slate-500 flex items-center justify-end gap-1.5">
            <Calendar size={13} className="text-slate-400 shrink-0" />
            <span>{language === "ja" ? "運行基準日:" : "Operational Base Date:"}</span>
            <strong className="font-mono text-slate-700">
              {formatDate(referenceDate)}
            </strong>
          </div>
        </div>

        {/* Status filter tabs */}
        <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-slate-100" role="group" aria-label="Status filter">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-1">
            <SlidersHorizontal size={12} />
            <span>{language === "ja" ? "状態:" : "Status:"}</span>
          </div>
          {statusTabs.map((tab) => {
            const count = statusCounts[tab.value] ?? 0;
            const isSelected = statusFilter === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => {
                  setStatusFilter(tab.value as TourStatus | "all");
                  setCurrentPage(1);
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#244d70] btn-press",
                  isSelected
                    ? "bg-[#244d70] text-white shadow-2xs font-semibold"
                    : "bg-slate-100/90 text-slate-600 hover:bg-slate-200/90 hover:text-[#172d43]"
                )}
                aria-pressed={isSelected}
              >
                <span>{tab.label}</span>
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.2 rounded-full tabular-nums font-mono",
                    isSelected
                      ? "bg-white/20 text-white"
                      : "bg-white text-slate-500 border border-slate-200"
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}

          {sheets.length > 0 && (
            <div className="flex items-center gap-1.5 ml-auto pl-2 border-l border-slate-200">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Sheet:</span>
              <select
                value={sheetFilter}
                onChange={(e) => {
                  setSheetFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-slate-50 border border-slate-300 rounded px-2 py-0.5 text-xs text-slate-800 font-mono focus:outline-none focus:ring-1 focus:ring-[#244d70]"
              >
                <option value="all">All Sheets ({sheets.length})</option>
                {sheets.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Feedback banner */}
      {feedbackMessage && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2 text-xs font-medium text-emerald-800 flex items-center gap-2 shadow-xs">
          <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
          <span>{feedbackMessage}</span>
        </div>
      )}

      {/* ── Operational Data Table ─────────────────────────────────────────── */}
      <Card className="overflow-hidden surface-card border-slate-200/90 shadow-2xs">
        <CardHeader className="bg-slate-50/50 py-2.5 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#172d43]">
              {t("tours.active_roster")}
            </h2>
            <Badge variant="neutral" className="font-mono text-[10px]">
              {filtered.length} {language === "ja" ? "件" : filtered.length === 1 ? "record" : "records"}
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-400 hidden sm:inline">
              {language === "ja" ? "行をクリックして詳細を表示" : "Click row to open operations file"}
            </span>
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#244d70] hover:bg-[#1b3b57] rounded-lg shadow-2xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#244d70] btn-press"
            >
              <PlusCircle size={13} />
              <span>{t("tours.new_tour")}</span>
            </button>
          </div>
        </CardHeader>

        {tours.length === 0 ? (
          <EmptyState
            icon={Compass}
            title={language === "ja" ? "運行台帳にデータがありません" : "Operational Database Empty"}
            description={
              language === "ja"
                ? "現在、ツアーデータは登録されていません。インポート確認画面からワークブックの確認を行ってください。"
                : "The live database contains zero tour records. 1,757 tours from the staged SATF workbook are available in Import Review for date decisions and dry-run reconciliation."
            }
            action={
              <div className="flex items-center gap-2">
                <Link
                  href="/import/review"
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-md transition-colors shadow-xs"
                >
                  {language === "ja" ? "インポート確認を開く" : "Open Excel Import Review"}
                </Link>
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(true)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md border border-slate-300 transition-colors"
                >
                  {language === "ja" ? "手動登録" : "Create Manual Tour"}
                </button>
              </div>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Compass}
            title={language === "ja" ? "該当するツアーが見つかりません" : "No tours match current filters"}
            description={
              language === "ja"
                ? "検索条件や状態フィルターを変更してください。"
                : "Adjust your search terms or status filter to locate the operational tour record."
            }
            action={
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                  setSheetFilter("all");
                }}
                className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md border border-blue-200 transition-colors"
              >
                {t("tours.reset_filters")}
              </button>
            }
          />
        ) : (
          <div className="relative overflow-x-auto w-full max-w-full">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-2.5 px-3 whitespace-nowrap">{t("tours.col_ref")}</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">{t("tours.col_guest")}</th>
                  <th className="py-2.5 px-3 whitespace-nowrap hidden sm:table-cell">{t("tours.col_dest")}</th>
                  <th className="py-2.5 px-3 whitespace-nowrap hidden md:table-cell">{t("tours.col_dates")}</th>
                  <th className="py-2.5 px-3 whitespace-nowrap hidden lg:table-cell">{t("tours.col_guide")}</th>
                  <th className="py-2.5 px-3 whitespace-nowrap hidden xl:table-cell">{t("tours.col_driver")}</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">{t("tours.col_status")}</th>
                  <th className="py-2.5 px-3 whitespace-nowrap hidden sm:table-cell">{language === "ja" ? "手配状況" : "Readiness"}</th>
                  <th className="py-2.5 px-3 text-right">
                    <span className="sr-only">{t("tours.col_actions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedTours.map((tour) => {
                  const guide = tour.assignments.find((a) => a.role === "guide");
                  const vehicle = tour.assignments.find((a) => a.role === "vehicle");
                  const driver = tour.assignments.find((a) => a.role === "driver");
                  const nights = nightsBetween(tour.arrivalDate, tour.departureDate);
                  const openIssuesCount = tour.issues?.filter((i) => !i.resolved).length ?? 0;
                  const isAttention = tour.status === "attention" || openIssuesCount > 0;

                  return (
                    <tr
                      key={tour.id}
                      className={cn(
                        "group hover:bg-[#dcecf7]/20 transition-colors",
                        isAttention && "bg-amber-50/20"
                      )}
                    >
                      {/* Booking Reference */}
                      <td className="py-2.5 px-3 font-mono text-xs font-bold text-[#244d70] whitespace-nowrap">
                        <Link
                          href={`/tours/${tour.id}`}
                          className="hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#244d70] rounded block"
                        >
                          {tour.bookingReference}
                        </Link>
                        {tour.isImported && (
                          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                            <span className="text-[9px] font-mono font-normal text-slate-500 bg-slate-100 px-1 py-0.2 rounded border border-slate-200">
                              {tour.sourceSheet}:{tour.sourceRow}
                            </span>
                            {tour.agency && (
                              <span className="text-[9px] font-mono font-bold text-[#244d70] bg-[#dcecf7]/60 px-1 py-0.2 rounded">
                                {tour.agency}
                              </span>
                            )}
                            {tour.hasDateAmbiguity && (
                              <span
                                className="text-[9px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1 py-0.2 rounded cursor-help"
                                title={tour.dateAmbiguityReason}
                              >
                                Ambiguous
                              </span>
                            )}
                            {tour.sourceSheets && tour.sourceSheets.length > 1 && (
                              <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 py-0.2 rounded">
                                Spanning ({tour.sourceSheets.length})
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Group Name & Pax */}
                      <td className="py-2.5 px-3">
                        <p className="font-semibold text-slate-900 truncate max-w-[170px]">
                          {tour.group.groupName}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {tour.group.adultCount + tour.group.childCount} pax · {tour.group.nationality}
                        </p>
                      </td>

                      {/* Destination Circuit */}
                      <td className="py-2.5 px-3 text-slate-700 font-medium max-w-[150px] truncate hidden sm:table-cell">
                        {tour.destination}
                      </td>

                      {/* Dates & Duration */}
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-600 hidden md:table-cell">
                        <div className="flex items-center gap-1 font-medium">
                          <span>{formatDateShort(tour.arrivalDate)}</span>
                          <span className="text-slate-400">→</span>
                          <span>{formatDateShort(tour.departureDate)}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {nights} nights · {relativeDayLabel(tour.arrivalDate, referenceDate)}
                        </p>
                      </td>

                      {/* Guide Assignment */}
                      <td className="py-2.5 px-3 whitespace-nowrap hidden lg:table-cell">
                        {guide && guide.status === "assigned" && guide.name ? (
                          <div className="flex items-center gap-1 text-slate-800 font-medium">
                            <User size={13} className="text-emerald-600 shrink-0" />
                            <span className="truncate max-w-[110px]">{guide.name}</span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                            {t("assign.status_unassigned")}
                          </span>
                        )}
                      </td>

                      {/* Vehicle & Driver */}
                      <td className="py-2.5 px-3 whitespace-nowrap hidden xl:table-cell">
                        <div className="flex items-center gap-1">
                          <Car size={13} className="text-slate-400 shrink-0" />
                          <span className="font-medium text-slate-800">
                            {vehicle?.vehicleType || "TBD"}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5 font-mono truncate max-w-[120px]">
                          {driver?.name || (language === "ja" ? "ドライバー手配中" : "Driver pending")}
                        </p>
                      </td>

                      {/* Tour Status */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <StatusBadge status={tour.status} />
                      </td>

                      {/* Operational Readiness / Blockers */}
                      <td className="py-2.5 px-3 whitespace-nowrap hidden sm:table-cell">
                        {openIssuesCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-700 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">
                            <AlertCircle size={11} className="text-red-600" />
                            {openIssuesCount} {t("tours.blocker")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                            {t("tours.ready")}
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <Link
                          href={`/tours/${tour.id}`}
                          className="inline-flex items-center gap-0.5 px-2.5 py-1 text-xs font-semibold text-[#244d70] hover:text-[#172d43] hover:bg-[#dcecf7]/50 rounded-lg transition-colors btn-press"
                          aria-label={`Open tour ${tour.bookingReference}`}
                        >
                          <span>{t("tours.open")}</span>
                          <ChevronRight size={13} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {filtered.length > pageSize && (
          <div className="p-3 border-t border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <span className="text-slate-600 font-medium">
              {t("pagination.showing")}{" "}
              <strong className="text-slate-900 font-mono">{(currentPage - 1) * pageSize + 1}</strong>{" "}
              {t("pagination.of")}{" "}
              <strong className="text-slate-900 font-mono">{Math.min(currentPage * pageSize, filtered.length)}</strong>{" "}
              ({filtered.length} {language === "ja" ? "件" : "records"})
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1 rounded border border-slate-300 bg-white text-slate-700 disabled:opacity-40 hover:bg-slate-100 font-medium transition-colors"
              >
                {t("pagination.prev")}
              </button>
              <span className="px-2 font-mono text-slate-700 font-semibold">
                {t("pagination.page")} {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1 rounded border border-slate-300 bg-white text-slate-700 disabled:opacity-40 hover:bg-slate-100 font-medium transition-colors"
              >
                {t("pagination.next")}
              </button>
            </div>
          </div>
        )}

        <CardFooter className="flex items-center justify-between">
          <span>Showing {filtered.length} of {tours.length} total operational tours</span>
          <span className="text-[11px] text-slate-400 font-mono">
            Sorted by itinerary schedule
          </span>
        </CardFooter>
      </Card>

      {/* Create Tour Modal */}
      <CreateTourModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onTourCreated={(newTour) => {
          setCreatedTours((prev) => [newTour, ...prev]);
          setFeedbackMessage(`Tour ${newTour.bookingReference} (${newTour.group.groupName}) successfully registered.`);
          setStatusFilter("all");
        }}
        existingReferences={existingReferences}
      />
    </PageContainer>
  );
}
