"use client";

import { useState, useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Clock,
  MapPin,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Edit3,
  RotateCcw,
  Info,
  FileSpreadsheet,
  Ban,
  X,
} from "lucide-react";
import {
  PageContainer,
  Card,
  CardHeader,
  CardContent,
  SectionHeader,
  StatusBadge,
  Badge,
} from "@/components/ui/Primitives";
import type { Tour } from "@/lib/types";
import {
  formatDate,
  formatDateShort,
  nightsBetween,
  ITINERARY_TYPE_LABELS,
  ASSIGNMENT_STATUS_LABELS,
} from "@/lib/utils";
import {
  clearSessionTour,
  subscribeSessionStore,
  getSessionSnapshot,
  getServerSnapshot,
  parseSessionSnapshot,
  type StorageOperationResult,
} from "@/lib/session-store";
import {
  updateOperationalTour,
  cancelOperationalTour,
} from "@/lib/operations-client";
import { EditTourModal } from "./EditTourModal";
import { useLanguage } from "@/lib/i18n";

interface TourDetailClientProps {
  initialTour: Tour | null;
  tourId?: string;
}

export function TourDetailClient({ initialTour, tourId }: TourDetailClientProps) {
  const { t, language } = useLanguage();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sessionRaw = useSyncExternalStore(
    subscribeSessionStore,
    getSessionSnapshot,
    getServerSnapshot
  );

  const sessionState = useMemo(() => {
    return parseSessionSnapshot(sessionRaw);
  }, [sessionRaw]);

  const effectiveId = initialTour?.id ?? tourId ?? "";

  const sessionTour = useMemo(() => {
    if (sessionState.status !== "ready" || !sessionState.tours || !effectiveId) return null;
    return sessionState.tours[effectiveId] ?? null;
  }, [sessionState, effectiveId]);

  const [persistedTour, setPersistedTour] = useState<Tour | null>(null);

  const tour = persistedTour ?? sessionTour ?? initialTour;
  const hasSessionModifications = Boolean(persistedTour || sessionTour);

  async function handleSave(updatedTour: Tour): Promise<StorageOperationResult> {
    setErrorMessage(null);
    const result = await updateOperationalTour(updatedTour, tour?.lastUpdated);
    if (!result.success) {
      if (result.conflict) {
        setErrorMessage(
          result.error ||
            "Concurrency Conflict: This tour was modified by another coordinator. Please reload the latest record."
        );
      }
      return { success: false, error: result.error };
    }

    setPersistedTour(result.tour || updatedTour);
    setIsEditOpen(false);
    setFeedbackMessage("Operations record successfully persisted to server database.");
    setTimeout(() => setFeedbackMessage(null), 4000);
    return { success: true };
  }

  function handleReset() {
    if (!tour) return;
    setErrorMessage(null);
    setPersistedTour(null);
    const result = clearSessionTour(tour.id);
    if (!result.success) {
      setErrorMessage(
        result.error || "Failed to reset tour record."
      );
      setTimeout(() => setErrorMessage(null), 5000);
      return;
    }
    setFeedbackMessage("Tour record reverted to baseline dataset.");
    setTimeout(() => setFeedbackMessage(null), 4000);
  }

  async function handleConfirmCancel() {
    if (!tour) return;
    const trimmed = cancelReason.trim();
    if (!trimmed || trimmed.length < 5) {
      setCancelError("A valid cancellation reason of at least 5 characters is required.");
      return;
    }
    setCancelError(null);
    const cancelRes = await cancelOperationalTour(tour.id, trimmed, tour.lastUpdated);
    if (!cancelRes.success) {
      setCancelError(cancelRes.error || "Failed to persist cancellation to server database.");
      return;
    }
    if (cancelRes.tour) {
      setPersistedTour(cancelRes.tour);
    } else {
      setPersistedTour({
        ...tour,
        status: "cancelled",
        cancellationReason: trimmed,
        cancelledAt: new Date().toISOString(),
      });
    }
    setIsCancelModalOpen(false);
    setFeedbackMessage(`Tour ${tour.bookingReference} has been successfully cancelled in server database.`);
    setTimeout(() => setFeedbackMessage(null), 4000);
  }

  if (!tour) {
    return (
      <PageContainer>
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center max-w-md mx-auto my-12 shadow-xs">
          <AlertCircle size={36} className="text-amber-500 mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-900">{t("detail.not_found")}</h2>
          <p className="text-xs text-slate-500 mt-1 mb-4">
            {language === "ja" ? (
              <>
                識別子 <span className="font-mono font-semibold">{effectiveId || "unknown"}</span> に該当するツアー記録はベースライン台帳およびブラウザセッションに存在しません。
              </>
            ) : (
              <>
                No tour matching identifier <span className="font-mono font-semibold">{effectiveId || "unknown"}</span> exists in baseline mock records or your current browser session.
              </>
            )}
          </p>
          <Link
            href="/tours"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-xs transition-colors"
          >
            <ArrowLeft size={13} />
            {t("detail.back_to_roster")}
          </Link>
        </div>
      </PageContainer>
    );
  }

  const durationNights = nightsBetween(tour.arrivalDate, tour.departureDate);
  const openIssues = tour.issues?.filter((i) => !i.resolved) ?? [];
  const arrivalFlight = tour.flights.find((f) => f.direction === "arrival");
  const departureFlight = tour.flights.find((f) => f.direction === "departure");

  return (
    <PageContainer>
      {/* ── Breadcrumbs & Back Navigation ────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-slate-200/80">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Link
            href="/tours"
            className="inline-flex items-center gap-1 font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200/90 px-2.5 py-1 rounded-lg shadow-2xs hover:shadow-xs transition-all btn-press"
          >
            <ArrowLeft size={13} />
            <span>{t("nav.tours")}</span>
          </Link>
          <span className="text-slate-300">/</span>
          <span className="font-mono font-semibold text-[#172d43] bg-slate-100/90 px-2 py-0.5 rounded">
            {tour.bookingReference}
          </span>
          {hasSessionModifications && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#244d70] bg-[#dcecf7] px-2 py-0.5 rounded border border-[#b6d6eb]">
              <Info size={11} />
              {t("detail.session_modified")}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {hasSessionModifications && (
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded-lg shadow-2xs transition-colors btn-press"
            >
              <RotateCcw size={12} />
              {t("detail.reset_tour")}
            </button>
          )}

          <StatusBadge status={tour.status} />

          {tour.status !== "cancelled" && (
            <button
              type="button"
              onClick={() => {
                setCancelReason("");
                setCancelError(null);
                setIsCancelModalOpen(true);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-red-700 hover:text-red-800 bg-red-50 hover:bg-red-100/80 border border-red-200/90 rounded-lg shadow-2xs transition-colors btn-press"
            >
              <Ban size={12} />
              {t("detail.cancel_tour")}
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsEditOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-white bg-[#244d70] hover:bg-[#1b3b57] rounded-lg shadow-2xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#244d70] btn-press"
          >
            <Edit3 size={13} />
            {t("detail.update_ops")}
          </button>
        </div>
      </div>

      {/* ── Alerts & Prototype Disclaimer ───────────────────────────────────── */}
      {tour.status === "cancelled" && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-900 flex items-start gap-2.5 shadow-xs"
        >
          <Ban size={18} className="text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <div className="font-bold flex items-center gap-2 text-red-900">
              <span>{t("detail.cancelled_banner")}</span>
              {tour.cancelledAt && (
                <span className="font-normal font-mono text-[11px] text-red-700">
                  ({t("detail.cancelled_on")} {formatDate(tour.cancelledAt)})
                </span>
              )}
            </div>
            <p className="text-red-800">
              <span className="font-semibold">{t("detail.cancellation_reason")}: </span>
              {tour.cancellationReason || (language === "ja" ? "理由の明記なし" : "No explicit reason specified.")}
            </p>
          </div>
        </div>
      )}
      {sessionState.status === "error" && (
        <div
          role="alert"
          className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-2.5 text-xs font-medium text-amber-900 flex items-center gap-2 shadow-xs"
        >
          <AlertTriangle size={16} className="text-amber-600 shrink-0" />
          <span>
            <strong>{language === "ja" ? "ストレージ警告:" : "Storage Warning:"}</strong> {sessionState.error}
          </span>
        </div>
      )}

      {feedbackMessage && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2 text-xs font-medium text-emerald-800 flex items-center gap-2 shadow-xs">
          <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
          <span>{feedbackMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-xs font-medium text-red-800 flex items-center gap-2 shadow-xs"
        >
          <AlertCircle size={15} className="text-red-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* ── Operational File Header Card ────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs mb-1">
                <span className="font-semibold text-[#244d70] bg-[#dcecf7] px-2 py-0.5 rounded border border-[#b6d6eb]">
                  {tour.destination}
                </span>
                <span className="text-slate-300">·</span>
                <span className="font-medium text-slate-600">
                  {durationNights} {t("detail.nights")} / {durationNights + 1} {t("detail.days")}
                </span>
                <span className="text-slate-300">·</span>
                <span className="text-slate-500 font-mono">
                  {language === "ja" ? "国籍・言語" : "Party"}: {tour.group.nationality} ({tour.group.language})
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-[#172d43] tracking-tight">
                {tour.group.groupName}
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                {t("detail.primary_contact")} <strong className="text-slate-700">{tour.group.contactPerson || (language === "ja" ? "未指定" : "Not specified")}</strong> · {t("detail.group_ref")} <span className="font-mono">{tour.bookingReference}</span>
              </p>
            </div>

            {/* Provenance & Workbook Context */}
            <div className="p-2.5 rounded-lg bg-slate-50/80 border border-slate-200/80 text-[11px] text-slate-600 lg:max-w-xs shrink-0">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800 mb-0.5">
                <FileSpreadsheet size={13} className="text-blue-600" />
                <span>{tour.isImported ? (language === "ja" ? "元帳票出処" : "Workbook Provenance") : (language === "ja" ? "データ形式" : "Format Provenance")}</span>
              </div>
              {tour.isImported ? (
                <div className="text-[10px] space-y-0.5 leading-tight">
                  <p className="text-slate-700">
                    {language === "ja" ? "シート" : "Sheet"}: <strong className="font-mono text-slate-900">{tour.sourceSheet}</strong> · {language === "ja" ? "行" : "Row"}: <span className="font-mono">{tour.sourceRow}</span>
                  </p>
                  {tour.agency && (
                    <p className="text-slate-600">
                      {language === "ja" ? "手配会社" : "Agency"}: <strong className="font-mono text-blue-700">{tour.agency}</strong>
                      {tour.packageCode && ` · Pkg: ${tour.packageCode}`}
                    </p>
                  )}
                  {tour.rawArrivalSerial && (
                    <p className="text-slate-500 font-mono">
                      {language === "ja" ? "到着シリアル" : "Arrival Serial"}: {String(tour.rawArrivalSerial)}
                    </p>
                  )}
                  {tour.sourceSheets && tour.sourceSheets.length > 1 && (
                    <p className="text-emerald-700 font-medium">
                      {language === "ja" ? "参照シート群" : "Spanning Sheets"}: {tour.sourceSheets.join(", ")}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-[10px] text-slate-500 leading-tight">
                  {tour.sourceProvenance || (language === "ja" ? "標準運用モックデータ" : "Illustrative operational format fixture")}.
                </p>
              )}
            </div>
          </div>

          {/* Date Ambiguity Alert */}
          {tour.hasDateAmbiguity && (
            <div
              role="alert"
              className="mt-3 bg-amber-50 border border-amber-300 rounded-md p-2.5 text-xs text-amber-900 flex items-start gap-2 shadow-xs"
            >
              <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-semibold">
                  {language === "ja" ? "日付整合性アラート（原本保持）" : "Date Ambiguity Flagged (Original Preserved)"}
                </strong>
                <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                  {tour.dateAmbiguityReason || (language === "ja" ? "シート年とシリアル日付に差異が検知されました。元データを改変せず保持しています。" : "Sheet indicated season year differs from calculated serial date. Preserved faithfully without automated alteration.")}
                </p>
              </div>
            </div>
          )}

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100 text-xs">
            <div className="p-2.5 rounded bg-slate-50/70 border border-slate-100">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                {t("detail.party_size")}
              </span>
              <p className="font-semibold text-slate-800 mt-0.5">
                {tour.group.adultCount} {t("detail.adults")}{tour.group.childCount > 0 ? `, ${tour.group.childCount} ${t("detail.children")}` : ""}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
                {language === "ja" ? "合計" : "Total"}: {tour.group.adultCount + tour.group.childCount} {t("detail.pax")}
              </p>
            </div>

            <div className="p-2.5 rounded bg-slate-50/70 border border-slate-100">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                {t("detail.inbound_arrival")}
              </span>
              <p className="font-semibold text-slate-800 mt-0.5">
                {formatDateShort(tour.arrivalDate)}
              </p>
              <p className="text-[10px] text-blue-700 mt-0.5 font-mono font-medium truncate">
                {arrivalFlight?.flightNumber || (language === "ja" ? "送迎確認中" : "Transfer pending")} ({arrivalFlight?.arrivalTime || "ETA --:--"})
              </p>
            </div>

            <div className="p-2.5 rounded bg-slate-50/70 border border-slate-100">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                {t("detail.outbound_departure")}
              </span>
              <p className="font-semibold text-slate-800 mt-0.5">
                {formatDateShort(tour.departureDate)}
              </p>
              <p className="text-[10px] text-slate-600 mt-0.5 font-mono truncate">
                {departureFlight?.flightNumber || (language === "ja" ? "乗り継ぎ" : "Transit")} ({departureFlight?.departureTime || "ETD --:--"})
              </p>
            </div>

            <div className="p-2.5 rounded bg-slate-50/70 border border-slate-100">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                {t("detail.assigned_guide")}
              </span>
              <p className="font-semibold text-slate-800 mt-0.5 truncate">
                {tour.assignments.find((a) => a.role === "guide")?.name || (
                  <span className="text-amber-700 italic">{t("detail.unassigned")}</span>
                )}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5 font-mono truncate">
                {tour.assignments.find((a) => a.role === "guide")?.reference || "Pending ID"}
              </p>
            </div>
          </div>

          {/* Operational Notes Strip */}
          {tour.operationalNotes && (
            <div className="mt-3 p-2.5 bg-blue-50/60 border border-blue-100 rounded-md flex items-start gap-2 text-xs text-blue-900">
              <Info size={15} className="text-blue-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-semibold">{t("detail.dispatch_note")}: </strong>
                <span>{tour.operationalNotes}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Operational Blockers (Tracked Issues) ───────────────────────────── */}
      {tour.issues && tour.issues.length > 0 && (
        <Card className="border-amber-200/90 bg-amber-50/20">
          <CardHeader className="py-2.5 px-4 bg-amber-50/60 border-b border-amber-200/60">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <AlertTriangle size={15} className="text-amber-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-950">
                  {language === "ja"
                    ? `追跡中の運用課題 (${openIssues.length}件未解決 / ${tour.issues.length - openIssues.length}件解決済)`
                    : `Tracked Operational Issues (${openIssues.length} open, ${tour.issues.length - openIssues.length} resolved)`}
                </h3>
              </div>
              <span className="text-[11px] text-amber-800">
                {language === "ja" ? "課題はツアー全体のステータスと独立して管理されます" : "Issues resolve independently from tour status"}
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-3.5 space-y-2">
            {tour.issues.map((issue) => (
              <div
                key={issue.id}
                className="flex items-start justify-between gap-3 p-2.5 rounded-md bg-white border border-slate-200 text-xs shadow-xs"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  {issue.resolved ? (
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <span className="font-semibold uppercase text-[10px] tracking-wider text-slate-500 block">
                      {language === "ja" ? "種別" : "Category"}: {issue.category}
                    </span>
                    <p className="text-slate-800 font-medium mt-0.5">{issue.description}</p>
                    {issue.resolutionNotes && (
                      <p className="text-[11px] text-emerald-800 mt-1 font-medium bg-emerald-50 p-1.5 rounded border border-emerald-100">
                        {language === "ja" ? "解決対応" : "Resolution Action"}: {issue.resolutionNotes}
                      </p>
                    )}
                  </div>
                </div>

                <Badge
                  className={
                    issue.resolved
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-amber-50 text-amber-700 border-amber-200"
                  }
                >
                  {issue.resolved ? (language === "ja" ? "解決済" : "Resolved") : (language === "ja" ? "要対応" : "Open Blocker")}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Two-Column Operational Workspace ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column (7 cols): Detailed Itinerary & Flights */}
        <div className="lg:col-span-7 space-y-5">
          {/* Operational Itinerary Timeline */}
          <Card>
            <CardHeader className="bg-slate-50/50">
              <SectionHeader
                title={t("detail.itinerary")}
                description={t("detail.itinerary_desc")}
                badge={
                  <span className="text-[10px] font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                    {tour.itinerary.length} {t("detail.days")}
                  </span>
                }
              />
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              <div className="relative border-l-2 border-slate-200 ml-3 space-y-6">
                {tour.itinerary.map((item, idx) => (
                  <div key={item.id} className="relative pl-6">
                    {/* Marker */}
                    <div className="absolute -left-[7px] top-1 w-3.5 h-3.5 rounded-full bg-white border-2 border-blue-600 flex items-center justify-center">
                      <div className="w-1 h-1 rounded-full bg-blue-600" />
                    </div>

                    <div className="bg-slate-50/80 rounded-md p-3.5 border border-slate-200/90 shadow-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">
                            {language === "ja" ? `${idx + 1}日目 — ${formatDateShort(item.date)}` : `Day ${idx + 1} — ${formatDateShort(item.date)}`}
                          </span>
                          {item.startTime && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium text-slate-600 bg-white px-1.5 py-0.2 rounded border border-slate-200">
                              <Clock size={11} />
                              {item.startTime}
                            </span>
                          )}
                        </div>
                        <Badge variant="neutral" className="text-[10px]">
                          {ITINERARY_TYPE_LABELS[item.type] || item.type}
                        </Badge>
                      </div>

                      <h4 className="text-xs sm:text-sm font-semibold text-slate-800">
                        {item.title}
                      </h4>

                      {item.description && (
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                          {item.description}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-4 mt-2 text-[11px] text-slate-500">
                        {item.location && (
                          <div className="flex items-center gap-1">
                            <MapPin size={12} className="text-slate-400" />
                            <span>{item.location}</span>
                          </div>
                        )}
                        {item.durationMinutes && (
                          <div className="flex items-center gap-1">
                            <Clock size={12} className="text-slate-400" />
                            <span>{language === "ja" ? `約 ${Math.round(item.durationMinutes / 60)} 時間` : `Approx. ${Math.round(item.durationMinutes / 60)} hrs`}</span>
                          </div>
                        )}
                      </div>

                      {item.notes && (
                        <p className="mt-2 text-[11px] text-amber-800 bg-amber-50 p-2 rounded border border-amber-100">
                          <strong>{t("detail.note")}:</strong> {item.notes}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Flights and Long-Distance Transit */}
          <Card>
            <CardHeader className="bg-slate-50/50">
              <SectionHeader
                title={t("detail.flights")}
                description={t("detail.flights_desc")}
              />
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {tour.flights.map((flight) => (
                  <div
                    key={flight.id}
                    className="p-3.5 rounded-md border border-slate-200 bg-slate-50/50 space-y-2 shadow-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                        {flight.direction === "arrival" ? t("detail.inbound_arrival") : t("detail.outbound_departure")}
                      </span>
                      <span className="text-xs font-mono font-bold bg-white border border-slate-200 px-2 py-0.5 rounded">
                        {flight.flightNumber}
                      </span>
                    </div>

                    <p className="text-xs sm:text-sm font-semibold text-slate-900">
                      {flight.origin} → {flight.destination}
                    </p>

                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 pt-1 border-t border-slate-100">
                      <div>
                        <span className="text-slate-400 block text-[10px]">{t("detail.col_date")}</span>
                        <span className="font-medium">{formatDate(flight.date)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">{t("detail.col_schedule")}</span>
                        <span className="font-medium font-mono">{flight.departureTime} – {flight.arrivalTime}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">{t("detail.col_airline")}</span>
                        <span>{flight.airline}</span>
                      </div>
                      {flight.terminal && (
                        <div>
                          <span className="text-slate-400 block text-[10px]">{t("detail.col_terminal")}</span>
                          <span>{flight.terminal}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column (5 cols): Allocations, Hotels, Special Requests */}
        <div className="lg:col-span-5 space-y-5">
          {/* Operational Resource Allocations */}
          <Card>
            <CardHeader className="bg-slate-50/50">
              <div className="flex items-center justify-between w-full">
                <SectionHeader
                  title={t("detail.assigned_personnel")}
                  description={t("detail.assigned_personnel_desc")}
                />
                <button
                  type="button"
                  onClick={() => setIsEditOpen(true)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-semibold shrink-0"
                >
                  {language === "ja" ? "編集" : "Edit"}
                </button>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {tour.assignments.map((assignment) => (
                <div
                  key={assignment.id}
                  className="flex items-start justify-between gap-3 p-3 rounded-md bg-slate-50/60 border border-slate-200/80"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {assignment.role}
                      </span>
                      {assignment.vehicleType && (
                        <span className="text-[10px] font-semibold bg-blue-50 text-blue-700 px-1.5 py-0.2 rounded border border-blue-200">
                          {assignment.vehicleType}
                        </span>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm font-semibold text-slate-900 mt-0.5 truncate">
                      {assignment.name || (
                        <span className="text-slate-400 italic font-normal">{t("detail.unassigned")}</span>
                      )}
                    </p>
                    {assignment.reference && (
                      <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                        Ref: {assignment.reference}
                      </p>
                    )}
                    {assignment.notes && (
                      <p className="text-[11px] text-amber-800 bg-amber-50 p-1.5 rounded mt-1 border border-amber-100">
                        {assignment.notes}
                      </p>
                    )}
                  </div>
                  <Badge
                    className={
                      assignment.status === "assigned"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]"
                        : assignment.status === "pending"
                        ? "bg-amber-50 text-amber-700 border-amber-200 text-[10px]"
                        : "bg-red-50 text-red-700 border-red-200 text-[10px]"
                    }
                  >
                    {ASSIGNMENT_STATUS_LABELS[assignment.status]}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Hotel Accommodations */}
          <Card>
            <CardHeader className="bg-slate-50/50">
              <SectionHeader
                title={t("detail.accommodations")}
                description={t("detail.accommodations_desc")}
              />
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {tour.hotels.map((hotel) => (
                <div
                  key={hotel.id}
                  className="p-3 rounded-md border border-slate-200 bg-slate-50/50 space-y-1.5 shadow-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs sm:text-sm font-semibold text-slate-900 leading-snug">
                      {hotel.hotelName}
                    </p>
                    <span className="text-[11px] text-slate-500 font-medium shrink-0 bg-white border border-slate-200 px-1.5 py-0.2 rounded">
                      {hotel.city}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    {formatDateShort(hotel.checkIn)} – {formatDateShort(hotel.checkOut)} ({nightsBetween(hotel.checkIn, hotel.checkOut)} {t("detail.nights")})
                  </p>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                    <span>
                      {hotel.roomCount} × {hotel.roomType}
                    </span>
                    {hotel.confirmationNumber ? (
                      <span className="font-mono text-slate-700 font-medium bg-white px-1.5 py-0.2 rounded border border-slate-200">
                        {language === "ja" ? "バウチャー" : "Voucher"}: {hotel.confirmationNumber}
                      </span>
                    ) : (
                      <span className="text-amber-700 font-semibold bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                        {language === "ja" ? "バウチャー未発行" : "Voucher Pending"}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Special Requests */}
          <Card>
            <CardHeader className="bg-slate-50/50">
              <SectionHeader
                title={t("detail.special_requests")}
                description={language === "ja" ? "食事制限・アレルギーおよびバリアフリー対応" : "Guest preferences and accessibility notes"}
              />
            </CardHeader>
            <CardContent className="p-4">
              {tour.specialRequests.length === 0 ? (
                <p className="text-xs text-slate-400 italic text-center py-2">
                  {language === "ja" ? "特別な食事や配慮要望は登録されていません。" : "No special dietary or accessibility requests logged."}
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {tour.specialRequests.map((req) => (
                    <li
                      key={req.id}
                      className="text-xs flex items-start gap-2.5 p-2.5 rounded-md bg-slate-50 border border-slate-200"
                    >
                      {req.resolved ? (
                        <CheckCircle2 size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0">
                        <span className="font-semibold text-slate-800 uppercase text-[10px] tracking-wider text-slate-500">
                          [{req.category}]:{" "}
                        </span>
                        <span className="text-slate-700">{req.description}</span>
                        <div className="mt-1">
                          <span
                            className={`text-[10px] font-medium px-1.5 py-0.2 rounded ${
                              req.resolved
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {req.resolved ? (language === "ja" ? "解決済" : "Resolved") : (language === "ja" ? "対応待ち" : "Action Pending")}
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Edit Drawer Modal ────────────────────────────────────────────────── */}
      {isEditOpen && (
        <EditTourModal
          tour={tour}
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          onSave={handleSave}
        />
      )}

      {/* ── Cancel Tour Confirmation Modal ────────────────────────────────────── */}
      {isCancelModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs"
        >
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-red-50/50">
              <div className="flex items-center gap-2 text-red-700">
                <Ban size={18} />
                <h3 id="cancel-modal-title" className="text-sm font-bold text-slate-900">
                  {t("detail.cancel_modal_title")}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition-colors"
                aria-label="Close cancel dialog"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                {language === "ja" ? (
                  <>
                    ツアー <strong className="text-slate-900 font-mono">{tour.bookingReference}</strong> ({tour.group.groupName}) をキャンセルします。ステータスは全画面で <span className="font-semibold text-red-700">キャンセル済</span> に更新されます。
                  </>
                ) : (
                  <>
                    You are about to cancel tour{" "}
                    <strong className="text-slate-900 font-mono">{tour.bookingReference}</strong> (
                    {tour.group.groupName}). This will change its status to{" "}
                    <span className="font-semibold text-red-700">Cancelled</span> across all views.
                  </>
                )}
              </p>

              {cancelError && (
                <div
                  role="alert"
                  className="bg-red-50 border border-red-200 rounded-md p-2.5 text-xs text-red-800 flex items-start gap-2"
                >
                  <AlertCircle size={14} className="text-red-600 shrink-0 mt-0.5" />
                  <span>{cancelError}</span>
                </div>
              )}

              <div>
                <label
                  htmlFor="cancel-reason-input"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  {t("detail.cancellation_reason")} <span className="text-red-600">*</span>
                </label>
                <textarea
                  id="cancel-reason-input"
                  rows={3}
                  value={cancelReason}
                  onChange={(e) => {
                    setCancelReason(e.target.value);
                    if (cancelError) setCancelError(null);
                  }}
                  placeholder={t("detail.cancel_reason_placeholder")}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  required
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  {language === "ja" ? "5文字以上で入力してください。監査ログに記録されます。" : "Minimum 5 characters. This will be preserved in the session audit trail."}
                </span>
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(false)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-300 rounded-md shadow-xs transition-colors"
              >
                {language === "ja" ? "キャンセルせず戻る" : "Keep Active"}
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md shadow-xs transition-colors"
              >
                {t("detail.confirm_cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
