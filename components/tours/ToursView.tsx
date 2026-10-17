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

const STATUS_TABS: Array<{ value: TourStatus | "all"; label: string }> = [
  { value: "all", label: "All Tours" },
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
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const existingReferences = useMemo(() => {
    return tours.map((t) => t.bookingReference);
  }, [tours]);

  // Live status counts
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
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

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return tours.filter((tour) => {
      const matchesStatus =
        statusFilter === "all" || tour.status === statusFilter;
      const matchesSearch =
        !q ||
        tour.bookingReference.toLowerCase().includes(q) ||
        tour.group.groupName.toLowerCase().includes(q) ||
        tour.destination.toLowerCase().includes(q) ||
        tour.group.nationality.toLowerCase().includes(q) ||
        tour.assignments.some((a) => a.name?.toLowerCase().includes(q));
      return matchesStatus && matchesSearch;
    });
  }, [tours, searchQuery, statusFilter]);

  return (
    <PageContainer>
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
      <div className="bg-white border border-slate-200/90 rounded-lg p-3.5 shadow-xs space-y-3">
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
              placeholder="Filter by ref, group, destination, guide, or nationality…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 text-xs bg-slate-50 border border-slate-300/80 rounded-md text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors"
              aria-label="Filter tours"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Reference Date Context */}
          <div className="text-right text-[11px] text-slate-500 flex items-center justify-end gap-1.5">
            <Calendar size={13} className="text-slate-400 shrink-0" />
            <span>Operational Base Date:</span>
            <strong className="font-mono text-slate-700">
              {formatDate(referenceDate)}
            </strong>
          </div>
        </div>

        {/* Status filter tabs */}
        <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-slate-100" role="group" aria-label="Status filter">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-1">
            <SlidersHorizontal size={12} />
            <span>Status:</span>
          </div>
          {STATUS_TABS.map((tab) => {
            const count = statusCounts[tab.value] ?? 0;
            const isSelected = statusFilter === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value as TourStatus | "all")}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                  isSelected
                    ? "bg-blue-600 text-white shadow-xs font-semibold"
                    : "bg-slate-100/80 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900"
                )}
                aria-pressed={isSelected}
              >
                <span>{tab.label}</span>
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.2 rounded-full tabular-nums font-mono",
                    isSelected
                      ? "bg-blue-700/80 text-white"
                      : "bg-white text-slate-500 border border-slate-200"
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
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
      <Card>
        <CardHeader className="bg-slate-50/50 py-2.5 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Active Tour Operations Roster
            </h2>
            <Badge variant="neutral" className="font-mono text-[10px]">
              {filtered.length} {filtered.length === 1 ? "record" : "records"}
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-400 hidden sm:inline">
              Click row to open operations file
            </span>
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <PlusCircle size={13} />
              <span>New Tour</span>
            </button>
          </div>
        </CardHeader>

        {filtered.length === 0 ? (
          <EmptyState
            icon={Compass}
            title="No tours match current filters"
            description="Adjust your search terms or status filter to locate the operational tour record."
            action={
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                }}
                className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md border border-blue-200 transition-colors"
              >
                Reset all filters
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-2.5 px-3 whitespace-nowrap">Reference</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Group / Party</th>
                  <th className="py-2.5 px-3 whitespace-nowrap hidden sm:table-cell">Circuit Destination</th>
                  <th className="py-2.5 px-3 whitespace-nowrap hidden md:table-cell">Schedule (Arr → Dep)</th>
                  <th className="py-2.5 px-3 whitespace-nowrap hidden lg:table-cell">Guide</th>
                  <th className="py-2.5 px-3 whitespace-nowrap hidden xl:table-cell">Vehicle / Fleet</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Status</th>
                  <th className="py-2.5 px-3 whitespace-nowrap hidden sm:table-cell">Readiness</th>
                  <th className="py-2.5 px-3 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((tour) => {
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
                        "group hover:bg-blue-50/30 transition-colors",
                        isAttention && "bg-amber-50/20"
                      )}
                    >
                      {/* Booking Reference */}
                      <td className="py-2.5 px-3 font-mono text-xs font-bold text-blue-700 whitespace-nowrap">
                        <Link
                          href={`/tours/${tour.id}`}
                          className="hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                        >
                          {tour.bookingReference}
                        </Link>
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
                            Unassigned
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
                          {driver?.name || "Driver pending"}
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
                            {openIssuesCount} {openIssuesCount === 1 ? "Blocker" : "Blockers"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                            Ready
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <Link
                          href={`/tours/${tour.id}`}
                          className="inline-flex items-center gap-0.5 px-2 py-1 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                          aria-label={`Open tour ${tour.bookingReference}`}
                        >
                          <span>Open</span>
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
          setFeedbackMessage(`Tour ${newTour.bookingReference} (${newTour.group.groupName}) successfully created in session.`);
          setStatusFilter("all");
        }}
        existingReferences={existingReferences}
      />
    </PageContainer>
  );
}
