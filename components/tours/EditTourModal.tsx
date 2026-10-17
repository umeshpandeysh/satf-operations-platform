"use client";

import { useState, useEffect, useRef } from "react";
import {
  X,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Info,
  Save,
  UserCheck,
  Car,
  Building,
  ClipboardList,
} from "lucide-react";
import type {
  Tour,
  TourStatus,
  AssignmentStatus,
  OperationalIssue,
  VehicleType,
} from "@/lib/types";
import { validateTourForm, applyIssueUpdate } from "@/lib/operations";
import type { StorageOperationResult } from "@/lib/session-store";

interface EditTourModalProps {
  tour: Tour;
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    updatedTour: Tour
  ) => StorageOperationResult | Promise<StorageOperationResult>;
}

const TOUR_STATUS_OPTIONS: Array<{ value: TourStatus; label: string }> = [
  { value: "upcoming", label: "Upcoming" },
  { value: "active", label: "Active" },
  { value: "attention", label: "Needs Attention" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const ASSIGNMENT_STATUS_OPTIONS: Array<{
  value: AssignmentStatus;
  label: string;
}> = [
  { value: "assigned", label: "Assigned" },
  { value: "pending", label: "Pending" },
  { value: "unassigned", label: "Unassigned" },
];

const VEHICLE_TYPE_OPTIONS: Array<{ value: VehicleType; label: string }> = [
  { value: "Urbania", label: "Urbania" },
  { value: "Innova", label: "Innova" },
  { value: "Tempo Traveller", label: "Tempo Traveller" },
  { value: "Sedan", label: "Sedan" },
  { value: "Gatiman/train", label: "Gatiman/train" },
  { value: "Other", label: "Other" },
];

export function EditTourModal({
  tour,
  isOpen,
  onClose,
  onSave,
}: EditTourModalProps) {
  // ─── Form State prefilled from tour ──────────────────────────────────────────
  const [status, setStatus] = useState<TourStatus>(tour.status);
  const [operationalNotes, setOperationalNotes] = useState(
    tour.operationalNotes ?? ""
  );

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
  const [vehicleRef, setVehicleRef] = useState(
    vehicleAssignment?.reference ?? ""
  );
  const [vehicleType, setVehicleType] = useState<VehicleType | "">(
    vehicleAssignment?.vehicleType ?? ""
  );
  const [vehicleNotes, setVehicleNotes] = useState(
    vehicleAssignment?.notes ?? ""
  );

  // Hotel confirmation (Optional field)
  const [hotelConfirmation, setHotelConfirmation] = useState(
    tour.hotels[0]?.confirmationNumber ?? ""
  );

  // Discrete Independent Issues
  const [issues, setIssues] = useState<OperationalIssue[]>(
    tour.issues?.map((iss) => ({ ...iss })) ?? []
  );

  // Inline Validation & Storage Errors
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [storageError, setStorageError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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
    const targetIssue = issues.find((i) => i.id === issueId);
    if (!targetIssue) return;

    if (!targetIssue.resolved) {
      // Explanatory resolution notes are mandatory before marking resolved!
      if (!targetIssue.resolutionNotes || !targetIssue.resolutionNotes.trim()) {
        setErrors((prev) => ({
          ...prev,
          [`issue_${issueId}_notes`]:
            "Explanatory resolution note is required before marking this issue resolved.",
        }));
        return;
      }

      setErrors((prev) => {
        const next = { ...prev };
        delete next[`issue_${issueId}_notes`];
        return next;
      });

      setIssues((prev) =>
        applyIssueUpdate(prev, issueId, {
          resolved: true,
          resolutionNotes: (targetIssue.resolutionNotes ?? "").trim(),
        })
      );
    } else {
      // Reopening issue
      setErrors((prev) => {
        const next = { ...prev };
        delete next[`issue_${issueId}_notes`];
        return next;
      });
      setIssues((prev) =>
        applyIssueUpdate(prev, issueId, {
          resolved: false,
        })
      );
    }
  }

  function handleIssueNotesChange(issueId: string, notes: string) {
    if (errors[`issue_${issueId}_notes`] && notes.trim()) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[`issue_${issueId}_notes`];
        return next;
      });
    }
    setIssues((prev) =>
      prev.map((iss) =>
        iss.id === issueId ? { ...iss, resolutionNotes: notes } : iss
      )
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setStorageError(null);

    // Inline validation using shared production rules
    const validation = validateTourForm({
      guideStatus,
      guideName,
      driverName,
      driverNotes,
      vehicleStatus,
      vehicleRef,
      vehicleType,
      hotelConfirmation,
      issues,
    });

    if (!validation.isValid) {
      setErrors(validation.errors);
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
          vehicleType: (vehicleType as VehicleType) || undefined,
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

    setIsSaving(true);
    try {
      const result = await onSave(updatedTour);
      if (!result.success) {
        setStorageError(
          result.error ||
            "Failed to save changes to session storage. Your draft has been kept in this dialog."
        );
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Unexpected storage failure";
      setStorageError(
        `Failed to save changes to session storage: ${msg}. Your draft has been kept in this dialog.`
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-tour-title"
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-2xl bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center shrink-0">
              <ClipboardList size={14} />
            </div>
            <div>
              <h2
                id="edit-tour-title"
                className="text-sm font-bold text-slate-900 tracking-tight"
              >
                Update Operations — {tour.bookingReference}
              </h2>
              <p className="text-[11px] text-slate-500">
                {tour.group.groupName} · {tour.destination}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Cancel and close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Prototype Scope Banner */}
        <div className="bg-amber-50/90 border-b border-amber-200/80 px-5 py-2 flex items-center gap-2 text-xs text-amber-900 shrink-0">
          <Info size={14} className="text-amber-700 shrink-0" />
          <span className="text-[11px] leading-tight">
            <strong>Prototype Session:</strong> Changes update your current browser session only.
          </span>
        </div>

        {/* Scrollable Form Body */}
        <form
          id="edit-tour-form"
          onSubmit={handleSave}
          className="overflow-y-auto p-5 space-y-5 text-xs"
        >
          {/* Storage Error Alert */}
          {storageError && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-800 flex items-start gap-2.5 shadow-xs"
            >
              <AlertCircle size={15} className="text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-red-900">Changes Not Persisted</p>
                <p className="mt-0.5 text-red-700">{storageError}</p>
              </div>
            </div>
          )}

          {/* Section 1: Tour Status */}
          <div className="p-3.5 rounded-md bg-slate-50/70 border border-slate-200 space-y-2">
            <label
              htmlFor="tour-status"
              className="block text-[11px] font-bold uppercase tracking-wider text-slate-700"
            >
              Overall Tour Status (Explicit Operational Sign-Off)
            </label>
            <p className="text-[11px] text-slate-500">
              Note: Resolving blockers does not automatically clear this status. Explicit confirmation required.
            </p>
            <select
              id="tour-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as TourStatus)}
              className="w-full text-xs bg-white border border-slate-300 rounded-md px-3 py-1.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              {TOUR_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Section 2: Guide Allocation */}
          <div className="p-3.5 rounded-md bg-slate-50/70 border border-slate-200 space-y-3">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-700">
              <UserCheck size={14} className="text-blue-600" />
              <span>Guide Allocation</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label
                  htmlFor="guide-status"
                  className="block text-[11px] font-medium text-slate-600 mb-1"
                >
                  Guide Status
                </label>
                <select
                  id="guide-status"
                  value={guideStatus}
                  onChange={(e) =>
                    setGuideStatus(e.target.value as AssignmentStatus)
                  }
                  className="w-full text-xs bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  {ASSIGNMENT_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="guide-name"
                  className="block text-[11px] font-medium text-slate-600 mb-1"
                >
                  Guide Name{" "}
                  {guideStatus === "assigned" && (
                    <span className="text-red-500">*</span>
                  )}
                </label>
                <input
                  type="text"
                  id="guide-name"
                  placeholder="e.g. Ramesh Kumar"
                  value={guideName}
                  onChange={(e) => {
                    setGuideName(e.target.value);
                    if (errors.guideName)
                      setErrors((prev) => ({ ...prev, guideName: "" }));
                  }}
                  className={`w-full text-xs bg-white border rounded-md px-3 py-1.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    errors.guideName
                      ? "border-red-400 bg-red-50/30"
                      : "border-slate-300"
                  }`}
                  aria-invalid={errors.guideName ? "true" : undefined}
                />
                {errors.guideName && (
                  <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
                    <AlertCircle size={12} /> {errors.guideName}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label
                htmlFor="guide-ref"
                className="block text-[11px] font-medium text-slate-600 mb-1"
              >
                Guide Badge / License Ref{" "}
                <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                id="guide-ref"
                placeholder="e.g. GD-RJ-019"
                value={guideRef}
                onChange={(e) => setGuideRef(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-md px-3 py-1.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              />
            </div>
          </div>

          {/* Section 3: Transport & Vehicle Allocation */}
          <div className="p-3.5 rounded-md bg-slate-50/70 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-700">
                <Car size={14} className="text-blue-600" />
                <span>Transport & Vehicle Fleet</span>
              </div>
              <span className="text-[10px] text-slate-400">
                Driver & plate optional
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="vehicle-status"
                  className="block text-[11px] font-medium text-slate-600 mb-1"
                >
                  Vehicle Status
                </label>
                <select
                  id="vehicle-status"
                  value={vehicleStatus}
                  onChange={(e) =>
                    setVehicleStatus(e.target.value as AssignmentStatus)
                  }
                  className="w-full text-xs bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  {ASSIGNMENT_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="vehicle-type"
                  className="block text-[11px] font-medium text-slate-600 mb-1"
                >
                  Vehicle Type / Category{" "}
                  <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <select
                  id="vehicle-type"
                  value={vehicleType}
                  onChange={(e) => {
                    setVehicleType(e.target.value as VehicleType | "");
                    if (errors.vehicleType) {
                      setErrors((prev) => {
                        const next = { ...prev };
                        delete next.vehicleType;
                        return next;
                      });
                    }
                  }}
                  className={`w-full text-xs bg-white border rounded-md px-2.5 py-1.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    errors.vehicleType
                      ? "border-red-400 bg-red-50/30"
                      : "border-slate-300"
                  }`}
                >
                  <option value="">Select vehicle category…</option>
                  {VEHICLE_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {errors.vehicleType && (
                  <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
                    <AlertCircle size={12} /> {errors.vehicleType}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="vehicle-ref"
                  className="block text-[11px] font-medium text-slate-600 mb-1"
                >
                  Plate / Registration{" "}
                  <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  id="vehicle-ref"
                  placeholder="e.g. RJ-14-AB-1234"
                  value={vehicleRef}
                  onChange={(e) => setVehicleRef(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-md px-3 py-1.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
              </div>

              <div>
                <label
                  htmlFor="driver-name"
                  className="block text-[11px] font-medium text-slate-600 mb-1"
                >
                  Driver Name{" "}
                  <span className="text-slate-400 font-normal">(Optional)</span>
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
                  className="w-full text-xs bg-white border border-slate-300 rounded-md px-3 py-1.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
              </div>

              <div>
                <label
                  htmlFor="driver-notes"
                  className="block text-[11px] font-medium text-slate-600 mb-1"
                >
                  Driver Contact / Dispatch Notes{" "}
                  <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  id="driver-notes"
                  placeholder="e.g. +91 98290 12345 (Optional / unverified)"
                  value={driverNotes}
                  onChange={(e) => setDriverNotes(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-md px-3 py-1.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
              </div>

              <div>
                <label
                  htmlFor="vehicle-notes"
                  className="block text-[11px] font-medium text-slate-600 mb-1"
                >
                  Vehicle Model / Capacity Notes{" "}
                  <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  id="vehicle-notes"
                  placeholder="e.g. 10-seater / AC / luggage carrier"
                  value={vehicleNotes}
                  onChange={(e) => setVehicleNotes(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-md px-3 py-1.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Hotel Confirmation */}
          <div className="p-3.5 rounded-md bg-slate-50/70 border border-slate-200 space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-700">
              <Building size={14} className="text-blue-600" />
              <span>Hotel Booking Voucher</span>
            </div>
            <div>
              <label
                htmlFor="hotel-confirmation"
                className="block text-[11px] font-medium text-slate-600 mb-1"
              >
                Property Voucher / Confirmation Reference{" "}
                <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                id="hotel-confirmation"
                placeholder="e.g. HPJ-88123 / Pending property voucher"
                value={hotelConfirmation}
                onChange={(e) => setHotelConfirmation(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-md px-3 py-1.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 font-mono"
              />
            </div>
          </div>

          {/* Section 5: Discrete Independent Issues */}
          <div className="p-3.5 rounded-md bg-slate-50/70 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-700">
                <AlertTriangle size={14} className="text-amber-600" />
                <span>Operational Blockers & Issues</span>
              </div>
              <span className="text-[10px] text-slate-400">
                Independent resolution
              </span>
            </div>

            {issues.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-1">
                No active operational issues logged on this record.
              </p>
            ) : (
              <div className="space-y-2.5">
                {issues.map((issue) => (
                  <div
                    key={issue.id}
                    className={`p-3 rounded-md border text-xs transition-colors shadow-xs ${
                      issue.resolved
                        ? "bg-white border-slate-200 text-slate-600"
                        : "bg-amber-50/60 border-amber-200 text-amber-950"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-start gap-2 min-w-0">
                        {issue.resolved ? (
                          <CheckCircle2
                            size={15}
                            className="text-emerald-600 shrink-0 mt-0.5"
                          />
                        ) : (
                          <AlertTriangle
                            size={15}
                            className="text-amber-600 shrink-0 mt-0.5"
                          />
                        )}
                        <div>
                          <p className="font-semibold capitalize text-slate-900 text-xs">
                            [{issue.category}]: {issue.description}
                          </p>
                          {issue.resolved && issue.resolvedAt && (
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              Marked resolved at{" "}
                              {new Date(issue.resolvedAt).toLocaleTimeString()}
                            </p>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleToggleIssue(issue.id)}
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors shrink-0 shadow-xs ${
                          issue.resolved
                            ? "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300"
                            : "bg-emerald-600 text-white hover:bg-emerald-700"
                        }`}
                      >
                        {issue.resolved ? "Reopen Issue" : "Mark Resolved"}
                      </button>
                    </div>

                    <div className="mt-2 pt-2 border-t border-slate-200/70">
                      <label
                        htmlFor={`res-notes-${issue.id}`}
                        className="block text-[10px] font-medium text-slate-600 mb-1"
                      >
                        Resolution Action Taken / Notes{" "}
                        <span className="text-slate-500 font-normal">
                          {issue.resolved
                            ? "(Required audit note)"
                            : "(Required to mark resolved)"}
                        </span>
                      </label>
                      <input
                        type="text"
                        id={`res-notes-${issue.id}`}
                        placeholder="e.g. Replacement vehicle arranged via Delhi hub"
                        value={issue.resolutionNotes ?? ""}
                        onChange={(e) =>
                          handleIssueNotesChange(issue.id, e.target.value)
                        }
                        className={`w-full text-xs bg-white border rounded px-2.5 py-1 text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                          errors[`issue_${issue.id}_notes`]
                            ? "border-red-400 bg-red-50/30"
                            : "border-slate-300"
                        }`}
                        aria-invalid={
                          errors[`issue_${issue.id}_notes`] ? "true" : undefined
                        }
                      />
                      {errors[`issue_${issue.id}_notes`] && (
                        <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
                          <AlertCircle size={12} />{" "}
                          {errors[`issue_${issue.id}_notes`]}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 6: Internal Notes */}
          <div className="p-3.5 rounded-md bg-slate-50/70 border border-slate-200 space-y-1.5">
            <label
              htmlFor="operational-notes"
              className="block text-[11px] font-bold uppercase tracking-wider text-slate-700"
            >
              Internal Dispatch Remarks
            </label>
            <textarea
              id="operational-notes"
              rows={3}
              value={operationalNotes}
              onChange={(e) => setOperationalNotes(e.target.value)}
              placeholder="Add internal handover remarks, flight tracker updates, or specific guest instructions…"
              className="w-full text-xs bg-white border border-slate-300 rounded-md p-2.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 placeholder:text-slate-400"
            />
          </div>

          {/* Form Actions (Sticky footer inside dialog) */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 shadow-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
            >
              <Save size={13} />
              {isSaving ? "Saving…" : "Save Operations Record"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
