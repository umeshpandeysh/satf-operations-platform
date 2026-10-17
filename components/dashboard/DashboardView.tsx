"use client";

import { useMemo, useSyncExternalStore, useState } from "react";
import Link from "next/link";
import {
  Plane,
  LogOut,
  Activity,
  AlertTriangle,
  RotateCcw,
  Info,
  AlertCircle,
} from "lucide-react";
import {
  MetricCard,
  Card,
  CardHeader,
  CardContent,
  SectionHeader,
  PageContainer,
  Badge,
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
  TOUR_STATUS_CLASSES,
  TOUR_STATUS_LABELS,
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
      setErrorMessage(result.error || "Failed to reset session edits in browser storage.");
      setTimeout(() => setErrorMessage(null), 5000);
    }
  }

  return (
    <PageContainer>
      {/* Demo notice */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 text-xs text-blue-700">
        <div className="flex items-center gap-2">
          <span className="font-semibold">Demo mode</span>
          <span className="text-blue-500">·</span>
          <span>
            All operational data is fictional and generated relative to current India date:{" "}
            <strong>{formatDate(today)} (Asia/Kolkata)</strong>.
          </span>
        </div>
        {hasSessionEdits && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1 font-medium text-blue-800 bg-blue-100/80 px-2 py-0.5 rounded text-[11px]">
              <Info size={12} /> Active session edits applied
            </span>
            <button
              type="button"
              onClick={handleResetSession}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-800 hover:text-blue-950 underline"
            >
              <RotateCcw size={12} /> Reset
            </button>
          </div>
        )}
      </div>

      {sessionState.status === "error" && (
        <div
          role="alert"
          className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-2.5 text-xs font-medium text-amber-900 flex items-center gap-2"
        >
          <AlertTriangle size={16} className="text-amber-600 shrink-0" />
          <span>
            <strong>Session Storage Read Failure:</strong> Could not load saved session modifications ({sessionState.error}). Showing baseline data until storage access is restored.
          </span>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-xs font-medium text-red-800 flex items-center gap-2"
        >
          <AlertCircle size={16} className="text-red-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Metrics grid */}
      <section aria-labelledby="metrics-heading">
        <h2 id="metrics-heading" className="sr-only">
          Operational summary
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Arrivals today"
            value={metrics.arrivalsToday}
            icon={Plane}
            iconClass="text-blue-600 bg-blue-50"
          />
          <MetricCard
            label="Departures today"
            value={metrics.departuresToday}
            icon={LogOut}
            iconClass="text-slate-600 bg-slate-100"
          />
          <MetricCard
            label="Active tours"
            value={metrics.activeToday}
            icon={Activity}
            iconClass="text-emerald-600 bg-emerald-50"
          />
          <MetricCard
            label="Need attention"
            value={metrics.requireAttention}
            icon={AlertTriangle}
            iconClass="text-amber-600 bg-amber-50"
            description={
              metrics.requireAttention > 0
                ? "Action required"
                : "All clear"
            }
          />
        </div>
      </section>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Upcoming arrivals */}
        <section className="lg:col-span-2" aria-labelledby="arrivals-heading">
          <Card>
            <CardHeader>
              <SectionHeader
                title="Upcoming arrivals"
                description="Next 10 days"
                action={
                  <Link
                    href="/tours"
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    All tours →
                  </Link>
                }
              />
            </CardHeader>
            <CardContent className="p-0">
              {upcomingArrivals.length === 0 ? (
                <p className="px-5 py-8 text-sm text-slate-400 text-center">
                  No upcoming arrivals in the next 10 days.
                </p>
              ) : (
                <ul aria-label="Upcoming arrivals">
                  {upcomingArrivals.map((tour, idx) => (
                    <li
                      key={tour.id}
                      className={
                        idx !== upcomingArrivals.length - 1
                          ? "border-b border-slate-100"
                          : ""
                      }
                    >
                      <Link
                        href={`/tours/${tour.id}`}
                        className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50 transition-colors focus:outline-none focus-visible:bg-blue-50"
                      >
                        <div className="w-14 shrink-0 text-center">
                          <p className="text-lg font-bold text-slate-800 leading-none">
                            {formatDateShort(tour.arrivalDate).split(" ")[0]}
                          </p>
                          <p className="text-xs text-slate-400 uppercase tracking-wide">
                            {formatDateShort(tour.arrivalDate).split(" ")[1]}
                          </p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">
                            {tour.group.groupName}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            {tour.destination} ·{" "}
                            {tour.group.adultCount + tour.group.childCount} pax
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <Badge className={TOUR_STATUS_CLASSES[tour.status]}>
                            {TOUR_STATUS_LABELS[tour.status]}
                          </Badge>
                          <span className="text-xs text-slate-400">
                            {relativeDayLabel(tour.arrivalDate, today)}
                          </span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Attention panel */}
        <section aria-labelledby="attention-heading">
          <Card>
            <CardHeader>
              <SectionHeader
                title="Needs attention"
                description="Action required before tour date"
              />
            </CardHeader>
            <CardContent className="p-0">
              {attentionItems.length === 0 ? (
                <p className="px-5 py-8 text-sm text-slate-400 text-center">
                  No tours currently require attention.
                </p>
              ) : (
                <ul aria-label="Tours needing attention">
                  {attentionItems.map((item, idx) => (
                    <li
                      key={item.tourId}
                      className={
                        idx !== attentionItems.length - 1
                          ? "border-b border-slate-100"
                          : ""
                      }
                    >
                      <Link
                        href={`/tours/${item.tourId}`}
                        className="block px-5 py-3 hover:bg-amber-50 transition-colors focus:outline-none focus-visible:bg-amber-50"
                      >
                        <div className="flex items-start gap-2">
                          <AlertTriangle
                            size={14}
                            className="text-amber-500 shrink-0 mt-0.5"
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800">
                              {item.bookingReference}
                            </p>
                            <p className="text-xs text-slate-500 truncate">
                              {item.groupName}
                            </p>
                            <p className="text-xs text-amber-700 mt-1 leading-snug line-clamp-2">
                              {item.reason}
                            </p>
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </PageContainer>
  );
}
