"use client";

import { useState, useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { Search, SlidersHorizontal, Globe, ChevronRight, AlertTriangle } from "lucide-react";
import {
  PageContainer,
  Card,
  EmptyState,
  Badge,
} from "@/components/ui/Primitives";
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
  TOUR_STATUS_CLASSES,
  TOUR_STATUS_LABELS,
} from "@/lib/utils";

const ALL_STATUSES: Array<{ value: TourStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "upcoming", label: "Upcoming" },
  { value: "attention", label: "Needs Attention" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export interface ToursViewProps {
  initialTours: Tour[];
  referenceDate: string;
}

export function ToursView({ initialTours, referenceDate }: ToursViewProps) {
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

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TourStatus | "all">("all");

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return tours.filter((tour) => {
      const matchesStatus =
        statusFilter === "all" || tour.status === statusFilter;
      const matchesSearch =
        !q ||
        tour.bookingReference.toLowerCase().includes(q) ||
        tour.group.groupName.toLowerCase().includes(q) ||
        tour.destination.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [tours, searchQuery, statusFilter]);

  return (
    <PageContainer>
      {sessionState.status === "error" && (
        <div
          role="alert"
          className="mb-4 bg-amber-50 border border-amber-300 rounded-lg px-4 py-2.5 text-xs font-medium text-amber-900 flex items-center gap-2"
        >
          <AlertTriangle size={16} className="text-amber-600 shrink-0" />
          <span>
            <strong>Session Storage Read Failure:</strong> Could not retrieve saved tour modifications ({sessionState.error}). Showing baseline mock tours.
          </span>
        </div>
      )}

      {/* Filter toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            placeholder="Search by reference, group name, or destination…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Search tours"
          />
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1 flex-wrap" role="group" aria-label="Filter by status">
          <SlidersHorizontal size={15} className="text-slate-400 mr-1 shrink-0" aria-hidden="true" />
          {ALL_STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value as TourStatus | "all")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                statusFilter === s.value
                  ? "bg-blue-600 text-white"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              )}
              aria-pressed={statusFilter === s.value}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results count & reference date anchor */}
      <div className="flex items-center justify-between text-xs text-slate-400">
        <p>
          {filtered.length} {filtered.length === 1 ? "tour" : "tours"} found
        </p>
        <p>
          Relative to India date: {formatDate(referenceDate)}
        </p>
      </div>

      {/* Tours table */}
      <Card>
        {filtered.length === 0 ? (
          <EmptyState
            icon={Globe}
            title="No tours found"
            description="Try adjusting your search query or status filter to find the tour you're looking for."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                    Reference
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                    Group / Guests
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap hidden md:table-cell">
                    Destination
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap hidden lg:table-cell">
                    Arrival
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap hidden lg:table-cell">
                    Departure
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                    Status
                  </th>
                  <th className="px-4 py-3 w-8">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tour, idx) => (
                  <tr
                    key={tour.id}
                    className={cn(
                      "hover:bg-slate-50 transition-colors",
                      idx !== filtered.length - 1 ? "border-b border-slate-100" : ""
                    )}
                  >
                    <td className="px-5 py-3 font-mono text-xs font-semibold text-blue-700 whitespace-nowrap">
                      <Link
                        href={`/tours/${tour.id}`}
                        className="hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                      >
                        {tour.bookingReference}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800 truncate max-w-[180px]">
                        {tour.group.groupName}
                      </p>
                      <p className="text-xs text-slate-400">
                        {tour.group.adultCount + tour.group.childCount} pax
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-600 hidden md:table-cell max-w-[160px] truncate">
                      {tour.destination}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap hidden lg:table-cell">
                      {formatDate(tour.arrivalDate)}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap hidden lg:table-cell">
                      {formatDate(tour.departureDate)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={TOUR_STATUS_CLASSES[tour.status]}>
                        {TOUR_STATUS_LABELS[tour.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/tours/${tour.id}`}
                        className="flex items-center justify-center text-slate-400 hover:text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                        aria-label={`View details for ${tour.bookingReference}`}
                      >
                        <ChevronRight size={16} aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PageContainer>
  );
}
