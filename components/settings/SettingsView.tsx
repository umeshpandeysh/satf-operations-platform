"use client";

import { useState, useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  Settings as SettingsIcon,
  HardDrive,
  Clock,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Database,
  Shield,
  Layers,
  X,
} from "lucide-react";
import {
  PageContainer,
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  Badge,
} from "@/components/ui/Primitives";
import type { Tour } from "@/lib/types";
import {
  subscribeSessionStore,
  getSessionSnapshot,
  getServerSnapshot,
  clearAllSessionTours,
  mergeSessionTours,
  parseSessionSnapshot,
  SESSION_STORAGE_KEY,
} from "@/lib/session-store";
import { formatDate } from "@/lib/utils";

export interface SettingsViewProps {
  initialTours: Tour[];
  referenceDate: string;
}

export function SettingsView({ initialTours, referenceDate }: SettingsViewProps) {
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

  const sessionToursCount = useMemo(() => {
    if (sessionState.status !== "ready" || !sessionState.tours) return 0;
    return Object.keys(sessionState.tours).length;
  }, [sessionState]);

  const sessionByteSize = useMemo(() => {
    if (!sessionRaw || sessionRaw.startsWith("__ERROR__")) return 0;
    return new Blob([sessionRaw]).size;
  }, [sessionRaw]);

  const baselineIds = useMemo(() => {
    return new Set(initialTours.map((t) => t.id));
  }, [initialTours]);

  const modifiedList = useMemo(() => {
    if (sessionState.status !== "ready" || !sessionState.tours) return [];
    return Object.entries(sessionState.tours).map(([id, tour]) => ({
      id,
      bookingReference: tour.bookingReference,
      groupName: tour.group.groupName,
      status: tour.status,
      isNew: !baselineIds.has(id),
    }));
  }, [sessionState, baselineIds]);

  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  function handleConfirmReset() {
    setErrorNotice(null);
    const result = clearAllSessionTours();
    if (!result.success) {
      setErrorNotice(
        result.error || "Failed to clear browser session storage."
      );
      return;
    }

    setIsResetModalOpen(false);
    setSuccessNotice("All session modifications cleared. Baseline mock dataset restored.");
    setTimeout(() => setSuccessNotice(null), 4000);
  }

  return (
    <PageContainer>
      {/* Storage read failure alert */}
      {sessionState.status === "error" && (
        <div
          role="alert"
          className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-2.5 text-xs font-medium text-amber-900 flex items-center gap-2 shadow-xs"
        >
          <AlertTriangle size={16} className="text-amber-600 shrink-0" />
          <span>
            <strong>Storage Warning:</strong> Could not read session modifications ({sessionState.error}). The browser storage driver may be restricted or blocked.
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

      {/* Error banner */}
      {errorNotice && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-xs font-medium text-red-800 flex items-center gap-2 shadow-xs"
        >
          <AlertCircle size={15} className="text-red-600 shrink-0" />
          <span>{errorNotice}</span>
        </div>
      )}

      {/* ── Settings Header ─────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200/90 rounded-lg p-4 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-md bg-slate-100 text-slate-700">
            <SettingsIcon size={20} />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900">
              System Settings & Operational Diagnostics
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Inspect prototype storage status, operational timezone configuration, and session cache lifecycle.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* ── Operational Environment & Timezone ──────────────────────────────── */}
        <Card>
          <CardHeader className="bg-slate-50/50 py-3 px-4">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-blue-600" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Operational Timezone & Schedule Anchor
              </h2>
            </div>
            <Badge variant="info">Active</Badge>
          </CardHeader>

          <CardContent className="p-4 space-y-3 text-xs">
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500 font-medium">Standard Dispatch Timezone</span>
              <strong className="text-slate-900 font-mono">Asia/Kolkata (IST UTC+5:30)</strong>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500 font-medium">Current Operational Base Date</span>
              <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                {formatDate(referenceDate)} ({referenceDate})
              </span>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500 font-medium">Date Calculation Strategy</span>
              <span className="text-slate-700 font-medium">UTC Boundary-Safe Arithmetic</span>
            </div>

            <div className="flex items-center justify-between py-2">
              <span className="text-slate-500 font-medium">Calendar Boundary Support</span>
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                <CheckCircle2 size={13} />
                Leap Year & Month Transitions Safe
              </span>
            </div>
          </CardContent>

          <CardFooter className="text-slate-500 text-[11px]">
            All tour arrival, departure, and itinerary calculations are synchronized to Asia/Kolkata operational time.
          </CardFooter>
        </Card>

        {/* ── Storage Architecture & Diagnostics ──────────────────────────────── */}
        <Card>
          <CardHeader className="bg-slate-50/50 py-3 px-4">
            <div className="flex items-center gap-2">
              <HardDrive size={16} className="text-purple-600" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Session Storage Diagnostics
              </h2>
            </div>
            <Badge
              variant={
                sessionState.status === "ready"
                  ? "success"
                  : sessionState.status === "error"
                  ? "danger"
                  : "neutral"
              }
            >
              {sessionState.status.toUpperCase()}
            </Badge>
          </CardHeader>

          <CardContent className="p-4 space-y-3 text-xs">
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500 font-medium">Storage Key</span>
              <span className="font-mono text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                {SESSION_STORAGE_KEY}
              </span>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500 font-medium">Active Session Modifications</span>
              <strong className="text-slate-900 font-mono">
                {sessionToursCount} {sessionToursCount === 1 ? "record" : "records"}
              </strong>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500 font-medium">Estimated Payload Footprint</span>
              <span className="font-mono text-slate-700">
                {(sessionByteSize / 1024).toFixed(2)} KB
              </span>
            </div>

            <div className="flex items-center justify-between py-2">
              <span className="text-slate-500 font-medium">SSR / Hydration Safety</span>
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                <CheckCircle2 size={13} />
                Guarded useSyncExternalStore
              </span>
            </div>
          </CardContent>

          <CardFooter className="text-slate-500 text-[11px]">
            Data is persisted within this browser session and does not write to a persistent database or server API.
          </CardFooter>
        </Card>
      </div>

      {/* ── Active Session Tour Modifications Roster ─────────────────────────── */}
      <Card>
        <CardHeader className="bg-slate-50/50 py-3 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-blue-600" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Session-Modified Records Audit
            </h2>
            <Badge variant="neutral" className="font-mono text-[10px]">
              {modifiedList.length} modified
            </Badge>
          </div>

          {sessionToursCount > 0 && (
            <button
              type="button"
              onClick={() => setIsResetModalOpen(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-red-700 hover:text-red-800 bg-red-50 hover:bg-red-100 border border-red-200 rounded-md shadow-xs transition-colors"
            >
              <RotateCcw size={12} />
              Reset All Session Data
            </button>
          )}
        </CardHeader>

        <CardContent className="p-0">
          {modifiedList.length === 0 ? (
            <div className="p-8 text-center">
              <Database size={28} className="text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-700">No session modifications recorded</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                All {initialTours.length} tours are currently rendering in their pristine baseline mock state.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50/90 text-slate-600 text-[11px] uppercase font-bold tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Tour Ref</th>
                    <th className="py-2.5 px-3">Group Name</th>
                    <th className="py-2.5 px-3">Provenance / Origin</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {modifiedList.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 whitespace-nowrap font-mono font-bold text-blue-700">
                        {item.bookingReference}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap font-medium text-slate-800">
                        {item.groupName}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {item.isNew ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            Client Created
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            Baseline Modified
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap font-mono text-[11px] uppercase">
                        {item.status}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <Link
                          href={`/tours/${item.id}`}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          View Tour
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex items-center justify-between text-xs text-slate-500">
          <span>Active Tours in Platform: {tours.length} ({initialTours.length} baseline + {modifiedList.filter(m => m.isNew).length} created)</span>
          <span className="text-[11px] font-mono text-slate-400">SATF Operations Runtime</span>
        </CardFooter>
      </Card>

      {/* ── Architecture & Prototype Policy Notice ─────────────────────────── */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs text-slate-600 space-y-2 shadow-xs">
        <div className="flex items-center gap-2 font-bold text-slate-800">
          <Shield size={16} className="text-blue-600" />
          <span>Operational Platform Architectural Integrity Policy</span>
        </div>
        <p className="leading-relaxed text-[11px] text-slate-500">
          The SATF Operations Platform frontend runs without backend database dependencies for this phase. Storage state is isolated to browser session storage (<code className="font-mono text-slate-700 bg-white px-1 py-0.5 rounded border border-slate-200">sessionStorage</code>). Edits, created tours, and cancellations survive client-side route transitions and page refreshes within the active tab, but will reset upon tab closure or explicit manual data reset.
        </p>
      </div>

      {/* ── Reset Confirmation Modal ────────────────────────────────────────── */}
      {isResetModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs"
        >
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-red-50/50">
              <div className="flex items-center gap-2 text-red-700">
                <RotateCcw size={18} />
                <h3 id="reset-modal-title" className="text-sm font-bold text-slate-900">
                  Reset All Session Modifications
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsResetModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition-colors"
                aria-label="Close dialog"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <p className="text-xs text-slate-600 leading-relaxed">
                You are about to clear all <strong className="text-slate-900 font-mono">{sessionToursCount}</strong> session-stored modifications and revert all tours back to the original baseline mock data.
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded p-2.5 text-xs text-amber-800 flex items-start gap-2">
                <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                <span>This action will permanently discard client-created tours and field updates saved in this browser tab.</span>
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsResetModalOpen(false)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-300 rounded-md shadow-xs transition-colors"
              >
                Keep Changes
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md shadow-xs transition-colors"
              >
                Clear All & Revert
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
