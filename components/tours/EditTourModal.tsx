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
import { useLanguage } from "@/lib/i18n";

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
  const { t, language } = useLanguage();
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

    // Build updated assignments preserving existing items and appending any newly allocated roles
    const updatedAssignments = [...tour.assignments];
    const rolesHandled = new Set<string>();

    for (let i = 0; i < updatedAssignments.length; i++) {
      const assignment = updatedAssignments[i];
      if (assignment.role === "guide") {
        rolesHandled.add("guide");
        updatedAssignments[i] = {
          ...assignment,
          status: guideStatus,
          name: guideName.trim() || undefined,
          reference: guideRef.trim() || undefined,
        };
      } else if (assignment.role === "driver") {
        rolesHandled.add("driver");
        updatedAssignments[i] = {
          ...assignment,
          status: driverStatus,
          name: driverName.trim() || undefined,
          notes: driverNotes.trim() || undefined,
        };
      } else if (assignment.role === "vehicle") {
        rolesHandled.add("vehicle");
        updatedAssignments[i] = {
          ...assignment,
          status: vehicleStatus,
          reference: vehicleRef.trim() || undefined,
          vehicleType: (vehicleType as VehicleType) || undefined,
          notes: vehicleNotes.trim() || undefined,
        };
      }
    }

    // If driver was not in original assignments but is now configured by coordinator
    if (!rolesHandled.has("driver") && (driverStatus !== "unassigned" || driverName.trim() || driverNotes.trim())) {
      updatedAssignments.push({
        id: `asg-${tour.id}-driver`,
        role: "driver",
        status: driverStatus,
        name: driverName.trim() || undefined,
        notes: driverNotes.trim() || undefined,
      });
    }

    // If vehicle was not in original assignments but is now configured by coordinator
    if (!rolesHandled.has("vehicle") && (vehicleStatus !== "unassigned" || vehicleRef.trim() || vehicleType || vehicleNotes.trim())) {
      updatedAssignments.push({
        id: `asg-${tour.id}-vehicle`,
        role: "vehicle",
        status: vehicleStatus,
        reference: vehicleRef.trim() || undefined,
        vehicleType: (vehicleType as VehicleType) || undefined,
        notes: vehicleNotes.trim() || undefined,
      });
    }

    // If guide was not in original assignments but is now configured by coordinator
    if (!rolesHandled.has("guide") && (guideStatus !== "unassigned" || guideName.trim() || guideRef.trim())) {
      updatedAssignments.push({
        id: `asg-${tour.id}-guide`,
        role: "guide",
        status: guideStatus,
        name: guideName.trim() || undefined,
        reference: guideRef.trim() || undefined,
      });
    }

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
            "Failed to save changes to persistent storage. Your draft has been kept in this dialog."
        );
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Unexpected persistence failure";
      setStorageError(
        `Failed to save changes to persistent storage: ${msg}. Your draft has been kept in this dialog.`
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
        className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#dcecf7]/60 text-[#244d70] border border-[#244d70]/20 flex items-center justify-center shrink-0">
              <ClipboardList size={16} />
            </div>
            <div>
              <h2
                id="edit-tour-title"
                className="text-sm font-bold text-slate-900 tracking-tight"
              >
                {language === "ja" ? `ツアー手配情報更新 — ${tour.bookingReference}` : `Update Operations — ${tour.bookingReference}`}
              </h2>
              <p className="text-[11px] text-slate-500">
                {tour.group.groupName} · {tour.destination}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#244d70]"
            aria-label={t("create.cancel")}
          >
            <X size={18} />
          </button>
        </div>

        {/* Prototype Scope Banner */}
        <div className="bg-amber-50/90 border-b border-amber-200/80 px-5 py-2 flex items-center gap-2 text-xs text-amber-900 shrink-0">
          <Info size={14} className="text-amber-700 shrink-0" />
          <span className="text-[11px] leading-tight">
            {t("edit.session_notice")}
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
              className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2.5 shadow-2xs"
            >
              <AlertCircle size={15} className="text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-red-900">
                  {language === "ja" ? "変更は保存されませんでした" : "Changes Not Persisted"}
                </p>
                <p className="mt-0.5 text-red-700">{storageError}</p>
              </div>
            </div>
          )}

          {/* Section 1: Tour Status */}
          <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200 space-y-2">
            <label
              htmlFor="tour-status"
              className="block text-[11px] font-bold uppercase tracking-wider text-slate-700"
            >
              {language === "ja" ? "ツアー全体ステータス（運行管理承認）" : "Overall Tour Status (Explicit Operational Sign-Off)"}
            </label>
            <p className="text-[11px] text-slate-500">
              {language === "ja"
                ? "注: 課題の解決によって自動変更はされません。明示的な確認が必要です。"
                : "Note: Resolving blockers does not automatically clear this status. Explicit confirmation required."}
            </p>
            <select
              id="tour-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as TourStatus)}
              className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#244d70]/25 focus-visible:border-[#244d70]"
            >
              {TOUR_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Section 2: Guide Allocation */}
          <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200 space-y-3">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-700">
              <UserCheck size={14} className="text-[#244d70]" />
              <span>{t("edit.guide_section")}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label
                  htmlFor="guide-status"
                  className="block text-[11px] font-semibold text-slate-600 mb-1"
                >
                  {t("edit.guide_status")}
                </label>
                <select
                  id="guide-status"
                  value={guideStatus}
                  onChange={(e) =>
                    setGuideStatus(e.target.value as AssignmentStatus)
                  }
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#244d70]/25 focus-visible:border-[#244d70]"
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
                  className="block text-[11px] font-semibold text-slate-600 mb-1"
                >
                  {t("edit.guide_name")}{" "}
                  {guideStatus === "assigned" && (
                    <span className="text-red-500">*</span>
                  )}
                </label>
                <input
                  type="text"
                  id="guide-name"
                  placeholder={language === "ja" ? "例: Ramesh Kumar（公認ガイド）" : "e.g. Ramesh Kumar"}
                  value={guideName}
                  onChange={(e) => {
                    setGuideName(e.target.value);
                    if (errors.guideName)
                      setErrors((prev) => ({ ...prev, guideName: "" }));
                  }}
                  className={`w-full text-xs bg-white border rounded-lg px-3 py-1.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#244d70]/25 focus-visible:border-[#244d70] ${
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
                className="block text-[11px] font-semibold text-slate-600 mb-1"
              >
                {t("edit.guide_id")}{" "}
                <span className="text-slate-400 font-normal">
                  {language === "ja" ? "（任意）" : "(Optional)"}
                </span>
              </label>
              <input
                type="text"
                id="guide-ref"
                placeholder={language === "ja" ? "例: GD-RJ-019（観光省公認番号）" : "e.g. GD-RJ-019"}
                value={guideRef}
                onChange={(e) => setGuideRef(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#244d70]/25 focus-visible:border-[#244d70]"
              />
            </div>
          </div>

          {/* Section 3: Transport & Vehicle Allocation */}
          <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-700">
                <Car size={14} className="text-[#244d70]" />
                <span>{t("edit.vehicle_section")}</span>
              </div>
              <span className="text-[10px] text-slate-400">
                {language === "ja" ? "ドライバー・車両番号は任意" : "Driver & plate optional"}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="vehicle-status"
                  className="block text-[11px] font-semibold text-slate-600 mb-1"
                >
                  {language === "ja" ? "車両手配ステータス" : "Vehicle Status"}
                </label>
                <select
                  id="vehicle-status"
                  value={vehicleStatus}
                  onChange={(e) =>
                    setVehicleStatus(e.target.value as AssignmentStatus)
                  }
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#244d70]/25 focus-visible:border-[#244d70]"
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
                  className="block text-[11px] font-semibold text-slate-600 mb-1"
                >
                  {t("edit.vehicle_type")}{" "}
                  <span className="text-slate-400 font-normal">
                    {language === "ja" ? "（任意）" : "(Optional)"}
                  </span>
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
                  className={`w-full text-xs bg-white border rounded-lg px-2.5 py-1.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#244d70]/25 focus-visible:border-[#244d70] ${
                    errors.vehicleType
                      ? "border-red-400 bg-red-50/30"
                      : "border-slate-300"
                  }`}
                >
                  <option value="">{language === "ja" ? "車種カテゴリーを選択…" : "Select vehicle category…"}</option>
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
                  className="block text-[11px] font-semibold text-slate-600 mb-1"
                >
                  {t("edit.vehicle_plate")}{" "}
                  <span className="text-slate-400 font-normal">
                    {language === "ja" ? "（任意）" : "(Optional)"}
                  </span>
                </label>
                <input
                  type="text"
                  id="vehicle-ref"
                  placeholder="e.g. RJ-14-AB-1234"
                  value={vehicleRef}
                  onChange={(e) => setVehicleRef(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#244d70]/25 focus-visible:border-[#244d70]"
                />
              </div>

              <div>
                <label
                  htmlFor="driver-name"
                  className="block text-[11px] font-semibold text-slate-600 mb-1"
                >
                  {t("edit.driver_name")}{" "}
                  <span className="text-slate-400 font-normal">
                    {language === "ja" ? "（任意）" : "(Optional)"}
                  </span>
                </label>
                <input
                  type="text"
                  id="driver-name"
                  placeholder={language === "ja" ? "例: Suresh Meena（専属ドライバー）" : "e.g. Suresh Meena"}
                  value={driverName}
                  onChange={(e) => {
                    setDriverName(e.target.value);
                    if (e.target.value.trim() && driverStatus === "unassigned") {
                      setDriverStatus("assigned");
                    }
                  }}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#244d70]/25 focus-visible:border-[#244d70]"
                />
              </div>

              <div>
                <label
                  htmlFor="driver-notes"
                  className="block text-[11px] font-semibold text-slate-600 mb-1"
                >
                  {t("edit.driver_contact")}{" "}
                  <span className="text-slate-400 font-normal">
                    {language === "ja" ? "（任意）" : "(Optional)"}
                  </span>
                </label>
                <input
                  type="text"
                  id="driver-notes"
                  placeholder="e.g. +91 98290 12345"
                  value={driverNotes}
                  onChange={(e) => setDriverNotes(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#244d70]/25 focus-visible:border-[#244d70]"
                />
              </div>

              <div>
                <label
                  htmlFor="vehicle-notes"
                  className="block text-[11px] font-semibold text-slate-600 mb-1"
                >
                  {language === "ja" ? "車種・定員仕様メモ" : "Vehicle Model / Capacity Notes"}{" "}
                  <span className="text-slate-400 font-normal">
                    {language === "ja" ? "（任意）" : "(Optional)"}
                  </span>
                </label>
                <input
                  type="text"
                  id="vehicle-notes"
                  placeholder={language === "ja" ? "例: 10人乗り中型バス / 冷房完備 / 荷物キャリア付" : "e.g. 10-seater / AC / luggage carrier"}
                  value={vehicleNotes}
                  onChange={(e) => setVehicleNotes(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#244d70]/25 focus-visible:border-[#244d70]"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Hotel Confirmation */}
          <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200 space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-700">
              <Building size={14} className="text-[#244d70]" />
              <span>{t("edit.hotel_section")}</span>
            </div>
            <div>
              <label
                htmlFor="hotel-confirmation"
                className="block text-[11px] font-semibold text-slate-600 mb-1"
              >
                {t("edit.hotel_voucher")}{" "}
                <span className="text-slate-400 font-normal">
                  {language === "ja" ? "（任意）" : "(Optional)"}
                </span>
              </label>
              <input
                type="text"
                id="hotel-confirmation"
                placeholder={language === "ja" ? "例: HPJ-88123 / バウチャー発行手配中" : "e.g. HPJ-88123 / Pending property voucher"}
                value={hotelConfirmation}
                onChange={(e) => setHotelConfirmation(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#244d70]/25 focus-visible:border-[#244d70] font-mono"
              />
            </div>
          </div>

          {/* Section 5: Discrete Independent Issues */}
          <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-700">
                <AlertTriangle size={14} className="text-amber-600" />
                <span>{t("edit.issues_section")}</span>
              </div>
              <span className="text-[10px] text-slate-400">
                {language === "ja" ? "個別対応管理" : "Independent resolution"}
              </span>
            </div>

            {issues.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-1">
                {language === "ja" ? "本ツアーに登録されている未解決課題はありません。" : "No active operational issues logged on this record."}
              </p>
            ) : (
              <div className="space-y-2.5">
                {issues.map((issue) => (
                  <div
                    key={issue.id}
                    className={`p-3 rounded-xl border text-xs transition-colors shadow-2xs ${
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
                              {language === "ja" ? "解決済マーク日時: " : "Marked resolved at "}
                              {new Date(issue.resolvedAt).toLocaleTimeString(language === "ja" ? "ja-JP" : "en-US")}
                            </p>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleToggleIssue(issue.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors shrink-0 shadow-2xs btn-press ${
                          issue.resolved
                            ? "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300"
                            : "bg-emerald-600 text-white hover:bg-emerald-700"
                        }`}
                      >
                        {issue.resolved
                          ? (language === "ja" ? "課題を再開" : "Reopen Issue")
                          : (language === "ja" ? "解決済にする" : "Mark Resolved")}
                      </button>
                    </div>

                    <div className="mt-2 pt-2 border-t border-slate-200/70">
                      <label
                        htmlFor={`res-notes-${issue.id}`}
                        className="block text-[10px] font-medium text-slate-600 mb-1"
                      >
                        {language === "ja" ? "対応措置・解決記録" : "Resolution Action Taken / Notes"}{" "}
                        <span className="text-slate-500 font-normal">
                          {issue.resolved
                            ? (language === "ja" ? "（監査記録）" : "(Required audit note)")
                            : (language === "ja" ? "（解決時に必須）" : "(Required to mark resolved)")}
                        </span>
                      </label>
                      <input
                        type="text"
                        id={`res-notes-${issue.id}`}
                        placeholder={language === "ja" ? "例: デリー管制デスクより代替専用車を手配完了" : "e.g. Replacement vehicle arranged via Delhi hub"}
                        value={issue.resolutionNotes ?? ""}
                        onChange={(e) =>
                          handleIssueNotesChange(issue.id, e.target.value)
                        }
                        className={`w-full text-xs bg-white border rounded-lg px-2.5 py-1 text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#244d70]/25 focus-visible:border-[#244d70] ${
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
          <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200 space-y-1.5">
            <label
              htmlFor="operational-notes"
              className="block text-[11px] font-bold uppercase tracking-wider text-slate-700"
            >
              {t("edit.notes_section")}
            </label>
            <textarea
              id="operational-notes"
              rows={3}
              value={operationalNotes}
              onChange={(e) => setOperationalNotes(e.target.value)}
              placeholder={language === "ja" ? "運行管理デスク申し送り事項、フライト追跡更新、お客様への特記事項などを記入…" : "Add internal handover remarks, flight tracker updates, or specific guest instructions…"}
              className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#244d70]/25 focus-visible:border-[#244d70] placeholder:text-slate-400"
            />
          </div>

          {/* Form Actions (Sticky footer inside dialog) */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#244d70] disabled:opacity-50 shadow-2xs btn-press"
            >
              {t("create.cancel")}
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#244d70] hover:bg-[#1b3b57] rounded-lg transition-colors shadow-2xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[#244d70] disabled:opacity-50 btn-press"
            >
              <Save size={14} />
              {isSaving
                ? t("edit.saving")
                : t("edit.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

