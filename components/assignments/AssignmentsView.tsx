"use client";

import { useState, useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  UserCheck,
  Car,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Edit3,
  Search,
  X,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";
import {
  PageContainer,
  Card,
  CardHeader,
  CardFooter,
  Badge,
  AssignmentBadge,
} from "@/components/ui/Primitives";
import type { Tour, AssignmentRole, AssignmentStatus, VehicleType } from "@/lib/types";
import { APPROVED_VEHICLE_TYPES } from "@/lib/types";
import {
  subscribeSessionStore,
  getSessionSnapshot,
  getServerSnapshot,
  mergeSessionTours,
  saveSessionTour,
  parseSessionSnapshot,
} from "@/lib/session-store";
import { detectAssignmentConflicts } from "@/lib/operations";
import { formatDateShort } from "@/lib/utils";
import { cn } from "@/components/ui/utils";

export interface AssignmentsViewProps {
  initialTours: Tour[];
  referenceDate: string;
}

interface FlattenedAssignment {
  key: string;
  tourId: string;
  bookingReference: string;
  groupName: string;
  destination: string;
  arrivalDate: string;
  departureDate: string;
  tourStatus: string;
  role: AssignmentRole;
  status: AssignmentStatus;
  name?: string;
  contact?: string;
  reference?: string;
  vehicleType?: VehicleType;
  notes?: string;
  tour: Tour;
}

export function AssignmentsView({ initialTours }: AssignmentsViewProps) {
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

  // Operational conflict detection across active tours
  const conflicts = useMemo(() => {
    return detectAssignmentConflicts(tours);
  }, [tours]);

  // Filters state
  const [roleFilter, setRoleFilter] = useState<AssignmentRole | "all" | "conflicts">("all");
  const [statusFilter, setStatusFilter] = useState<AssignmentStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Edit / Reassign modal state
  const [editingAssignment, setEditingAssignment] = useState<FlattenedAssignment | null>(null);
  const [draftStatus, setDraftStatus] = useState<AssignmentStatus>("assigned");
  const [draftName, setDraftName] = useState("");
  const [draftContact, setDraftContact] = useState("");
  const [draftReference, setDraftReference] = useState("");
  const [draftVehicleType, setDraftVehicleType] = useState<VehicleType | "">("");
  const [draftNotes, setDraftNotes] = useState("");
  const [modalError, setModalError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Flatten assignments across non-cancelled tours
  const flattenedAssignments = useMemo(() => {
    const list: FlattenedAssignment[] = [];
    tours
      .filter((t) => t.status !== "cancelled")
      .forEach((tour) => {
        tour.assignments.forEach((a, idx) => {
          list.push({
            key: `${tour.id}-${a.role}-${idx}`,
            tourId: tour.id,
            bookingReference: tour.bookingReference,
            groupName: tour.group.groupName,
            destination: tour.destination,
            arrivalDate: tour.arrivalDate,
            departureDate: tour.departureDate,
            tourStatus: tour.status,
            role: a.role,
            status: a.status,
            name: a.name,
            contact: a.contact,
            reference: a.reference,
            vehicleType: a.vehicleType,
            notes: a.notes,
            tour,
          });
        });
      });
    return list;
  }, [tours]);

  // Quick summary counts
  const counts = useMemo(() => {
    let guidesAssigned = 0;
    let guidesPending = 0;
    let driversAssigned = 0;
    let driversPending = 0;
    let vehiclesAssigned = 0;
    let vehiclesPending = 0;

    flattenedAssignments.forEach((a) => {
      if (a.role === "guide") {
        if (a.status === "assigned") guidesAssigned++;
        else guidesPending++;
      } else if (a.role === "driver") {
        if (a.status === "assigned") driversAssigned++;
        else driversPending++;
      } else if (a.role === "vehicle") {
        if (a.status === "assigned") vehiclesAssigned++;
        else vehiclesPending++;
      }
    });

    return {
      guidesAssigned,
      guidesPending,
      driversAssigned,
      driversPending,
      vehiclesAssigned,
      vehiclesPending,
      conflictsCount: conflicts.length,
    };
  }, [flattenedAssignments, conflicts]);

  // Filtered list
  const filtered = useMemo(() => {
    return flattenedAssignments.filter((item) => {
      // Role filter
      if (roleFilter === "conflicts") {
        // Only show items involved in any conflict
        const isConflict = conflicts.some(
          (c) =>
            c.resourceType === item.role &&
            (c.tourA.id === item.tourId || c.tourB.id === item.tourId)
        );
        if (!isConflict) return false;
      } else if (roleFilter !== "all" && item.role !== roleFilter) {
        return false;
      }

      // Status filter
      if (statusFilter !== "all" && item.status !== statusFilter) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          item.bookingReference.toLowerCase().includes(q) ||
          item.groupName.toLowerCase().includes(q) ||
          item.destination.toLowerCase().includes(q) ||
          item.name?.toLowerCase().includes(q) ||
          item.reference?.toLowerCase().includes(q) ||
          item.vehicleType?.toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [flattenedAssignments, roleFilter, statusFilter, searchQuery, conflicts]);

  // Open edit modal
  function openEdit(item: FlattenedAssignment) {
    setEditingAssignment(item);
    setDraftStatus(item.status);
    setDraftName(item.name || "");
    setDraftContact(item.contact || "");
    setDraftReference(item.reference || "");
    setDraftVehicleType(item.vehicleType || "");
    setDraftNotes(item.notes || "");
    setModalError(null);
  }

  // Save assignment changes
  function handleSaveAssignment() {
    if (!editingAssignment) return;

    if (draftStatus === "assigned" && editingAssignment.role !== "vehicle" && !draftName.trim()) {
      setModalError(`A name is required when marking this ${editingAssignment.role} as Assigned.`);
      return;
    }

    const currentTour = editingAssignment.tour;
    const updatedAssignments = currentTour.assignments.map((a) => {
      if (a.role === editingAssignment.role) {
        return {
          ...a,
          status: draftStatus,
          name: draftName.trim() || undefined,
          contact: draftContact.trim() || undefined,
          reference: draftReference.trim() || undefined,
          vehicleType: draftVehicleType ? (draftVehicleType as VehicleType) : undefined,
          notes: draftNotes.trim() || undefined,
        };
      }
      return a;
    });

    const updatedTour: Tour = {
      ...currentTour,
      assignments: updatedAssignments,
      lastUpdated: new Date().toISOString(),
    };

    const result = saveSessionTour(updatedTour);
    if (!result.success) {
      setModalError(result.error || "Failed to persist assignment update to browser storage.");
      return;
    }

    setEditingAssignment(null);
    setSuccessNotice(
      `Successfully updated ${editingAssignment.role} allocation for ${editingAssignment.bookingReference}.`
    );
    setTimeout(() => setSuccessNotice(null), 4000);
  }

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
            <strong>Storage Warning:</strong> Could not read session modifications ({sessionState.error}). Showing baseline assignment data.
          </span>
        </div>
      )}

      {/* Success banner */}
      {successNotice && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2 text-xs font-medium text-emerald-800 flex items-center gap-2 shadow-xs">
          <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
          <span>{successNotice}</span>
        </div>
      )}

      {/* ── Resource Conflict Alert Banner ─────────────────────────────────── */}
      {conflicts.length > 0 && (
        <div
          role="alert"
          className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4 text-xs text-amber-950 shadow-xs space-y-2"
        >
          <div className="flex items-center gap-2 font-bold text-amber-900 text-sm">
            <ShieldAlert size={18} className="text-amber-600 shrink-0" />
            <span>OPERATIONAL ALLOCATION CONFLICT DETECTED ({conflicts.length})</span>
          </div>
          <p className="text-amber-800 leading-relaxed text-[11px]">
            The system detected overlapping dates for the same assigned field resource across active tours. Double-booked staff cannot service multiple concurrent circuit itineraries:
          </p>
          <div className="space-y-1.5 pt-1">
            {conflicts.map((c, i) => (
              <div
                key={i}
                className="bg-white/80 border border-amber-200 rounded p-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-amber-900 uppercase font-mono text-[10px] bg-amber-100 px-1.5 py-0.5 rounded">
                    {c.resourceType}
                  </span>
                  <span className="font-medium text-slate-800">{c.conflictDescription}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] shrink-0 font-mono">
                  <Link
                    href={`/tours/${c.tourA.id}`}
                    className="text-blue-700 hover:underline font-semibold"
                  >
                    {c.tourA.bookingReference}
                  </Link>
                  <span className="text-slate-300">↔</span>
                  <Link
                    href={`/tours/${c.tourB.id}`}
                    className="text-blue-700 hover:underline font-semibold"
                  >
                    {c.tourB.bookingReference}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── KPI Summary Cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Tour Guides
            </span>
            <UserCheck size={16} className="text-blue-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl font-bold text-slate-900 font-mono">
              {counts.guidesAssigned}
            </span>
            <span className="text-xs text-slate-500 font-medium">Assigned</span>
            {counts.guidesPending > 0 && (
              <span className="text-xs font-semibold text-amber-700 font-mono">
                ({counts.guidesPending} pending)
              </span>
            )}
          </div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Chauffeurs & Drivers
            </span>
            <UserCheck size={16} className="text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl font-bold text-slate-900 font-mono">
              {counts.driversAssigned}
            </span>
            <span className="text-xs text-slate-500 font-medium">Allocated</span>
            {counts.driversPending > 0 && (
              <span className="text-xs font-semibold text-amber-700 font-mono">
                ({counts.driversPending} pending)
              </span>
            )}
          </div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Vehicles & Fleet
            </span>
            <Car size={16} className="text-purple-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl font-bold text-slate-900 font-mono">
              {counts.vehiclesAssigned}
            </span>
            <span className="text-xs text-slate-500 font-medium">Ready</span>
            {counts.vehiclesPending > 0 && (
              <span className="text-xs font-semibold text-amber-700 font-mono">
                ({counts.vehiclesPending} pending)
              </span>
            )}
          </div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Schedule Conflicts
            </span>
            <ShieldAlert size={16} className={counts.conflictsCount > 0 ? "text-amber-600" : "text-emerald-600"} />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={cn(
              "text-xl font-bold font-mono",
              counts.conflictsCount > 0 ? "text-amber-700" : "text-emerald-700"
            )}>
              {counts.conflictsCount}
            </span>
            <span className="text-xs text-slate-500 font-medium">
              {counts.conflictsCount === 0 ? "No Double Bookings" : "Conflicts Active"}
            </span>
          </div>
        </Card>
      </div>

      {/* ── Filters & Search Ribbon ─────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200/90 rounded-lg p-3.5 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="search"
              placeholder="Search by tour ref, party name, resource name, or vehicle…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Status selector */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 font-semibold uppercase text-[10px]">Status:</span>
            <div className="flex items-center gap-1 border border-slate-200 rounded p-0.5 bg-slate-50">
              {(["all", "assigned", "pending", "unassigned"] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={cn(
                    "px-2 py-0.5 rounded text-[11px] font-semibold transition-colors capitalize",
                    statusFilter === st
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-500 hover:text-slate-900"
                  )}
                >
                  {st === "all" ? "All" : st}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Role tabs */}
        <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-100">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mr-1">
            Resource Role:
          </span>
          <button
            type="button"
            onClick={() => setRoleFilter("all")}
            className={cn(
              "px-2.5 py-1 rounded text-xs font-semibold transition-colors",
              roleFilter === "all"
                ? "bg-slate-900 text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}
          >
            All Roles ({flattenedAssignments.length})
          </button>
          <button
            type="button"
            onClick={() => setRoleFilter("guide")}
            className={cn(
              "inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-colors",
              roleFilter === "guide"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-blue-50 text-blue-700 hover:bg-blue-100"
            )}
          >
            <UserCheck size={12} />
            Tour Guides
          </button>
          <button
            type="button"
            onClick={() => setRoleFilter("driver")}
            className={cn(
              "inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-colors",
              roleFilter === "driver"
                ? "bg-emerald-600 text-white shadow-xs"
                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            )}
          >
            <UserCheck size={12} />
            Drivers & Chauffeurs
          </button>
          <button
            type="button"
            onClick={() => setRoleFilter("vehicle")}
            className={cn(
              "inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-colors",
              roleFilter === "vehicle"
                ? "bg-purple-600 text-white shadow-xs"
                : "bg-purple-50 text-purple-700 hover:bg-purple-100"
            )}
          >
            <Car size={12} />
            Fleet Vehicles
          </button>
          {conflicts.length > 0 && (
            <button
              type="button"
              onClick={() => setRoleFilter("conflicts")}
              className={cn(
                "inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-colors ml-auto",
                roleFilter === "conflicts"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-300"
              )}
            >
              <ShieldAlert size={12} />
              Conflicts Only ({conflicts.length})
            </button>
          )}
        </div>
      </div>

      {/* ── Operational Allocations Table ───────────────────────────────────── */}
      <Card>
        <CardHeader className="bg-slate-50/50 py-2.5 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Resource Dispatch & Allocation Roster
            </h2>
            <Badge variant="neutral" className="font-mono text-[10px]">
              {filtered.length} entries
            </Badge>
          </div>
          <span className="text-[11px] text-slate-400 hidden sm:inline">
            Click &quot;Reassign&quot; to update dispatch status
          </span>
        </CardHeader>

        {filtered.length === 0 ? (
          <div className="p-8 text-center">
            <UserCheck size={28} className="text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-700">No allocations match your filter</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Try clearing your search query or filter tags.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50/90 text-slate-600 text-[11px] uppercase font-bold tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Tour Ref & Group</th>
                  <th className="py-2.5 px-3">Circuit Dates & City</th>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3">Assigned Resource</th>
                  <th className="py-2.5 px-3">Contact / Plate</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((item) => {
                  const isConflicted = conflicts.some(
                    (c) =>
                      c.resourceType === item.role &&
                      (c.tourA.id === item.tourId || c.tourB.id === item.tourId)
                  );

                  return (
                    <tr
                      key={item.key}
                      className={cn(
                        "hover:bg-slate-50/80 transition-colors",
                        isConflicted && "bg-amber-50/40"
                      )}
                    >
                      {/* Tour Ref */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <Link
                          href={`/tours/${item.tourId}`}
                          className="font-mono font-bold text-blue-700 hover:text-blue-900 hover:underline flex items-center gap-1"
                        >
                          <span>{item.bookingReference}</span>
                          <ChevronRight size={12} className="text-slate-400" />
                        </Link>
                        <p className="text-[11px] text-slate-600 truncate max-w-[150px] font-medium">
                          {item.groupName}
                        </p>
                      </td>

                      {/* Circuit Dates */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="font-mono text-slate-800 text-[11px]">
                          {formatDateShort(item.arrivalDate)} – {formatDateShort(item.departureDate)}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[140px]">
                          {item.destination}
                        </p>
                      </td>

                      {/* Role */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="font-semibold uppercase tracking-wider text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                          {item.role}
                        </span>
                      </td>

                      {/* Resource Name / Type */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="font-medium text-slate-900">
                          {item.role === "vehicle"
                            ? item.vehicleType || "Vehicle not selected"
                            : item.name || "Pending allocation"}
                        </div>
                        {isConflicted && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 font-bold bg-amber-100 px-1.5 py-0.2 rounded mt-0.5">
                            <AlertTriangle size={10} /> Double-booked
                          </span>
                        )}
                      </td>

                      {/* Contact / Plate */}
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-500 text-[11px] font-mono">
                        {item.role === "vehicle"
                          ? item.reference || "—"
                          : item.contact || "—"}
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <AssignmentBadge status={item.status} />
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openEdit(item)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                        >
                          <Edit3 size={12} />
                          <span>Reassign</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <CardFooter className="flex items-center justify-between text-xs text-slate-500">
          <span>Displaying {filtered.length} of {flattenedAssignments.length} operational assignments</span>
          <span className="text-[11px] font-mono text-slate-400">SATF Dispatch Operations</span>
        </CardFooter>
      </Card>

      {/* ── Reassign Modal ──────────────────────────────────────────────────── */}
      {editingAssignment && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reassign-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs"
        >
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div>
                <h3 id="reassign-modal-title" className="text-sm font-bold text-slate-900 capitalize">
                  Update {editingAssignment.role} Assignment
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tour <span className="font-mono font-semibold">{editingAssignment.bookingReference}</span> · {editingAssignment.groupName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingAssignment(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition-colors"
                aria-label="Close dialog"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-3.5">
              {modalError && (
                <div
                  role="alert"
                  className="bg-red-50 border border-red-200 rounded-md p-2.5 text-xs text-red-800 flex items-start gap-2"
                >
                  <AlertCircle size={14} className="text-red-600 shrink-0 mt-0.5" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Status Radio */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Allocation Status
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["assigned", "pending", "unassigned"] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setDraftStatus(st)}
                      className={cn(
                        "py-1.5 px-2 text-xs font-semibold rounded-md border text-center capitalize transition-colors",
                        draftStatus === st
                          ? "bg-blue-50 border-blue-400 text-blue-800 ring-1 ring-blue-400"
                          : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                      )}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Vehicle specific: structured vehicle type selector */}
              {editingAssignment.role === "vehicle" ? (
                <>
                  <div>
                    <label htmlFor="assign-veh-type" className="block text-xs font-semibold text-slate-700 mb-1">
                      Structured Vehicle Category
                    </label>
                    <select
                      id="assign-veh-type"
                      value={draftVehicleType}
                      onChange={(e) => setDraftVehicleType(e.target.value as VehicleType | "")}
                      className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <option value="">— Select Vehicle Category —</option>
                      {APPROVED_VEHICLE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="assign-veh-reg" className="block text-xs font-semibold text-slate-700 mb-1">
                      Vehicle Registration / Fleet Number
                    </label>
                    <input
                      id="assign-veh-reg"
                      type="text"
                      value={draftReference}
                      onChange={(e) => setDraftReference(e.target.value)}
                      placeholder="e.g. DL 01 AB 1234"
                      className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 font-mono"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label htmlFor="assign-res-name" className="block text-xs font-semibold text-slate-700 mb-1">
                      {editingAssignment.role === "guide" ? "Guide Full Name" : "Driver Name"}
                      {draftStatus === "assigned" && <span className="text-red-600">*</span>}
                    </label>
                    <input
                      id="assign-res-name"
                      type="text"
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      placeholder="e.g. Ramesh Kumar"
                      className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="assign-res-phone" className="block text-xs font-semibold text-slate-700 mb-1">
                      Phone Number / Contact Reference
                    </label>
                    <input
                      id="assign-res-phone"
                      type="text"
                      value={draftContact}
                      onChange={(e) => setDraftContact(e.target.value)}
                      placeholder="e.g. +91 98765 43210"
                      className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 font-mono"
                    />
                  </div>
                </>
              )}

              <div>
                <label htmlFor="assign-notes" className="block text-xs font-semibold text-slate-700 mb-1">
                  Dispatch Notes
                </label>
                <textarea
                  id="assign-notes"
                  rows={2}
                  value={draftNotes}
                  onChange={(e) => setDraftNotes(e.target.value)}
                  placeholder="Optional operational or licensing notes…"
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingAssignment(null)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-300 rounded-md shadow-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAssignment}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-xs transition-colors"
              >
                Save Assignment
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
