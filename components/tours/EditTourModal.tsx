"use client";

import { useState, useEffect, useRef } from "react";
import {
  X,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Info,
} from "lucide-react";
import type { Tour, TourStatus, AssignmentStatus, OperationalIssue } from "@/lib/types";

interface EditTourModalProps {
  tour: Tour;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedTour: Tour) => void;
}

const TOUR_STATUS_OPTIONS: Array<{ value: TourStatus; label: string }> = [
  { value: "upcoming", label: "Upcoming" },
  { value: "active", label: "Active" },
  { value: "attention", label: "Needs Attention" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const ASSIGNMENT_STATUS_OPTIONS: Array<{ value: AssignmentStatus; label: string }> = [
  { value: "assigned", label: "Assigned" },
  { value: "pending", label: "Pending" },
  { value: "unassigned", label: "Unassigned" },
];

export function EditTourModal({
  tour,
  isOpen,
  onClose,
  onSave,
}: EditTourModalProps) {
  // ─── Form State prefilled from tour ──────────────────────────────────────────
  const [status, setStatus] = useState<TourStatus>(tour.status);
  const [operationalNotes, setOperationalNotes] = useState(tour.operationalNotes ?? "");

  // Guide assignment
  const guideAssignment = tour.assignments.find((a) => a.role === "guide");
  const [guideStatus, setGuideStatus] = useState<AssignmentStatus>(
    guideAssignment?.status ?? "unassigned"
  );
  const [guideName, setGuideName] = useState(guideAssignment?.name ?? "");
  const [guideRef, setGuideRef] = useState(guideAssignment?.reference ?? "");

  // Driver & Vehicle assignment (Optional fields)
  const driverAssignment = tour.assignments.find((a) => a.role === "driver");
  const vehicleAssignment = tour.assignments.find((a) => a.role === "vehicle");
  const [driverStatus, setDriverStatus] = useState<AssignmentStatus>(
    driverAssignment?.status ?? "unassigned"
  );
  const [driverName, setDriverName] = useState(driverAssignment?.name ?? "");
  const [driverNotes, setDriverNotes] = useState(driverAssignment?.notes ?? "");
  const [vehicleStatus, setVehicleStatus] = useState<AssignmentStatus>(
    vehicleAssignment?.status ?? "unassigned"
  );
  const [vehicleRef, setVehicleRef] = useState(vehicleAssignment?.reference ?? "");
  const [vehicleNotes, setVehicleNotes] = useState(vehicleAssignment?.notes ?? "");

  // Hotel confirmation (Optional field)
  const [hotelConfirmation, setHotelConfirmation] = useState(
    tour.hotels[0]?.confirmationNumber ?? ""
  );

  // Discrete Independent Issues
  const [issues, setIssues] = useState<OperationalIssue[]>(
    tour.issues?.map((iss) => ({ ...iss })) ?? []
  );

  // Inline Validation Errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  const modalRef = useRef<HTMLDivElement>(null);


  // Keyboard accessibility: Escape to cancel
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Toggle single issue resolution independently
  function handleToggleIssue(issueId: string) {
    setIssues((prev) =>
      prev.map((iss) => {
        if (iss.id === issueId) {
          const nextResolved = !iss.resolved;
          return {
            ...iss,
            resolved: nextResolved,
            resolvedAt: nextResolved ? new Date().toISOString() : undefined,
          };
        }
        return iss;
      })
    );
  }

  function handleIssueNotesChange(issueId: string, notes: string) {
    setIssues((prev) =>
      prev.map((iss) => (iss.id === issueId ? { ...iss, resolutionNotes: notes } : iss))
    );
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();

    // Inline validation rules
    const newErrors: Record<string, string> = {};

    if (guideStatus === "assigned" && !guideName.trim()) {
      newErrors.guideName = "Guide name is required when guide status is marked as 'Assigned'.";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Build updated assignments preserving structure
    const updatedAssignments = tour.assignments.map((assignment) => {
      if (assignment.role === "guide") {
        return {
          ...assignment,
          status: guideStatus,
          name: guideName.trim() || undefined,
          reference: guideRef.trim() || undefined,
        };
      }
      if (assignment.role === "driver") {
        return {
          ...assignment,
          status: driverStatus,
          name: driverName.trim() || undefined,
          notes: driverNotes.trim() || undefined,
        };
      }
      if (assignment.role === "vehicle") {
        return {
          ...assignment,
          status: vehicleStatus,
          reference: vehicleRef.trim() || undefined,
          notes: vehicleNotes.trim() || undefined,
        };
      }
      return assignment;
    });

    // Build updated hotels (preserve first hotel confirmation number update)
    const updatedHotels = tour.hotels.map((hotel, idx) => {
      if (idx === 0 && hotelConfirmation.trim()) {
        return {
          ...hotel,
          confirmationNumber: hotelConfirmation.trim(),
        };
      }
      return hotel;
    });

    // Explicit tour status is preserved; resolving issues does not auto-mutate tour status
    const updatedTour: Tour = {
      ...tour,
      status,
      assignments: updatedAssignments,
      hotels: updatedHotels,
      issues,
      operationalNotes: operationalNotes.trim() || undefined,
      lastUpdated: new Date().toISOString(),
    };

    onSave(updatedTour);
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-tour-title"
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <div>
            <h2 id="edit-tour-title" className="text-lg font-bold text-slate-900">
              Update Operations — {tour.bookingReference}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {tour.group.groupName} · {tour.destination}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Cancel and close dialog"
          >
            <X size={20} />
          </button>
        </div>

        {/* Prototype Scope Banner */}
        <div className="bg-amber-50 border-b border-amber-200/70 px-6 py-2.5 flex items-start gap-2.5 text-xs text-amber-900 shrink-0">
          <Info size={16} className="text-amber-700 shrink-0 mt-0.5" />
          <div className="leading-snug">
            <span className="font-semibold">Prototype Demonstration Session:</span> Edits are browser-local (saved to session storage), not shared between operational staff, and do not represent authoritative database persistence.
          </div>
        </div>

        {/* Source Provenance (Read-Only) */}
        {tour.sourceProvenance && (
          <div className="bg-slate-100/70 border-b border-slate-200 px-6 py-2 flex items-center justify-between text-[11px] text-slate-600 shrink-0">
            <span>
              <strong>Excel Provenance:</strong> {tour.sourceProvenance}
            </span>
            <span className="text-slate-400">Preserved original source</span>
          </div>
        )}

        {/* Scrollable Form Body */}
        <form id="edit-tour-form" onSubmit={handleSave} className="overflow-y-auto p-6 space-y-6">
          {/* Section 1: Tour Status (Explicit Choice) */}
          <div className="space-y-1.5">
            <label htmlFor="tour-status" className="block text-xs font-bold uppercase tracking-wider text-slate-700">
              Tour Status (Explicit Operational Sign-Off)
            </label>
            <p className="text-[11px] text-slate-500">
              Note: Resolving blockers will not automatically change this status. Tour status must be explicitly confirmed by operators.
            </p>
            <select
              id="tour-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as TourStatus)}
              className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              {TOUR_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Section 2: Guide Assignment */}
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Guide Allocation
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="guide-status" className="block text-xs font-medium text-slate-600 mb-1">
                  Guide Status
                </label>
                <select
                  id="guide-status"
                  value={guideStatus}
                  onChange={(e) => setGuideStatus(e.target.value as AssignmentStatus)}
                  className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  {ASSIGNMENT_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="guide-name" className="block text-xs font-medium text-slate-600 mb-1">
                  Guide Name {guideStatus === "assigned" && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="text"
                  id="guide-name"
                  placeholder="e.g. Ramesh Kumar (G-RAMESH)"
                  value={guideName}
                  onChange={(e) => {
                    setGuideName(e.target.value);
                    if (errors.guideName) setErrors((prev) => ({ ...prev, guideName: "" }));
                  }}
                  className={`w-full text-sm bg-white border rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    errors.guideName ? "border-red-400 bg-red-50/30" : "border-slate-200"
                  }`}
                  aria-invalid={errors.guideName ? "true" : undefined}
                  aria-describedby={errors.guideName ? "guide-name-error" : undefined}
                />
                {errors.guideName && (
                  <p id="guide-name-error" className="text-xs text-red-600 mt-1 flex items-center gap-1">
                    <AlertCircle size={13} /> {errors.guideName}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="guide-ref" className="block text-xs font-medium text-slate-600 mb-1">
                Guide Badge / Reference Code <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                id="guide-ref"
                placeholder="e.g. GD-RJ-019"
                value={guideRef}
                onChange={(e) => setGuideRef(e.target.value)}
                className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              />
            </div>
          </div>

          {/* Section 3: Transport & Vehicle Allocation (Optional fields) */}
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Transport & Vehicle Allocation
              </h3>
              <span className="text-[11px] text-slate-400">Driver & plate optional</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="vehicle-status" className="block text-xs font-medium text-slate-600 mb-1">
                  Vehicle Status
                </label>
                <select
                  id="vehicle-status"
                  value={vehicleStatus}
                  onChange={(e) => setVehicleStatus(e.target.value as AssignmentStatus)}
                  className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  {ASSIGNMENT_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="vehicle-ref" className="block text-xs font-medium text-slate-600 mb-1">
                  Commercial Plate / Registration <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  id="vehicle-ref"
                  placeholder="e.g. RJ-14-AB-1234"
                  value={vehicleRef}
                  onChange={(e) => setVehicleRef(e.target.value)}
                  className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
              </div>

              <div>
                <label htmlFor="driver-name" className="block text-xs font-medium text-slate-600 mb-1">
                  Driver Name <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  id="driver-name"
                  placeholder="e.g. Suresh Meena"
                  value={driverName}
                  onChange={(e) => {
                    setDriverName(e.target.value);
                    if (e.target.value.trim() && driverStatus === "unassigned") {
                      setDriverStatus("assigned");
                    }
                  }}
                  className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
              </div>

              <div>
                <label htmlFor="driver-notes" className="block text-xs font-medium text-slate-600 mb-1">
                  Driver Phone / Notes <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  id="driver-notes"
                  placeholder="e.g. +91 98290 12345 (Optional / unverified)"
                  value={driverNotes}
                  onChange={(e) => setDriverNotes(e.target.value)}
                  className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
              </div>

              <div>
                <label htmlFor="vehicle-notes" className="block text-xs font-medium text-slate-600 mb-1">
                  Vehicle Model / Capacity <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  id="vehicle-notes"
                  placeholder="e.g. Toyota Innova / Tempo 14-seater"
                  value={vehicleNotes}
                  onChange={(e) => setVehicleNotes(e.target.value)}
                  className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Hotel Confirmation (Optional field) */}
          <div className="space-y-2 pt-3 border-t border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Hotel Booking Reference
            </h3>
            <div>
              <label htmlFor="hotel-confirmation" className="block text-xs font-medium text-slate-600 mb-1">
                Primary Hotel Confirmation Voucher <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                id="hotel-confirmation"
                placeholder="e.g. HPJ-88123 / Pending property voucher"
                value={hotelConfirmation}
                onChange={(e) => setHotelConfirmation(e.target.value)}
                className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              />
            </div>
          </div>

          {/* Section 5: Discrete Operational Issues (Independent Resolution) */}
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Operational Issues & Blockers
              </h3>
              <span className="text-[11px] text-slate-400">Independent resolution</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Each issue is resolved independently. Resolving one blocker leaves remaining issues untouched.
            </p>

            {issues.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-2">
                No active operational issues logged on this record.
              </p>
            ) : (
              <div className="space-y-3">
                {issues.map((issue) => (
                  <div
                    key={issue.id}
                    className={`p-3.5 rounded-lg border text-xs transition-colors ${
                      issue.resolved
                        ? "bg-slate-50 border-slate-200 text-slate-600"
                        : "bg-amber-50/70 border-amber-200 text-amber-950"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2 min-w-0">
                        {issue.resolved ? (
                          <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <p className="font-semibold capitalize text-slate-800">
                            [{issue.category}]: {issue.description}
                          </p>
                          {issue.resolved && issue.resolvedAt && (
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              Prototype audit: Marked resolved at {new Date(issue.resolvedAt).toLocaleTimeString()}
                            </p>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleToggleIssue(issue.id)}
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors shrink-0 ${
                          issue.resolved
                            ? "bg-slate-200 text-slate-700 hover:bg-slate-300"
                            : "bg-emerald-600 text-white hover:bg-emerald-700"
                        }`}
                      >
                        {issue.resolved ? "Reopen Issue" : "Mark Resolved"}
                      </button>
                    </div>

                    {issue.resolved && (
                      <div className="mt-2.5 pt-2 border-t border-slate-200/70">
                        <label
                          htmlFor={`res-notes-${issue.id}`}
                          className="block text-[11px] font-medium text-slate-600 mb-1"
                        >
                          Resolution Action Taken <span className="text-slate-400 font-normal">(Optional audit note)</span>
                        </label>
                        <input
                          type="text"
                          id={`res-notes-${issue.id}`}
                          placeholder="e.g. Replacement Innova dispatched from Delhi hub"
                          value={issue.resolutionNotes ?? ""}
                          onChange={(e) => handleIssueNotesChange(issue.id, e.target.value)}
                          className="w-full text-xs bg-white border border-slate-200 rounded px-2.5 py-1.5 text-slate-800"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 6: Operational Notes */}
          <div className="space-y-1.5 pt-3 border-t border-slate-100">
            <label htmlFor="operational-notes" className="block text-xs font-bold uppercase tracking-wider text-slate-700">
              Internal Operations Notes
            </label>
            <textarea
              id="operational-notes"
              rows={3}
              value={operationalNotes}
              onChange={(e) => setOperationalNotes(e.target.value)}
              placeholder="Add ground coordination notes, daily schedule alerts, or transit notes..."
              className="w-full text-xs bg-white border border-slate-200 rounded-lg p-3 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            />
          </div>
        </form>

        {/* Footer with Save / Cancel Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50/70 shrink-0">
          <p className="text-xs text-slate-400">
            Cancel discards all modifications safely.
          </p>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="edit-tour-form"
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
