"use client";

import { useMemo, useSyncExternalStore, useState } from "react";
import Link from "next/link";
import {
  Plane,
  PlaneTakeoff,
  PlaneLanding,
  Activity,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Car,
  UserCheck,
  Building,
  ChevronRight,
  Info,
  AlertCircle,
} from "lucide-react";
import {
  MetricCard,
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  SectionHeader,
  PageContainer,
  StatusBadge,
} from "@/components/ui/Primitives";
import type { Tour } from "@/lib/types";
import {
  computeDashboardMetricsFromTours,
  getAttentionItemsFromTours,
  getUpcomingArrivalsFromTours,
} from "@/lib/mock-data";
import {
  subscribeSessionStore,
  getSessionSnapshot,
  getServerSnapshot,
  mergeSessionTours,
  clearAllSessionTours,
  parseSessionSnapshot,
} from "@/lib/session-store";
import {
  formatDate,
  formatDateShort,
  relativeDayLabel,
  nightsBetween,
} from "@/lib/utils";

export interface DashboardViewProps {
  initialTours: Tour[];
  today: string;
}

export function DashboardView({ initialTours, today }: DashboardViewProps) {
  const sessionRaw = useSyncExternalStore(
    subscribeSessionStore,
    getSessionSnapshot,
    getServerSnapshot
  );

  const sessionState = useMemo(() => {
    return parseSessionSnapshot(sessionRaw);
  }, [sessionRaw]);

  const sessionTours = sessionState.tours;

  const tours = useMemo(() => {
    return mergeSessionTours(initialTours, sessionTours);
  }, [initialTours, sessionTours]);

  const metrics = useMemo(() => {
    return computeDashboardMetricsFromTours(tours, today);
  }, [tours, today]);

  const attentionItems = useMemo(() => {
    return getAttentionItemsFromTours(tours);
  }, [tours]);

  const upcomingArrivals = useMemo(() => {
    return getUpcomingArrivalsFromTours(tours, 10, today);
  }, [tours, today]);

  // Derived lifecycle status counts
  const statusCounts = useMemo(() => {
    const counts = {
      all: tours.length,
      active: 0,
      upcoming: 0,
      attention: 0,
      completed: 0,
      cancelled: 0,
    };
    tours.forEach((t) => {
      if (counts[t.status] !== undefined) {
        counts[t.status]++;
      }
    });
    return counts;
  }, [tours]);

  // Derived operational breakdown for dispatchers
  const todayArrivals = useMemo(() => {
    return tours.filter((t) => t.arrivalDate === today);
  }, [tours, today]);

  const todayDepartures = useMemo(() => {
    return tours.filter((t) => t.departureDate === today);
  }, [tours, today]);

  const activeMovements = useMemo(() => {
    return tours.filter(
      (t) =>
        t.status === "active" ||
        (t.arrivalDate <= today && t.departureDate >= today && t.status !== "cancelled")
    );
  }, [tours, today]);

  // Missing or pending resource confirmation checklist
  const unconfirmedLogistics = useMemo(() => {
    const list: Array<{
      tourId: string;
      bookingReference: string;
      groupName: string;
      item: string;
      type: "guide" | "driver" | "vehicle" | "hotel";
      arrivalDate: string;
    }> = [];

    tours
      .filter((t) => t.status === "active" || t.status === "upcoming" || t.status === "attention")
      .forEach((t) => {
        const guide = t.assignments.find((a) => a.role === "guide");
        if (!guide || guide.status !== "assigned" || !guide.name) {
          list.push({
            tourId: t.id,
            bookingReference: t.bookingReference,
            groupName: t.group.groupName,
            item: "Guide unassigned or pending confirmation",
            type: "guide",
            arrivalDate: t.arrivalDate,
          });
        }

        const driver = t.assignments.find((a) => a.role === "driver");
        if (!driver || driver.status !== "assigned" || !driver.name) {
          list.push({
            tourId: t.id,
            bookingReference: t.bookingReference,
            groupName: t.group.groupName,
            item: "Driver not allocated",
            type: "driver",
            arrivalDate: t.arrivalDate,
          });
        }

        const vehicle = t.assignments.find((a) => a.role === "vehicle");
        if (!vehicle || vehicle.status !== "assigned" || !vehicle.vehicleType) {
          list.push({
            tourId: t.id,
            bookingReference: t.bookingReference,
            groupName: t.group.groupName,
            item: "Vehicle category / dispatch pending",
            type: "vehicle",
            arrivalDate: t.arrivalDate,
          });
        }

        const missingHotel = t.hotels.find((h) => !h.confirmationNumber);
        if (missingHotel) {
          list.push({
            tourId: t.id,
            bookingReference: t.bookingReference,
            groupName: t.group.groupName,
            item: `Hotel voucher pending (${missingHotel.hotelName}, ${missingHotel.city})`,
            type: "hotel",
            arrivalDate: t.arrivalDate,
          });
        }
      });

    return list;
  }, [tours]);

  // Discrete open operational blockers across all tours
  const openBlockers = useMemo(() => {
    const items: Array<{
      tourId: string;
      bookingReference: string;
      groupName: string;
      issueId: string;
      category: string;
      description: string;
    }> = [];

    tours.forEach((t) => {
      t.issues?.filter((i) => !i.resolved).forEach((i) => {
        items.push({
          tourId: t.id,
          bookingReference: t.bookingReference,
          groupName: t.group.groupName,
          issueId: i.id,
          category: i.category,
          description: i.description,
        });
      });
    });

    return items;
  }, [tours]);

  const hasSessionEdits = Boolean(
    sessionState.status === "ready" &&
      sessionTours &&
      Object.keys(sessionTours).length > 0
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleResetSession() {
    setErrorMessage(null);
    const result = clearAllSessionTours();
    if (!result.success) {
      setErrorMessage(
        result.error || "Failed to reset session edits in browser storage."
      );
      setTimeout(() => setErrorMessage(null), 5000);
    }
  }

  return (
    <PageContainer>
      {/* ── Operational Dispatch Ribbon ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200/90 rounded-lg px-4 py-2.5 shadow-xs">
        <div className="flex items-center gap-2.5 text-xs text-slate-700 min-w-0">
          <div className="flex items-center gap-1.5 font-semibold text-slate-900 shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Operational Day:</span>
          </div>
          <span className="font-mono font-medium text-blue-700 bg-blue-50/80 px-2 py-0.5 rounded border border-blue-100 shrink-0">
            {formatDate(today)}
          </span>
          <span className="hidden md:inline text-slate-400">·</span>
          <span className="hidden md:inline text-slate-500 truncate">
            Asia/Kolkata (IST UTC+5:30) · {tours.some((t) => t.isImported) ? "Real Operational Dataset" : "Demo operational records"}
          </span>
        </div>

        {hasSessionEdits ? (
          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
              <Info size={12} className="text-blue-600" />
              Active Session Modifications ({Object.keys(sessionTours || {}).length})
            </span>
            <button
              type="button"
              onClick={handleResetSession}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded border border-slate-300 transition-colors"
            >
              <RotateCcw size={11} /> Reset Data
            </button>
          </div>
        ) : (
          <span className="text-[11px] font-mono hidden sm:inline">
            {tours.some((t) => t.isImported) ? (
              <span className="text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                Operational Dataset Active ({tours.length} Tours)
              </span>
            ) : (
              <span className="text-slate-400">Baseline Mock Dataset</span>
            )}
          </span>
        )}
      </div>

      {sessionState.status === "error" && (
        <div
          role="alert"
          className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-2.5 text-xs font-medium text-amber-900 flex items-center gap-2 shadow-xs"
        >
          <AlertTriangle size={16} className="text-amber-600 shrink-0" />
          <span>
            <strong>Storage Warning:</strong> Could not read session modifications (
            {sessionState.error}). Showing baseline data until storage access is restored.
          </span>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-xs font-medium text-red-800 flex items-center gap-2 shadow-xs"
        >
          <AlertCircle size={16} className="text-red-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* ── Operational KPI Summary Matrix ───────────────────────────────────── */}
      <section aria-labelledby="metrics-heading">
        <h2 id="metrics-heading" className="sr-only">
          Operational Summary Metrics
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <MetricCard
            label="Arrivals Today"
            value={metrics.arrivalsToday}
            icon={PlaneLanding}
            iconClass="text-blue-700 bg-blue-50/80 border-blue-200"
            href="/calendar"
            description={
              todayArrivals.length > 0
                ? `${todayArrivals[0].group.groupName} (${todayArrivals[0].group.adultCount + todayArrivals[0].group.childCount} pax)`
                : "No inbound flights scheduled today"
            }
          />
          <MetricCard
            label="Departures Today"
            value={metrics.departuresToday}
            icon={PlaneTakeoff}
            iconClass="text-slate-700 bg-slate-100 border-slate-200"
            href="/calendar"
            description={
              todayDepartures.length > 0
                ? `${todayDepartures[0].group.groupName}`
                : "All transfers on schedule"
            }
          />
          <MetricCard
            label="Active Circuit Tours"
            value={metrics.activeToday}
            icon={Activity}
            iconClass="text-emerald-700 bg-emerald-50/80 border-emerald-200"
            href="/tours"
            description={
              activeMovements.length > 0
                ? `${activeMovements.map((t) => t.destination.split(" ")[0]).join(", ")}`
                : "No tours currently in transit"
            }
          />
          <MetricCard
            label="Attention Required"
            value={metrics.requireAttention}
            icon={AlertTriangle}
            iconClass={
              metrics.requireAttention > 0
                ? "text-amber-700 bg-amber-50/80 border-amber-200"
                : "text-slate-600 bg-slate-100 border-slate-200"
            }
            href="/tours"
            description={
              metrics.requireAttention > 0
                ? `${openBlockers.length} open blocker issues`
                : "All operations cleared"
            }
          />
        </div>
      </section>

      {/* ── Tour Status Lifecycle Breakdown ─────────────────────────────────── */}
      <div className="bg-white border border-slate-200/90 rounded-lg p-3 shadow-xs">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Tour Operations Lifecycle Breakdown
          </span>
          <Link
            href="/tours"
            className="text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-0.5"
          >
            <span>View All Tours Roster</span>
            <ChevronRight size={12} />
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          <Link
            href="/tours"
            className="flex flex-col p-2 rounded-md bg-slate-50 hover:bg-slate-100 border border-slate-200/80 transition-colors"
          >
            <span className="text-[10px] text-slate-500 font-medium">Total Roster</span>
            <span className="text-base font-bold text-slate-900 mt-0.5 font-mono">{statusCounts.all}</span>
          </Link>
          <Link
            href="/tours"
            className="flex flex-col p-2 rounded-md bg-emerald-50/60 hover:bg-emerald-100/60 border border-emerald-200/70 transition-colors"
          >
            <span className="text-[10px] text-emerald-700 font-medium">Active Circuits</span>
            <span className="text-base font-bold text-emerald-800 mt-0.5 font-mono">{statusCounts.active}</span>
          </Link>
          <Link
            href="/tours"
            className="flex flex-col p-2 rounded-md bg-blue-50/60 hover:bg-blue-100/60 border border-blue-200/70 transition-colors"
          >
            <span className="text-[10px] text-blue-700 font-medium">Upcoming</span>
            <span className="text-base font-bold text-blue-800 mt-0.5 font-mono">{statusCounts.upcoming}</span>
          </Link>
          <Link
            href="/tours"
            className="flex flex-col p-2 rounded-md bg-amber-50/60 hover:bg-amber-100/60 border border-amber-200/70 transition-colors"
          >
            <span className="text-[10px] text-amber-700 font-medium">Needs Attention</span>
            <span className="text-base font-bold text-amber-800 mt-0.5 font-mono">{statusCounts.attention}</span>
          </Link>
          <Link
            href="/tours"
            className="flex flex-col p-2 rounded-md bg-slate-100 hover:bg-slate-200/70 border border-slate-200 transition-colors"
          >
            <span className="text-[10px] text-slate-600 font-medium">Completed</span>
            <span className="text-base font-bold text-slate-700 mt-0.5 font-mono">{statusCounts.completed}</span>
          </Link>
          <Link
            href="/tours"
            className="flex flex-col p-2 rounded-md bg-red-50/60 hover:bg-red-100/60 border border-red-200/70 transition-colors"
          >
            <span className="text-[10px] text-red-700 font-medium">Cancelled</span>
            <span className="text-base font-bold text-red-800 mt-0.5 font-mono">{statusCounts.cancelled}</span>
          </Link>
        </div>
      </div>

      {/* ── Primary Command Center Grid ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left / Primary Column (7 cols): Movements, Flights, Itinerary */}
        <div className="lg:col-span-7 space-y-5">
          {/* Today's Flight Operations / Arrivals Dispatch */}
          <Card>
            <CardHeader className="bg-slate-50/50">
              <SectionHeader
                title="Today's Flight & Transfer Operations"
                description={`Scheduled movements for ${formatDateShort(today)}`}
                badge={
                  <span className="text-[10px] font-semibold bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                    {todayArrivals.length + todayDepartures.length} movements
                  </span>
                }
              />
            </CardHeader>
            <CardContent className="p-0">
              {todayArrivals.length === 0 && todayDepartures.length === 0 ? (
                <div className="py-6 px-4 text-center">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2 text-slate-400">
                    <Plane size={16} />
                  </div>
                  <p className="text-xs font-semibold text-slate-700">
                    No airport transfers scheduled for today
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Field guides and drivers are active on multi-day itineraries.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {todayArrivals.map((tour) => {
                    const flight = tour.flights.find((f) => f.direction === "arrival");
                    const driver = tour.assignments.find((a) => a.role === "driver");
                    const vehicle = tour.assignments.find((a) => a.role === "vehicle");
                    return (
                      <div
                        key={tour.id}
                        className="p-3.5 sm:p-4 hover:bg-slate-50/80 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                <PlaneLanding size={12} /> Inbound Landing
                              </span>
                              <span className="font-mono text-xs font-semibold text-slate-900">
                                {flight?.flightNumber || "Flight Pending"}
                              </span>
                              {flight?.arrivalTime && (
                                <span className="text-xs font-mono text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded">
                                  ETA {flight.arrivalTime}
                                </span>
                              )}
                            </div>

                            <p className="text-xs font-semibold text-slate-900 mt-1 truncate">
                              {tour.group.groupName} ({tour.group.adultCount + tour.group.childCount} pax)
                            </p>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              Route: {flight?.origin} → {flight?.destination} {flight?.terminal ? `(${flight.terminal})` : ""}
                            </p>
                          </div>

                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <Link
                              href={`/tours/${tour.id}`}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
                            >
                              Dispatch <ChevronRight size={13} />
                            </Link>
                            <span className="text-[10px] text-slate-400">
                              {vehicle?.vehicleType || "Vehicle Pending"}
                            </span>
                          </div>
                        </div>

                        {/* Driver allocation status strip */}
                        <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                          <span className="flex items-center gap-1.5">
                            <UserCheck size={12} className={driver?.status === "assigned" ? "text-emerald-600" : "text-amber-600"} />
                            Driver: <strong className="text-slate-700">{driver?.name || "Unassigned"}</strong>
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Car size={12} className="text-slate-400" />
                            Reg: <strong className="font-mono text-slate-700">{vehicle?.reference || "Pending"}</strong>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upcoming Tour Arrivals (Next 10 Days) */}
          <Card>
            <CardHeader className="bg-slate-50/50">
              <SectionHeader
                title="Upcoming Group Arrivals"
                description="Arrival pipeline over the next 10 days"
                action={
                  <Link
                    href="/tours"
                    className="text-xs text-blue-600 hover:text-blue-800 font-semibold"
                  >
                    View All Tours →
                  </Link>
                }
              />
            </CardHeader>
            <CardContent className="p-0">
              {upcomingArrivals.length === 0 ? (
                <p className="px-5 py-8 text-xs text-slate-400 text-center">
                  No upcoming group arrivals recorded in the next 10 days.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {upcomingArrivals.map((tour) => {
                    const guide = tour.assignments.find((a) => a.role === "guide");
                    const nights = nightsBetween(tour.arrivalDate, tour.departureDate);
                    return (
                      <Link
                        key={tour.id}
                        href={`/tours/${tour.id}`}
                        className="group flex items-center gap-3.5 p-3.5 sm:px-4 hover:bg-slate-50 transition-colors focus:outline-none focus-visible:bg-blue-50"
                      >
                        {/* Date badge */}
                        <div className="w-12 h-12 rounded-md bg-slate-100 border border-slate-200/90 flex flex-col items-center justify-center shrink-0 group-hover:border-blue-300 transition-colors">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {formatDateShort(tour.arrivalDate).split(" ")[1]}
                          </span>
                          <span className="text-sm font-bold text-slate-800 leading-tight">
                            {formatDateShort(tour.arrivalDate).split(" ")[0]}
                          </span>
                        </div>

                        {/* Tour metadata */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-blue-700">
                              {tour.bookingReference}
                            </span>
                            <span className="text-slate-300">·</span>
                            <span className="text-xs font-medium text-slate-700 truncate">
                              {tour.destination}
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-slate-900 mt-0.5 truncate">
                            {tour.group.groupName}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {tour.group.adultCount + tour.group.childCount} pax · {nights} nights · Guide:{" "}
                            <span className={guide?.status === "assigned" ? "text-slate-700 font-medium" : "text-amber-700 font-semibold"}>
                              {guide?.name || "Unassigned"}
                            </span>
                          </p>
                        </div>

                        {/* Status & Relative timing */}
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <StatusBadge status={tour.status} />
                          <span className="text-[11px] text-slate-400">
                            {relativeDayLabel(tour.arrivalDate, today)}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
            <CardFooter className="flex items-center justify-between">
              <span>Showing next {upcomingArrivals.length} scheduled arrivals</span>
              <span className="text-slate-400 font-mono">Real-time mock dataset</span>
            </CardFooter>
          </Card>
        </div>

        {/* Right / Secondary Column (5 cols): Attention, Unresolved Issues, Readiness */}
        <div className="lg:col-span-5 space-y-5">
          {/* Urgent Attention Items & Operational Blockers */}
          <Card className={attentionItems.length > 0 ? "border-amber-200/90" : ""}>
            <CardHeader className={attentionItems.length > 0 ? "bg-amber-50/50 border-b border-amber-100" : "bg-slate-50/50"}>
              <SectionHeader
                title="Action Required & Open Blockers"
                description="Tours with active operational blockers"
                badge={
                  <span className="text-[10px] font-semibold bg-amber-100 text-amber-900 px-2 py-0.5 rounded">
                    {attentionItems.length} tours
                  </span>
                }
              />
            </CardHeader>
            <CardContent className="p-0">
              {attentionItems.length === 0 ? (
                <div className="p-6 text-center">
                  <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2 border border-emerald-200">
                    <CheckCircle2 size={16} />
                  </div>
                  <p className="text-xs font-semibold text-slate-800">
                    No active operational blockers
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    All guides, vehicles, and itinerary requirements verified.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {attentionItems.map((item) => (
                    <Link
                      key={item.tourId}
                      href={`/tours/${item.tourId}`}
                      className="block p-3.5 hover:bg-amber-50/50 transition-colors focus:outline-none focus-visible:bg-amber-50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                          <AlertTriangle
                            size={14}
                            className="text-amber-600 shrink-0 mt-0.5"
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs font-semibold text-slate-900">
                                {item.bookingReference}
                              </span>
                              <span className="text-[10px] font-medium text-slate-500">
                                ({item.groupName})
                              </span>
                            </div>
                            <p className="text-xs text-amber-900 mt-1 leading-snug font-medium">
                              {item.reason}
                            </p>
                          </div>
                        </div>

                        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-blue-600 shrink-0">
                          Review <ChevronRight size={12} />
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Missing Guide, Driver, Vehicle or Hotel Confirmations */}
          <Card>
            <CardHeader className="bg-slate-50/50">
              <SectionHeader
                title="Logistics Allocation Health"
                description="Pending operational assignments across tours"
                badge={
                  <span className="text-[10px] font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                    {unconfirmedLogistics.length} pending
                  </span>
                }
              />
            </CardHeader>
            <CardContent className="p-0">
              {unconfirmedLogistics.length === 0 ? (
                <div className="p-6 text-center">
                  <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2 border border-emerald-200">
                    <CheckCircle2 size={16} />
                  </div>
                  <p className="text-xs font-semibold text-slate-800">
                    All logistics fully confirmed
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Guides, drivers, vehicles, and hotel vouchers are locked in.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                  {unconfirmedLogistics.map((item, idx) => (
                    <Link
                      key={`${item.tourId}-${item.type}-${idx}`}
                      href={`/tours/${item.tourId}`}
                      className="flex items-center justify-between gap-3 p-3 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="w-7 h-7 rounded bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 text-slate-600"
                          aria-hidden="true"
                        >
                          {item.type === "guide" && <UserCheck size={13} />}
                          {item.type === "driver" && <Car size={13} />}
                          {item.type === "vehicle" && <Car size={13} />}
                          {item.type === "hotel" && <Building size={13} />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-900 truncate">
                            {item.item}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {item.bookingReference} · {item.groupName} · Arr: {formatDateShort(item.arrivalDate)}
                          </p>
                        </div>
                      </div>

                      <span className="text-[10px] font-semibold text-blue-600 shrink-0">
                        Assign
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
            <CardFooter className="flex items-center justify-between">
              <span>Verified against current active tours</span>
              <span className="text-blue-600 text-[11px] font-medium">
                Auto-checked
              </span>
            </CardFooter>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
