"use client";

import { useState, useEffect, useRef } from "react";
import {
  X,
  PlusCircle,
  AlertCircle,
  Calendar,
  UserCheck,
  FileText,
} from "lucide-react";
import type { Tour, VehicleType } from "@/lib/types";
import { APPROVED_VEHICLE_TYPES } from "@/lib/types";
import {
  validateNewTourForm,
  createNewTour,
  type NewTourInput,
} from "@/lib/operations";
import { saveSessionTour, type StorageOperationResult } from "@/lib/session-store";
import { addDaysToISO, getIndiaTodayISO } from "@/lib/utils";

interface CreateTourModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTourCreated: (newTour: Tour) => void;
  existingReferences: string[];
}

export function CreateTourModal({
  isOpen,
  onClose,
  onTourCreated,
  existingReferences,
}: CreateTourModalProps) {
  const today = getIndiaTodayISO();
  const nextWeek = addDaysToISO(today, 7);

  // Form State
  const [bookingReference, setBookingReference] = useState("");
  const [groupName, setGroupName] = useState("");
  const [adultCount, setAdultCount] = useState<number>(4);
  const [childCount, setChildCount] = useState<number>(0);
  const [nationality, setNationality] = useState("Japanese");
  const [language, setLanguage] = useState("Japanese");
  const [destination, setDestination] = useState("");
  const [arrivalDate, setArrivalDate] = useState(today);
  const [departureDate, setDepartureDate] = useState(nextWeek);
  const [contactPerson, setContactPerson] = useState("");
  const [guideName, setGuideName] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleType | "">("");
  const [driverName, setDriverName] = useState("");
  const [notes, setNotes] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [storageError, setStorageError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);

  // Escape key listener
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStorageError(null);

    const input: NewTourInput = {
      bookingReference,
      groupName,
      adultCount: Number(adultCount),
      childCount: Number(childCount),
      nationality,
      language,
      destination,
      arrivalDate,
      departureDate,
      contactPerson,
      guideName,
      vehicleType,
      driverName,
      notes,
    };

    const validation = validateNewTourForm(input, existingReferences);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    const newTour = createNewTour(input);

    setIsSubmitting(true);
    try {
      const result: StorageOperationResult = saveSessionTour(newTour);
      if (!result.success) {
        setStorageError(
          result.error ||
            "Failed to save new tour in browser storage. Your input has been kept in this dialog."
        );
        setIsSubmitting(false);
        return;
      }

      onTourCreated(newTour);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unexpected storage failure";
      setStorageError(`Failed to save tour: ${msg}`);
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-tour-title"
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-2xl bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center shrink-0">
              <PlusCircle size={15} />
            </div>
            <div>
              <h2
                id="create-tour-title"
                className="text-sm font-bold text-slate-900 tracking-tight"
              >
                Create New Tour Booking File
              </h2>
              <p className="text-[11px] text-slate-500">
                Register a new group itinerary in the operations dispatch system
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

        {/* Form Body */}
        <form
          id="create-tour-form"
          onSubmit={handleSubmit}
          className="overflow-y-auto p-5 space-y-4 text-xs"
        >
          {storageError && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-800 flex items-start gap-2.5 shadow-xs"
            >
              <AlertCircle size={15} className="text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-red-900">Creation Failed</p>
                <p className="mt-0.5 text-red-700">{storageError}</p>
              </div>
            </div>
          )}

          {/* Core Booking Reference & Group */}
          <div className="p-3.5 rounded-md bg-slate-50/70 border border-slate-200 space-y-3">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-700">
              <FileText size={14} className="text-blue-600" />
              <span>Tour Reference & Identity</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="new-booking-ref"
                  className="block text-[11px] font-medium text-slate-700 mb-1"
                >
                  Booking Reference <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="new-booking-ref"
                  placeholder="e.g. SATF-2026-007"
                  value={bookingReference}
                  onChange={(e) => {
                    setBookingReference(e.target.value);
                    if (errors.bookingReference) {
                      setErrors((prev) => {
                        const next = { ...prev };
                        delete next.bookingReference;
                        return next;
                      });
                    }
                  }}
                  className={`w-full text-xs font-mono bg-white border rounded-md px-3 py-1.5 text-slate-900 uppercase focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    errors.bookingReference
                      ? "border-red-400 bg-red-50/30"
                      : "border-slate-300"
                  }`}
                  aria-invalid={errors.bookingReference ? "true" : undefined}
                />
                {errors.bookingReference && (
                  <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
                    <AlertCircle size={12} /> {errors.bookingReference}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="new-group-name"
                  className="block text-[11px] font-medium text-slate-700 mb-1"
                >
                  Group / Party Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="new-group-name"
                  placeholder="e.g. Tanaka Family Holiday"
                  value={groupName}
                  onChange={(e) => {
                    setGroupName(e.target.value);
                    if (errors.groupName) {
                      setErrors((prev) => {
                        const next = { ...prev };
                        delete next.groupName;
                        return next;
                      });
                    }
                  }}
                  className={`w-full text-xs bg-white border rounded-md px-3 py-1.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    errors.groupName
                      ? "border-red-400 bg-red-50/30"
                      : "border-slate-300"
                  }`}
                  aria-invalid={errors.groupName ? "true" : undefined}
                />
                {errors.groupName && (
                  <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
                    <AlertCircle size={12} /> {errors.groupName}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="new-destination"
                  className="block text-[11px] font-medium text-slate-700 mb-1"
                >
                  Destination Circuit <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="new-destination"
                  placeholder="e.g. Golden Triangle & Varanasi"
                  value={destination}
                  onChange={(e) => {
                    setDestination(e.target.value);
                    if (errors.destination) {
                      setErrors((prev) => {
                        const next = { ...prev };
                        delete next.destination;
                        return next;
                      });
                    }
                  }}
                  className={`w-full text-xs bg-white border rounded-md px-3 py-1.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    errors.destination
                      ? "border-red-400 bg-red-50/30"
                      : "border-slate-300"
                  }`}
                  aria-invalid={errors.destination ? "true" : undefined}
                />
                {errors.destination && (
                  <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
                    <AlertCircle size={12} /> {errors.destination}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="new-contact-person"
                  className="block text-[11px] font-medium text-slate-700 mb-1"
                >
                  Primary Contact <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  id="new-contact-person"
                  placeholder="e.g. Kenji Tanaka"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-md px-3 py-1.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Travellers & Dates */}
          <div className="p-3.5 rounded-md bg-slate-50/70 border border-slate-200 space-y-3">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-700">
              <Calendar size={14} className="text-blue-600" />
              <span>Dates & Party Details</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label
                  htmlFor="new-arrival-date"
                  className="block text-[11px] font-medium text-slate-700 mb-1"
                >
                  Arrival Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  id="new-arrival-date"
                  value={arrivalDate}
                  onChange={(e) => {
                    setArrivalDate(e.target.value);
                    if (errors.arrivalDate) {
                      setErrors((prev) => {
                        const next = { ...prev };
                        delete next.arrivalDate;
                        return next;
                      });
                    }
                  }}
                  className="w-full text-xs font-mono bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
                {errors.arrivalDate && (
                  <p className="text-[11px] text-red-600 mt-1">{errors.arrivalDate}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="new-departure-date"
                  className="block text-[11px] font-medium text-slate-700 mb-1"
                >
                  Departure Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  id="new-departure-date"
                  value={departureDate}
                  onChange={(e) => {
                    setDepartureDate(e.target.value);
                    if (errors.departureDate) {
                      setErrors((prev) => {
                        const next = { ...prev };
                        delete next.departureDate;
                        return next;
                      });
                    }
                  }}
                  className="w-full text-xs font-mono bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
                {errors.departureDate && (
                  <p className="text-[11px] text-red-600 mt-1">{errors.departureDate}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="new-adult-count"
                  className="block text-[11px] font-medium text-slate-700 mb-1"
                >
                  Adults <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  id="new-adult-count"
                  min={1}
                  value={adultCount}
                  onChange={(e) => setAdultCount(Number(e.target.value))}
                  className="w-full text-xs bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
                {errors.adultCount && (
                  <p className="text-[11px] text-red-600 mt-1">{errors.adultCount}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="new-child-count"
                  className="block text-[11px] font-medium text-slate-700 mb-1"
                >
                  Children
                </label>
                <input
                  type="number"
                  id="new-child-count"
                  min={0}
                  value={childCount}
                  onChange={(e) => setChildCount(Number(e.target.value))}
                  className="w-full text-xs bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
              </div>

              <div>
                <label
                  htmlFor="new-nationality"
                  className="block text-[11px] font-medium text-slate-700 mb-1"
                >
                  Nationality <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="new-nationality"
                  value={nationality}
                  onChange={(e) => setNationality(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
              </div>

              <div>
                <label
                  htmlFor="new-language"
                  className="block text-[11px] font-medium text-slate-700 mb-1"
                >
                  Language <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="new-language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Initial Operational Logistics */}
          <div className="p-3.5 rounded-md bg-slate-50/70 border border-slate-200 space-y-3">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-700">
              <UserCheck size={14} className="text-blue-600" />
              <span>Initial Resource Allocations (Optional)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label
                  htmlFor="new-guide-name"
                  className="block text-[11px] font-medium text-slate-600 mb-1"
                >
                  Assigned Guide
                </label>
                <input
                  type="text"
                  id="new-guide-name"
                  placeholder="e.g. Ramesh Kumar"
                  value={guideName}
                  onChange={(e) => setGuideName(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
              </div>

              <div>
                <label
                  htmlFor="new-vehicle-type"
                  className="block text-[11px] font-medium text-slate-600 mb-1"
                >
                  Vehicle Category
                </label>
                <select
                  id="new-vehicle-type"
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value as VehicleType | "")}
                  className="w-full text-xs bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <option value="">Pending allocation…</option>
                  {APPROVED_VEHICLE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="new-driver-name"
                  className="block text-[11px] font-medium text-slate-600 mb-1"
                >
                  Assigned Driver
                </label>
                <input
                  type="text"
                  id="new-driver-name"
                  placeholder="e.g. Suresh Meena"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="p-3.5 rounded-md bg-slate-50/70 border border-slate-200 space-y-1.5">
            <label
              htmlFor="new-tour-notes"
              className="block text-[11px] font-bold uppercase tracking-wider text-slate-700"
            >
              Initial Dispatch Notes
            </label>
            <textarea
              id="new-tour-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add VIP requests, dietary preferences, or flight handover remarks…"
              className="w-full text-xs bg-white border border-slate-300 rounded-md p-2.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 placeholder:text-slate-400"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 shadow-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
            >
              <PlusCircle size={13} />
              {isSubmitting ? "Creating…" : "Create Operational Tour"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
