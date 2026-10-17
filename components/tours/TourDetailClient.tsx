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
  saveSessionTour,
  clearSessionTour,
  subscribeSessionStore,
  getSessionSnapshot,
  getServerSnapshot,
  parseSessionSnapshot,
  type StorageOperationResult,
} from "@/lib/session-store";
import { cancelTour } from "@/lib/operations";
import { EditTourModal } from "./EditTourModal";

interface TourDetailClientProps {
  initialTour: Tour | null;
  tourId?: string;
}

export function TourDetailClient({ initialTour, tourId }: TourDetailClientProps) {
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

  const tour = sessionTour ?? initialTour;
  const hasSessionModifications = Boolean(sessionTour);

  function handleSave(updatedTour: Tour): StorageOperationResult {
    setErrorMessage(null);
    const result = saveSessionTour(updatedTour);
    if (!result.success) {
      return result;
    }

    setIsEditOpen(false);
    setFeedbackMessage("Operations record successfully updated for this browser session.");
    setTimeout(() => setFeedbackMessage(null), 4000);
    return { success: true };
  }

  function handleReset() {
    if (!tour) return;
    setErrorMessage(null);
    const result = clearSessionTour(tour.id);
    if (!result.success) {
      setErrorMessage(
        result.error || "Failed to reset tour record in browser session storage."
      );
      setTimeout(() => setErrorMessage(null), 5000);
      return;
    }
    setFeedbackMessage("Tour record reverted to baseline mock state.");
    setTimeout(() => setFeedbackMessage(null), 4000);
  }

  function handleConfirmCancel() {
    if (!tour) return;
    const trimmed = cancelReason.trim();
    if (!trimmed || trimmed.length < 5) {
      setCancelError("A valid cancellation reason of at least 5 characters is required.");
      return;
    }
    const cancelRes = cancelTour(tour, trimmed);
    if (!cancelRes.success || !cancelRes.tour) {
      setCancelError(cancelRes.error || "Failed to cancel tour.");
      return;
    }
    const saveRes = saveSessionTour(cancelRes.tour);
    if (!saveRes.success) {
      setCancelError(saveRes.error || "Failed to save cancellation to session storage.");
      return;
    }
    setIsCancelModalOpen(false);
    setFeedbackMessage(`Tour ${tour.bookingReference} has been successfully cancelled.`);
    setTimeout(() => setFeedbackMessage(null), 4000);
  }

  if (!tour) {
    return (
      <PageContainer>
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center max-w-md mx-auto my-12 shadow-xs">
          <AlertCircle size={36} className="text-amber-500 mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-900">Tour Record Not Found</h2>
          <p className="text-xs text-slate-500 mt-1 mb-4">
            No tour matching identifier <span className="font-mono font-semibold">{effectiveId || "unknown"}</span> exists in baseline mock records or your current browser session.
          </p>
          <Link
            href="/tours"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-xs transition-colors"
          >
            <ArrowLeft size={13} />
            Back to Tours Roster
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
            className="inline-flex items-center gap-1 font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-2.5 py-1 rounded-md shadow-xs transition-colors"
          >
            <ArrowLeft size={13} />
            <span>Tours Roster</span>
          </Link>
          <span className="text-slate-300">/</span>
          <span className="font-mono font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
            {tour.bookingReference}
          </span>
          {hasSessionModifications && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
              <Info size={11} />
              Session Modified
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {hasSessionModifications && (
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded-md shadow-xs transition-colors"
            >
              <RotateCcw size={12} />
              Reset Tour
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
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-red-700 hover:text-red-800 bg-red-50 hover:bg-red-100 border border-red-200 rounded-md shadow-xs transition-colors"
            >
              <Ban size={12} />
              Cancel Tour
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsEditOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Edit3 size={13} />
            Update Operations
          </button>
        </div>
      </div>

      {/* ── Alerts & Prototype Disclaimer ───────────────────────────────────── */}
      {tour.status === "cancelled" && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-900 flex items-start gap-2.5 shadow-xs"
        >
          <Ban size={18} className="text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <div className="font-bold flex items-center gap-2 text-red-900">
              <span>TOUR CANCELLED</span>
              {tour.cancelledAt && (
                <span className="font-normal font-mono text-[11px] text-red-700">
                  (Cancelled on {formatDate(tour.cancelledAt)})
                </span>
              )}
            </div>
            <p className="text-red-800">
              <span className="font-semibold">Reason: </span>
              {tour.cancellationReason || "No explicit reason specified."}
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
            <strong>Storage Warning:</strong> Could not check session modifications ({sessionState.error}). Displaying baseline record.
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
                <span className="font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  {tour.destination}
                </span>
                <span className="text-slate-300">·</span>
                <span className="font-medium text-slate-600">
                  {durationNights} Nights / {durationNights + 1} Days
                </span>
                <span className="text-slate-300">·</span>
                <span className="text-slate-500 font-mono">
                  Party: {tour.group.nationality} ({tour.group.language})
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                {tour.group.groupName}
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Primary Contact: <strong className="text-slate-700">{tour.group.contactPerson || "Not specified"}</strong> · Group Ref: <span className="font-mono">{tour.bookingReference}</span>
              </p>
            </div>

            {/* Provenance & Workbook Context */}
            <div className="p-2.5 rounded-md bg-slate-50 border border-slate-200 text-[11px] text-slate-600 lg:max-w-xs shrink-0">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800 mb-0.5">
                <FileSpreadsheet size={13} className="text-blue-600" />
                <span>{tour.isImported ? "Workbook Provenance" : "Format Provenance"}</span>
              </div>
              {tour.isImported ? (
                <div className="text-[10px] space-y-0.5 leading-tight">
                  <p className="text-slate-700">
                    Sheet: <strong className="font-mono text-slate-900">{tour.sourceSheet}</strong> · Row: <span className="font-mono">{tour.sourceRow}</span>
                  </p>
                  {tour.agency && (
                    <p className="text-slate-600">
                      Agency: <strong className="font-mono text-blue-700">{tour.agency}</strong>
                      {tour.packageCode && ` · Pkg: ${tour.packageCode}`}
                    </p>
                  )}
                  {tour.rawArrivalSerial && (
                    <p className="text-slate-500 font-mono">
                      Arrival Serial: {String(tour.rawArrivalSerial)}
                    </p>
                  )}
                  {tour.sourceSheets && tour.sourceSheets.length > 1 && (
                    <p className="text-emerald-700 font-medium">
                      Spanning Sheets: {tour.sourceSheets.join(", ")}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-[10px] text-slate-500 leading-tight">
                  {tour.sourceProvenance || "Illustrative operational format fixture"}.
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
                <strong className="block font-semibold">Date Ambiguity Flagged (Original Preserved)</strong>
                <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                  {tour.dateAmbiguityReason || "Sheet indicated season year differs from calculated serial date. Preserved faithfully without automated alteration."}
                </p>
              </div>
            </div>
          )}

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100 text-xs">
            <div className="p-2.5 rounded bg-slate-50/70 border border-slate-100">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Party Size
              </span>
              <p className="font-semibold text-slate-800 mt-0.5">
                {tour.group.adultCount} Adults{tour.group.childCount > 0 ? `, ${tour.group.childCount} Children` : ""}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
                Total: {tour.group.adultCount + tour.group.childCount} pax
              </p>
            </div>

            <div className="p-2.5 rounded bg-slate-50/70 border border-slate-100">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Inbound Arrival
              </span>
              <p className="font-semibold text-slate-800 mt-0.5">
                {formatDateShort(tour.arrivalDate)}
              </p>
              <p className="text-[10px] text-blue-700 mt-0.5 font-mono font-medium truncate">
                {arrivalFlight?.flightNumber || "Transfer pending"} ({arrivalFlight?.arrivalTime || "ETA --:--"})
              </p>
            </div>

            <div className="p-2.5 rounded bg-slate-50/70 border border-slate-100">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Outbound Departure
              </span>
              <p className="font-semibold text-slate-800 mt-0.5">
                {formatDateShort(tour.departureDate)}
              </p>
              <p className="text-[10px] text-slate-600 mt-0.5 font-mono truncate">
                {departureFlight?.flightNumber || "Transit"} ({departureFlight?.departureTime || "ETD --:--"})
              </p>
            </div>

            <div className="p-2.5 rounded bg-slate-50/70 border border-slate-100">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Assigned Guide
              </span>
              <p className="font-semibold text-slate-800 mt-0.5 truncate">
                {tour.assignments.find((a) => a.role === "guide")?.name || (
                  <span className="text-amber-700 italic">Unassigned</span>
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
                <strong className="font-semibold">Dispatch Note: </strong>
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
                  Tracked Operational Issues ({openIssues.length} open, {tour.issues.length - openIssues.length} resolved)
                </h3>
              </div>
              <span className="text-[11px] text-amber-800">
                Issues resolve independently from tour status
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
                    <span className="font-semibold text-slate-800 uppercase text-[10px] tracking-wider text-slate-500 block">
                      Category: {issue.category}
                    </span>
                    <p className="text-slate-800 font-medium mt-0.5">{issue.description}</p>
                    {issue.resolutionNotes && (
                      <p className="text-[11px] text-emerald-800 mt-1 font-medium bg-emerald-50 p-1.5 rounded border border-emerald-100">
                        Resolution Action: {issue.resolutionNotes}
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
                  {issue.resolved ? "Resolved" : "Open Blocker"}
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
                title="Operational Itinerary"
                description="Chronological schedule of transfers, sightseeing, and activities"
                badge={
                  <span className="text-[10px] font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                    {tour.itinerary.length} Days
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
                            Day {idx + 1} — {formatDateShort(item.date)}
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
                            <span>Approx. {Math.round(item.durationMinutes / 60)} hrs</span>
                          </div>
                        )}
                      </div>

                      {item.notes && (
                        <p className="mt-2 text-[11px] text-amber-800 bg-amber-50 p-2 rounded border border-amber-100">
                          <strong>Note:</strong> {item.notes}
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
                title="Flights & Transport Bookings"
                description="International and regional transit bookings"
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
                        {flight.direction === "arrival" ? "Inbound Arrival" : "Outbound Departure"}
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
                        <span className="text-slate-400 block text-[10px]">Date</span>
                        <span className="font-medium">{formatDate(flight.date)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Schedule</span>
                        <span className="font-medium font-mono">{flight.departureTime} – {flight.arrivalTime}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Airline</span>
                        <span>{flight.airline}</span>
                      </div>
                      {flight.terminal && (
                        <div>
                          <span className="text-slate-400 block text-[10px]">Terminal</span>
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
                  title="Resource Allocations"
                  description="Guide, driver, and vehicle assignments"
                />
                <button
                  type="button"
                  onClick={() => setIsEditOpen(true)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-semibold shrink-0"
                >
                  Edit
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
                        <span className="text-slate-400 italic font-normal">Unassigned</span>
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
                title="Hotel Accommodations"
                description="Lodging arrangements and voucher references"
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
                    {formatDateShort(hotel.checkIn)} – {formatDateShort(hotel.checkOut)} ({nightsBetween(hotel.checkIn, hotel.checkOut)} nights)
                  </p>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                    <span>
                      {hotel.roomCount} × {hotel.roomType}
                    </span>
                    {hotel.confirmationNumber ? (
                      <span className="font-mono text-slate-700 font-medium bg-white px-1.5 py-0.2 rounded border border-slate-200">
                        Voucher: {hotel.confirmationNumber}
                      </span>
                    ) : (
                      <span className="text-amber-700 font-semibold bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                        Voucher Pending
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
                title="Special Requests & Dietary"
                description="Guest preferences and accessibility notes"
              />
            </CardHeader>
            <CardContent className="p-4">
              {tour.specialRequests.length === 0 ? (
                <p className="text-xs text-slate-400 italic text-center py-2">
                  No special dietary or accessibility requests logged.
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
                            {req.resolved ? "Resolved" : "Action Pending"}
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
                  Cancel Tour Operation
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
                You are about to cancel tour{" "}
                <strong className="text-slate-900 font-mono">{tour.bookingReference}</strong> (
                {tour.group.groupName}). This will change its status to{" "}
                <span className="font-semibold text-red-700">Cancelled</span> across all views.
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
                  Cancellation Reason <span className="text-red-600">*</span>
                </label>
                <textarea
                  id="cancel-reason-input"
                  rows={3}
                  value={cancelReason}
                  onChange={(e) => {
                    setCancelReason(e.target.value);
                    if (cancelError) setCancelError(null);
                  }}
                  placeholder="e.g. Guest requested cancellation due to medical emergency / flight schedule disrupted"
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  required
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Minimum 5 characters. This will be preserved in the session audit trail.
                </span>
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(false)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-300 rounded-md shadow-xs transition-colors"
              >
                Keep Active
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md shadow-xs transition-colors"
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
