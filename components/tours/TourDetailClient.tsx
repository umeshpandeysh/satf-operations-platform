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
} from "lucide-react";
import {
  PageContainer,
  Card,
  CardHeader,
  CardContent,
  SectionHeader,
  Badge,
} from "@/components/ui/Primitives";
import type { Tour } from "@/lib/types";
import {
  formatDate,
  formatDateShort,
  nightsBetween,
  TOUR_STATUS_CLASSES,
  TOUR_STATUS_LABELS,
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
import { EditTourModal } from "./EditTourModal";

interface TourDetailClientProps {
  initialTour: Tour;
}

export function TourDetailClient({ initialTour }: TourDetailClientProps) {
  const [isEditOpen, setIsEditOpen] = useState(false);
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

  const sessionTour = useMemo(() => {
    if (sessionState.status !== "ready" || !sessionState.tours) return null;
    return sessionState.tours[initialTour.id] ?? null;
  }, [sessionState, initialTour.id]);

  const tour = sessionTour ?? initialTour;
  const hasSessionModifications = Boolean(sessionTour);

  function handleSave(updatedTour: Tour): StorageOperationResult {
    setErrorMessage(null);
    const result = saveSessionTour(updatedTour);
    if (!result.success) {
      // Do not close modal, do not show success message
      return result;
    }

    // Success shown only after persistence succeeds
    setIsEditOpen(false);
    setFeedbackMessage("Operations record updated for this browser session.");
    setTimeout(() => setFeedbackMessage(null), 4000);
    return { success: true };
  }

  function handleReset() {
    setErrorMessage(null);
    const result = clearSessionTour(initialTour.id);
    if (!result.success) {
      setErrorMessage(
        result.error || "Failed to reset tour record in browser session storage."
      );
      setTimeout(() => setErrorMessage(null), 5000);
      return;
    }
    setFeedbackMessage("Tour reverted to initial baseline mock data.");
    setTimeout(() => setFeedbackMessage(null), 4000);
  }

  const durationNights = nightsBetween(tour.arrivalDate, tour.departureDate);
  const openIssues = tour.issues?.filter((i) => !i.resolved) ?? [];

  return (
    <PageContainer>
      {/* Prototype Scope Banner */}
      <div className="bg-amber-50/90 border border-amber-200/90 rounded-lg px-4 py-2.5 flex items-start sm:items-center justify-between gap-3 text-xs text-amber-900">
        <div className="flex items-center gap-2">
          <Info size={16} className="text-amber-700 shrink-0" />
          <span>
            <strong>Prototype demonstration session:</strong> Edits are browser-local, not shared between operational staff, and not authoritative persistence.
          </span>
        </div>
        {hasSessionModifications && (
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 hover:text-amber-950 underline shrink-0"
          >
            <RotateCcw size={12} /> Reset to Original
          </button>
        )}
      </div>

      {sessionState.status === "error" && (
        <div
          role="alert"
          className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-2.5 text-xs font-medium text-amber-900 flex items-center gap-2 transition-all"
        >
          <AlertTriangle size={16} className="text-amber-600 shrink-0" />
          <span>
            <strong>Session Storage Read Failure:</strong> Could not check for saved modifications ({sessionState.error}). Displaying baseline record.
          </span>
        </div>
      )}

      {feedbackMessage && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2 text-xs font-medium text-emerald-800 flex items-center gap-2 transition-all">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          {feedbackMessage}
        </div>
      )}
      {errorMessage && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-xs font-medium text-red-800 flex items-center gap-2 transition-all"
        >
          <AlertCircle size={16} className="text-red-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Back button & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div className="flex items-center gap-3">
          <Link
            href="/tours"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm transition-colors"
          >
            <ArrowLeft size={16} />
            Back to Tours
          </Link>
          <div className="h-4 w-px bg-slate-300 hidden sm:block" />
          <span className="font-mono text-sm font-semibold text-slate-500">
            {tour.bookingReference}
          </span>
          {hasSessionModifications && (
            <Badge className="bg-blue-100 text-blue-800 border border-blue-200 text-[10px]">
              Session Modified
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <Badge className={TOUR_STATUS_CLASSES[tour.status]}>
            {TOUR_STATUS_LABELS[tour.status]}
          </Badge>
          <button
            type="button"
            onClick={() => setIsEditOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Edit3 size={14} />
            Update Operations
          </button>
        </div>
      </div>

      {/* Source Provenance Banner */}
      {tour.sourceProvenance && (
        <div className="bg-slate-100 border border-slate-200/90 rounded-lg px-4 py-2 flex items-center justify-between text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={15} className="text-slate-500 shrink-0" />
            <span>
              <strong>Format Context:</strong> {tour.sourceProvenance}
            </span>
          </div>
          <span className="text-[11px] text-slate-400">Illustrative format sample</span>
        </div>
      )}

      {/* Discrete Operational Issues Panel */}
      {tour.issues && tour.issues.length > 0 && (
        <Card className="border-amber-200/90 bg-amber-50/30">
          <CardHeader className="py-3 px-5 border-b border-amber-200/60 bg-amber-50/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-950">
                  Tracked Operational Issues ({openIssues.length} open, {tour.issues.length - openIssues.length} resolved)
                </h3>
              </div>
              <span className="text-[11px] text-amber-800">
                Issues resolve independently from tour status
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-2.5">
            {tour.issues.map((issue) => (
              <div
                key={issue.id}
                className="flex items-start justify-between gap-3 p-2.5 rounded bg-white border border-slate-200 text-xs"
              >
                <div className="flex items-start gap-2">
                  {issue.resolved ? (
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className="font-semibold text-slate-800 capitalize">
                      [{issue.category}]:{" "}
                    </span>
                    <span className="text-slate-700">{issue.description}</span>
                    {issue.resolutionNotes && (
                      <p className="text-[11px] text-emerald-800 mt-0.5 font-medium">
                        Action: {issue.resolutionNotes}
                      </p>
                    )}
                  </div>
                </div>
                <Badge
                  className={
                    issue.resolved
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px]"
                      : "bg-amber-50 text-amber-700 border border-amber-200 text-[10px]"
                  }
                >
                  {issue.resolved ? "Resolved" : "Open Blocker"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Primary Overview Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1">
                <span>{tour.destination}</span>
                <span>•</span>
                <span>{durationNights} Nights / {durationNights + 1} Days</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900">
                {tour.group.groupName}
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Primary Contact: {tour.group.contactPerson || "Not specified"} ({tour.group.language})
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 border-t lg:border-t-0 lg:border-l border-slate-100 pt-4 lg:pt-0 lg:pl-6">
              <div>
                <p className="text-xs text-slate-400 font-medium">Party Size</p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">
                  {tour.group.adultCount} Adults{tour.group.childCount > 0 ? `, ${tour.group.childCount} Children` : ""}
                </p>
                <p className="text-xs text-slate-500">Nationality: {tour.group.nationality}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">Arrival Date</p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">
                  {formatDate(tour.arrivalDate)}
                </p>
                <p className="text-xs text-slate-500">
                  {tour.flights.find((f) => f.direction === "arrival")?.flightNumber || "No arrival flight"}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">Departure Date</p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">
                  {formatDate(tour.departureDate)}
                </p>
                <p className="text-xs text-slate-500">
                  {tour.flights.find((f) => f.direction === "departure")?.flightNumber || "No departure flight"}
                </p>
              </div>
            </div>
          </div>

          {tour.operationalNotes && (
            <div className="mt-6 p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex items-start gap-2.5">
              <Info size={17} className="text-blue-600 shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed text-slate-800">
                <span className="font-semibold text-slate-900">Internal Operations Note: </span>
                {tour.operationalNotes}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Column: Itinerary Timeline */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <SectionHeader
                title="Operational Itinerary"
                description="Chronological schedule of transfers, sightseeing, and activities"
              />
            </CardHeader>
            <CardContent className="p-6">
              <div className="relative border-l-2 border-slate-200 ml-4 space-y-8">
                {tour.itinerary.map((item, idx) => (
                  <div key={item.id} className="relative pl-6">
                    {/* Bullet marker */}
                    <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-white border-2 border-blue-600 flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                    </div>

                    <div className="bg-slate-50 rounded-lg p-4 border border-slate-200/80">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">
                            Day {idx + 1} — {formatDateShort(item.date)}
                          </span>
                          {item.startTime && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                              <Clock size={12} />
                              {item.startTime}
                            </span>
                          )}
                        </div>
                        <Badge className="bg-slate-200 text-slate-700 text-[11px]">
                          {ITINERARY_TYPE_LABELS[item.type] || item.type}
                        </Badge>
                      </div>

                      <h4 className="text-sm font-semibold text-slate-800">
                        {item.title}
                      </h4>

                      {item.description && (
                        <p className="text-xs text-slate-600 mt-1">
                          {item.description}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-4 mt-2.5 text-xs text-slate-500">
                        {item.location && (
                          <div className="flex items-center gap-1">
                            <MapPin size={13} className="text-slate-400" />
                            <span>{item.location}</span>
                          </div>
                        )}
                        {item.durationMinutes && (
                          <div className="flex items-center gap-1">
                            <Clock size={13} className="text-slate-400" />
                            <span>Approx. {Math.round(item.durationMinutes / 60)} hrs</span>
                          </div>
                        )}
                      </div>

                      {item.notes && (
                        <p className="mt-2 text-[11px] text-amber-700 bg-amber-50 p-2 rounded border border-amber-100">
                          <strong>Note:</strong> {item.notes}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Flights and Transfers */}
          <Card>
            <CardHeader>
              <SectionHeader
                title="Flights & Transport Legs"
                description="International and regional transit bookings"
              />
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {tour.flights.map((flight) => (
                  <div
                    key={flight.id}
                    className="p-4 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
                        {flight.direction === "arrival" ? "Inbound Arrival" : "Outbound Departure"}
                      </span>
                      <span className="text-xs font-mono font-semibold bg-white border border-slate-200 px-2 py-0.5 rounded">
                        {flight.flightNumber}
                      </span>
                    </div>

                    <p className="text-sm font-semibold text-slate-800">
                      {flight.origin} → {flight.destination}
                    </p>

                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 pt-1">
                      <div>
                        <span className="text-slate-400 block text-[11px]">Date</span>
                        <span className="font-medium">{formatDate(flight.date)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Schedule</span>
                        <span className="font-medium">{flight.departureTime} – {flight.arrivalTime}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Airline</span>
                        <span>{flight.airline}</span>
                      </div>
                      {flight.terminal && (
                        <div>
                          <span className="text-slate-400 block text-[11px]">Terminal</span>
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

        {/* Sidebar Column: Accommodations, Assignments, Special Requests */}
        <div className="space-y-6">
          {/* Resource Assignments */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <SectionHeader
                  title="Operational Assignments"
                  description="Guide, driver, and vehicle allocations"
                />
                <button
                  type="button"
                  onClick={() => setIsEditOpen(true)}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  Edit
                </button>
              </div>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              {tour.assignments.map((assignment) => (
                <div
                  key={assignment.id}
                  className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 last:border-0 last:pb-0"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        {assignment.role}
                      </p>
                      {assignment.vehicleType && (
                        <span className="text-[10px] font-semibold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200">
                          {assignment.vehicleType}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5">
                      {assignment.name || (
                        <span className="text-slate-400 italic font-normal">Unassigned</span>
                      )}
                    </p>
                    {assignment.reference && (
                      <p className="text-xs font-mono text-slate-500">{assignment.reference}</p>
                    )}
                    {assignment.notes && (
                      <p className="text-[11px] text-amber-700 mt-1">{assignment.notes}</p>
                    )}
                  </div>
                  <Badge
                    className={
                      assignment.status === "assigned"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : assignment.status === "pending"
                        ? "bg-amber-50 text-amber-700 border border-amber-200"
                        : "bg-red-50 text-red-600 border border-red-200"
                    }
                  >
                    {ASSIGNMENT_STATUS_LABELS[assignment.status]}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Hotel Stays */}
          <Card>
            <CardHeader>
              <SectionHeader
                title="Hotel Accommodations"
                description="Confirmed lodging arrangements"
              />
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              {tour.hotels.map((hotel) => (
                <div
                  key={hotel.id}
                  className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800 leading-tight">
                      {hotel.hotelName}
                    </p>
                    <span className="text-xs text-slate-500 font-medium shrink-0">
                      {hotel.city}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">
                    {formatDateShort(hotel.checkIn)} – {formatDateShort(hotel.checkOut)} ({nightsBetween(hotel.checkIn, hotel.checkOut)} nights)
                  </p>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                    <span>
                      {hotel.roomCount} × {hotel.roomType}
                    </span>
                    {hotel.confirmationNumber ? (
                      <span className="font-mono text-slate-600">
                        Ref: {hotel.confirmationNumber}
                      </span>
                    ) : (
                      <span className="text-amber-600 font-medium">Pending Property Ref</span>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Special Requests */}
          <Card>
            <CardHeader>
              <SectionHeader
                title="Special Requests & Notes"
                description="Dietary, accessibility, and guest preferences"
              />
            </CardHeader>
            <CardContent className="p-5">
              {tour.specialRequests.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No special requests logged.</p>
              ) : (
                <ul className="space-y-3">
                  {tour.specialRequests.map((req) => (
                    <li
                      key={req.id}
                      className="text-xs flex items-start gap-2.5 p-2.5 rounded bg-slate-50 border border-slate-200"
                    >
                      {req.resolved ? (
                        <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <span className="font-semibold text-slate-700 capitalize">
                          [{req.category}]:{" "}
                        </span>
                        <span className="text-slate-600">{req.description}</span>
                        <div className="mt-1">
                          <span
                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
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

      {/* Edit Drawer Modal */}
      {isEditOpen && (
        <EditTourModal
          tour={tour}
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          onSave={handleSave}
        />
      )}
    </PageContainer>
  );
}
