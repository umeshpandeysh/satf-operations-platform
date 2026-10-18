"use client";

import { useState, useEffect, useId, useCallback } from "react";
import {
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Database,
  RefreshCw,
  Download,
  Eye,
  ShieldAlert,
  Info,
  Lock,
  ShieldCheck,
  KeyRound,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardContent,
  Badge,
} from "@/components/ui/Primitives";
import type { ImportPreviewResult, ImportSummary } from "@/lib/types";

interface StatusData {
  hasDataset: boolean;
  activeMode: "operational" | "demo";
  importedAt: string | null;
  summary: ImportSummary | null;
  toursCount: number;
  ambiguitiesCount: number;
  duplicatesCount: number;
  stagedWorkbookAvailable: boolean;
}

export function ExcelImportManager() {
  const uploadInputId = useId();
  const [status, setStatus] = useState<StatusData | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [selectedSeason, setSelectedSeason] = useState<string>("ALL");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<ImportPreviewResult | null>(null);
  const [activeTab, setActiveTab] = useState<"summary" | "ambiguities" | "duplicates" | "preview">("summary");
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [operatorSession, setOperatorSession] = useState<{
    authenticated: boolean;
    operator?: string;
    csrfToken?: string;
  }>({ authenticated: false });
  const [passphraseInput, setPassphraseInput] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/import/status");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (e) {
      console.error("Failed to fetch import status:", e);
    } finally {
      setIsLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    fetch("/api/auth/session")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data) {
          setOperatorSession(data);
        }
      })
      .catch((e) => console.error("Initial session check error:", e));

    fetch("/api/import/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data) {
          setStatus(data);
        }
      })
      .catch((e) => console.error("Initial status load error:", e))
      .finally(() => {
        if (active) setIsLoadingStatus(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setIsLoggingIn(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase: passphraseInput }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setOperatorSession({
          authenticated: true,
          operator: data.operator,
          csrfToken: data.csrfToken,
        });
        setPassphraseInput("");
        setActionSuccess(`Operator session unlocked as ${data.operator}.`);
      } else {
        setAuthError(data.error || "Authentication failed. Check operator passphrase.");
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Network error during login.");
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setOperatorSession({ authenticated: false });
      setActionSuccess("Operator session locked.");
    } catch {}
  }

  async function handleToggleMode(newMode: "operational" | "demo") {
    setActionError(null);
    setActionSuccess(null);

    if (!operatorSession.authenticated) {
      setActionError("Operator authentication required: Please unlock operator access above.");
      return;
    }

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (operatorSession.csrfToken) headers["x-csrf-token"] = operatorSession.csrfToken;

      const res = await fetch("/api/import/status", {
        method: "POST",
        headers,
        body: JSON.stringify({ mode: newMode }),
      });
      const data = await res.json();
      if (data.success) {
        setActionSuccess(`Switched active dataset mode to ${newMode.toUpperCase()}. Refreshing view...`);
        await fetchStatus();
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      } else {
        setActionError(data.error || "Failed to switch dataset mode.");
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Error switching mode.");
    }
  }

  async function handleRunDryRunPreview(useStaged = false) {
    setActionError(null);
    setActionSuccess(null);

    if (!operatorSession.authenticated) {
      setActionError("Operator authentication required: Please unlock operator access above.");
      return;
    }

    setIsPreviewLoading(true);
    setPreviewResult(null);

    try {
      let res: Response;
      const seasonParam = selectedSeason === "ALL" ? undefined : selectedSeason;
      const headers: Record<string, string> = {};
      if (operatorSession.csrfToken) headers["x-csrf-token"] = operatorSession.csrfToken;

      if (useStaged) {
        headers["Content-Type"] = "application/json";
        res = await fetch("/api/import/preview", {
          method: "POST",
          headers,
          body: JSON.stringify({ action: "load_staged", seasonFilter: seasonParam }),
        });
      } else if (selectedFile) {
        const formData = new FormData();
        formData.append("file", selectedFile);
        if (seasonParam) formData.append("seasonFilter", seasonParam);
        res = await fetch("/api/import/preview", {
          method: "POST",
          headers,
          body: formData,
        });
      } else {
        setActionError("Please select a file to upload or choose the staged desktop workbook.");
        setIsPreviewLoading(false);
        return;
      }

      const data = await res.json();
      if (res.ok && data.success) {
        setPreviewResult(data);
        setActiveTab("summary");
        setActionSuccess(
          `Dry-run audit completed: ${data.summary.totalTourBlocks} blocks parsed across ${data.summary.operationalSheetsCount} operational sheets. Ready for inspection.`
        );
      } else {
        setActionError(data.error || "Failed to parse workbook preview.");
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Error executing preview.");
    } finally {
      setIsPreviewLoading(false);
    }
  }

  async function handleCommitImport() {
    if (!previewResult) return;

    if (!operatorSession.authenticated) {
      setActionError("Operator authentication required: Please unlock operator access above.");
      return;
    }

    setIsCommitting(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (operatorSession.csrfToken) headers["x-csrf-token"] = operatorSession.csrfToken;

      const res = await fetch("/api/import/commit", {
        method: "POST",
        headers,
        body: JSON.stringify({ payload: previewResult }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setIsConfirmOpen(false);
        setActionSuccess(
          `Successfully imported and activated ${data.count} operational tours from ${previewResult.summary.workbookName}! Refreshing platform...`
        );
        await fetchStatus();
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        setActionError(data.error || "Commit failed.");
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Error committing dataset.");
    } finally {
      setIsCommitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Feedback Messages */}
      {actionSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs font-medium text-emerald-800 flex items-center gap-2 shadow-xs">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs font-medium text-red-800 flex items-center gap-2 shadow-xs">
          <AlertCircle size={16} className="text-red-600 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* ── Operator Session & Authorization Card ────────────────────────────── */}
      <Card className="border-slate-200">
        <CardHeader className="bg-slate-50/60 py-3 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound size={16} className={operatorSession.authenticated ? "text-emerald-600" : "text-amber-600"} />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Operator Authorization & Session Security
            </h2>
          </div>
          <Badge
            variant={operatorSession.authenticated ? "success" : "warning"}
            className="font-semibold text-[11px] flex items-center gap-1"
          >
            {operatorSession.authenticated ? (
              <>
                <ShieldCheck size={12} className="text-emerald-600" />
                <span>Session Active: {operatorSession.operator || "Duty Dispatcher"}</span>
              </>
            ) : (
              <>
                <Lock size={12} className="text-amber-600" />
                <span>Locked — Passphrase Required</span>
              </>
            )}
          </Badge>
        </CardHeader>
        <CardContent className="p-4 text-xs">
          {operatorSession.authenticated ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-emerald-50/50 p-3 rounded-lg border border-emerald-200/80">
              <div className="space-y-0.5">
                <p className="font-semibold text-slate-900">
                  Authorized Operator: <span className="font-mono text-emerald-800">{operatorSession.operator}</span>
                </p>
                <p className="text-[11px] text-slate-500">
                  Protected operations enabled: dataset commits, preview parsing, mode changes, and CSV audits. Cookie secured with HttpOnly and SameSite=Strict.
                </p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white hover:bg-slate-50 text-slate-700 font-medium border border-slate-200 shadow-xs transition-colors shrink-0"
              >
                <Lock size={13} className="text-slate-500" />
                <span>Lock / End Session</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start gap-2 bg-amber-50/60 p-3 rounded-lg border border-amber-200/80 text-[11px] text-amber-900">
                <ShieldAlert size={15} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Protected Operations Boundary</p>
                  <p className="text-amber-800 mt-0.5">
                    Modifying operational data, executing workbook previews, and downloading guest reports requires an active server-side operator session.
                  </p>
                </div>
              </div>

              <form onSubmit={handleLogin} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="password"
                    value={passphraseInput}
                    onChange={(e) => setPassphraseInput(e.target.value)}
                    placeholder="Enter operator passphrase..."
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    disabled={isLoggingIn}
                  />
                  <Lock size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                </div>
                <button
                  type="submit"
                  disabled={isLoggingIn || !passphraseInput.trim()}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-1.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white rounded text-xs font-semibold shadow-xs transition-colors shrink-0"
                >
                  <KeyRound size={13} />
                  <span>{isLoggingIn ? "Verifying..." : "Unlock Operator Mode"}</span>
                </button>
              </form>

              {authError && (
                <p role="alert" className="text-red-600 text-[11px] font-medium flex items-center gap-1.5">
                  <AlertCircle size={13} className="shrink-0" />
                  <span>{authError}</span>
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Status & Active Mode Card ───────────────────────────────────────── */}
      <Card>
        <CardHeader className="bg-slate-50/60 py-3 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database size={16} className="text-blue-600" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Active Dataset Source & Permanent Storage
            </h2>
          </div>
          {status && (
            <Badge
              variant={status.activeMode === "operational" ? "success" : "warning"}
              className="font-semibold text-[11px]"
            >
              {status.activeMode === "operational" ? "Real Operational Data Active" : "Demo Mock Data Active"}
            </Badge>
          )}
        </CardHeader>

        <CardContent className="p-4 space-y-4 text-xs">
          {isLoadingStatus ? (
            <div className="py-6 text-center text-slate-400">Loading dataset state…</div>
          ) : status && status.hasDataset ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/80 p-3 rounded-lg border border-slate-200/80">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Canonical Tours</span>
                  <span className="text-base font-bold text-slate-900 font-mono">{status.toursCount}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Sheets Parsed</span>
                  <span className="text-base font-bold text-slate-900 font-mono">{status.summary?.totalSheetsFound ?? 91}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Spanning Merged</span>
                  <span className="text-base font-bold text-blue-700 font-mono">{status.duplicatesCount}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Date Ambiguities</span>
                  <span className="text-base font-bold text-amber-700 font-mono">{status.ambiguitiesCount}</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 text-[11px] text-slate-600">
                <div>
                  <span>Source Workbook: </span>
                  <strong className="text-slate-900 font-mono">
                    {status.summary?.workbookName || "NEW CHART 2025-2026 (1).xls"}
                  </strong>
                  {status.importedAt && (
                    <span className="text-slate-400 ml-2">
                      (Imported {new Date(status.importedAt).toLocaleDateString()})
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href="/api/import/export-report"
                    download="SATF_Reconciliation_Report.csv"
                    onClick={(e) => {
                      if (!operatorSession.authenticated) {
                        e.preventDefault();
                        setActionError("Operator authentication required to download reports containing guest records. Please unlock operator access above.");
                      }
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white hover:bg-slate-50 text-slate-700 font-medium border border-slate-200 shadow-xs transition-colors ${
                      !operatorSession.authenticated ? "opacity-60 cursor-not-allowed" : ""
                    }`}
                    title={!operatorSession.authenticated ? "Unlock operator access to download report" : undefined}
                  >
                    <Download size={13} className="text-blue-600" />
                    <span>Download Audit Report (CSV)</span>
                  </a>

                  {status.activeMode === "operational" ? (
                    <button
                      type="button"
                      onClick={() => handleToggleMode("demo")}
                      className="px-3 py-1.5 rounded bg-amber-50 hover:bg-amber-100 text-amber-800 font-medium border border-amber-200 transition-colors"
                    >
                      Switch to Demo Mode
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleToggleMode("operational")}
                      className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-xs transition-colors"
                    >
                      Activate Operational Data
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-3.5 text-slate-700 flex items-start gap-3">
              <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-semibold text-slate-900">No Operational Dataset Imported Yet</p>
                <p className="text-slate-600">
                  The website is currently presenting mock demonstration tours. Use the tool below to import the actual SATF operational workbook.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Excel Import & Dry-Run Preview Center ────────────────────────────── */}
      <Card>
        <CardHeader className="bg-slate-50/60 py-3 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={16} className="text-blue-600" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Excel Workbook Import & Validation Engine
            </h2>
          </div>
          <Badge variant="neutral">3-Row Layout Supported</Badge>
        </CardHeader>

        <CardContent className="p-4 space-y-4 text-xs">
          <p className="text-slate-600">
            Import the operational Excel chart (e.g. <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">NEW CHART 2025-2026 (1).xls</code>).
            The parser detects the 3-row architecture (Tour, Transport, Guide), reconciles spanning tours, flags date ambiguities without guessing, and generates a verified dataset.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            {/* Season Filter Selector */}
            <div>
              <label htmlFor="season-filter-select" className="block text-[11px] font-bold text-slate-600 mb-1">
                Target Season Filter:
              </label>
              <select
                id="season-filter-select"
                value={selectedSeason}
                onChange={(e) => setSelectedSeason(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">All Seasons (Full 91 Sheets)</option>
                <option value="2025-2026">Season 2025-2026 (Active, 16 Sheets)</option>
                <option value="2024-2025">Season 2024-2025</option>
                <option value="2023-2024">Season 2023-2024</option>
                <option value="2018-2019">Season 2018-2019</option>
                <option value="2015-2016">Season 2015-2016</option>
              </select>
            </div>

            {/* File Upload Selector */}
            <div className="sm:col-span-2">
              <label htmlFor={uploadInputId} className="block text-[11px] font-bold text-slate-600 mb-1">
                Upload Custom Workbook (.xls / .xlsx):
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={uploadInputId}
                  type="file"
                  accept=".xls,.xlsx"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                  className="w-full text-xs text-slate-500 file:mr-2 file:py-1 file:px-2.5 file:rounded file:border file:border-slate-300 file:text-xs file:font-medium file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
                />
                {selectedFile && (
                  <button
                    type="button"
                    onClick={() => handleRunDryRunPreview(false)}
                    disabled={isPreviewLoading}
                    className="shrink-0 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium text-xs transition-colors disabled:opacity-50"
                  >
                    {isPreviewLoading ? "Analyzing..." : "Analyze File"}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Quick Action: Staged Desktop File */}
          <div className="bg-blue-50/50 border border-blue-200/70 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-3">
            <div>
              <strong className="text-slate-900 block font-semibold">Staged Desktop Workbook Detected</strong>
              <span className="text-[11px] text-slate-600 font-mono">
                data/source/NEW CHART 2025-2026 (1).xls (19.64 MB, SHA-256 verified)
              </span>
            </div>

            <button
              type="button"
              onClick={() => handleRunDryRunPreview(true)}
              disabled={isPreviewLoading}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded font-medium text-xs shadow-xs transition-colors disabled:opacity-50 shrink-0"
            >
              {isPreviewLoading ? (
                <>
                  <RefreshCw size={13} className="animate-spin" />
                  <span>Auditing Workbook...</span>
                </>
              ) : (
                <>
                  <Eye size={13} />
                  <span>Audit & Generate Dry-Run Preview</span>
                </>
              )}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* ── Dry-Run Preview & Reconciliation Report Inspector ────────────────── */}
      {previewResult && (
        <Card className="border-blue-200 shadow-sm">
          <CardHeader className="bg-blue-50/50 py-3 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-blue-600" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Dry-Run Preview & Reconciliation Audit
                </h2>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Inspect parsed records, flagged date ambiguities, and merged multi-sheet tours before confirming import.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsConfirmOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-md shadow-xs transition-colors"
              >
                <CheckCircle2 size={14} />
                <span>Commit & Activate This Dataset</span>
              </button>
            </div>
          </CardHeader>

          <CardContent className="p-4 space-y-4 text-xs">
            {/* KPI Reconciled Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Tour Blocks</span>
                <span className="text-lg font-bold text-slate-900 font-mono">{previewResult.summary.totalTourBlocks}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Canonical Tours</span>
                <span className="text-lg font-bold text-emerald-700 font-mono">{previewResult.summary.canonicalToursCount}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Spanning Merged</span>
                <span className="text-lg font-bold text-blue-700 font-mono">{previewResult.summary.spanningToursCount}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Date Ambiguities</span>
                <span className="text-lg font-bold text-amber-700 font-mono">{previewResult.summary.dateAmbiguityCount}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Unassigned Guides</span>
                <span className="text-lg font-bold text-slate-600 font-mono">{previewResult.summary.unassignedGuidesCount}</span>
              </div>
            </div>

            {/* Inspector Navigation Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <button
                type="button"
                onClick={() => setActiveTab("summary")}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  activeTab === "summary" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Sheet Inventory ({previewResult.summary.sheetsSummary.filter((s) => s.toursCount > 0).length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("ambiguities")}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  activeTab === "ambiguities" ? "bg-amber-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Date Ambiguities ({previewResult.ambiguities.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("duplicates")}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  activeTab === "duplicates" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Spanning Tours ({previewResult.duplicates.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("preview")}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  activeTab === "preview" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Tour Records Preview ({Math.min(25, previewResult.tours.length)})
              </button>
            </div>

            {/* TAB: Sheets Summary */}
            {activeTab === "summary" && (
              <div className="overflow-x-auto max-h-72 overflow-y-auto border border-slate-200 rounded-md">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0">
                    <tr>
                      <th className="py-2 px-3">Sheet Name</th>
                      <th className="py-2 px-3">Season</th>
                      <th className="py-2 px-3">Rows</th>
                      <th className="py-2 px-3">Tours Detected</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewResult.summary.sheetsSummary
                      .filter((s) => s.toursCount > 0)
                      .map((sh) => (
                        <tr key={sh.sheetName} className="hover:bg-slate-50">
                          <td className="py-1.5 px-3 font-semibold text-slate-900">{sh.sheetName}</td>
                          <td className="py-1.5 px-3 text-slate-600">{sh.season}</td>
                          <td className="py-1.5 px-3 font-mono text-slate-500">{sh.rowsCount}</td>
                          <td className="py-1.5 px-3 font-mono font-bold text-blue-700">{sh.toursCount}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB: Ambiguities Inspector */}
            {activeTab === "ambiguities" && (
              <div className="space-y-2">
                <div className="bg-amber-50 border border-amber-200 rounded p-2.5 text-[11px] text-amber-900 flex items-start gap-2">
                  <ShieldAlert size={14} className="text-amber-700 shrink-0 mt-0.5" />
                  <span>
                    <strong>Ambiguity Rule Faithfully Preserved:</strong> The parser does not rewrite or guess dates. Where template copy-forwarding produced older serial numbers in newer month sheets, both raw serial and converted dates are kept intact with explicit ambiguity warnings.
                  </span>
                </div>
                <div className="overflow-x-auto max-h-72 overflow-y-auto border border-slate-200 rounded-md">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0">
                      <tr>
                        <th className="py-2 px-3">Ref</th>
                        <th className="py-2 px-3">Sheet</th>
                        <th className="py-2 px-3">Row</th>
                        <th className="py-2 px-3">Raw Serial</th>
                        <th className="py-2 px-3">Ambiguity Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewResult.ambiguities.slice(0, 50).map((a, i) => (
                        <tr key={`${a.bookingReference}-${i}`} className="hover:bg-amber-50/30">
                          <td className="py-1.5 px-3 font-mono font-bold text-slate-900">{a.bookingReference}</td>
                          <td className="py-1.5 px-3 text-slate-700">{a.sheet}</td>
                          <td className="py-1.5 px-3 font-mono text-slate-500">{a.row}</td>
                          <td className="py-1.5 px-3 font-mono text-amber-800">{String(a.rawSerial ?? "")}</td>
                          <td className="py-1.5 px-3 text-slate-600 text-[11px]">{a.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB: Duplicates & Spanning Inspector */}
            {activeTab === "duplicates" && (
              <div className="overflow-x-auto max-h-72 overflow-y-auto border border-slate-200 rounded-md">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0">
                    <tr>
                      <th className="py-2 px-3">Ref</th>
                      <th className="py-2 px-3">Sheets Occurring</th>
                      <th className="py-2 px-3">Source Rows</th>
                      <th className="py-2 px-3">Resolution</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewResult.duplicates.map((d) => (
                      <tr key={d.bookingReference} className="hover:bg-slate-50">
                        <td className="py-1.5 px-3 font-mono font-bold text-slate-900">{d.bookingReference}</td>
                        <td className="py-1.5 px-3 font-medium text-slate-700">{d.sheets.join(" → ")}</td>
                        <td className="py-1.5 px-3 font-mono text-slate-500">{d.rows.join(", ")}</td>
                        <td className="py-1.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              d.resolution === "merged_spanning"
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                : "bg-blue-100 text-blue-800 border border-blue-200"
                            }`}
                          >
                            {d.resolution.replace("_", " ").toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB: Tour Records Preview */}
            {activeTab === "preview" && (
              <div className="overflow-x-auto max-h-72 overflow-y-auto border border-slate-200 rounded-md">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0">
                    <tr>
                      <th className="py-2 px-3">Booking Ref</th>
                      <th className="py-2 px-3">Guest & Pax</th>
                      <th className="py-2 px-3">Dates</th>
                      <th className="py-2 px-3">Destination</th>
                      <th className="py-2 px-3">Agency</th>
                      <th className="py-2 px-3">Guide</th>
                      <th className="py-2 px-3">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewResult.tours.slice(0, 25).map((t) => {
                      const guide = t.assignments.find((a) => a.role === "guide")?.name || "Unassigned";
                      return (
                        <tr key={t.id} className="hover:bg-slate-50">
                          <td className="py-1.5 px-3 font-mono font-bold text-blue-700">{t.bookingReference}</td>
                          <td className="py-1.5 px-3 text-slate-900">
                            <strong>{t.group.groupName}</strong> ({t.group.adultCount} pax)
                          </td>
                          <td className="py-1.5 px-3 font-mono text-slate-600">
                            {t.arrivalDate} → {t.departureDate}
                          </td>
                          <td className="py-1.5 px-3 text-slate-700 truncate max-w-xs">{t.destination}</td>
                          <td className="py-1.5 px-3 text-slate-600 font-mono">{t.agency || "-"}</td>
                          <td className="py-1.5 px-3 text-slate-700">{guide}</td>
                          <td className="py-1.5 px-3 text-slate-500 font-mono text-[10px]">
                            {t.sourceSheet}:{t.sourceRow}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Confirmation Modal ──────────────────────────────────────────────── */}
      {isConfirmOpen && previewResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 max-w-md w-full p-5 space-y-4">
            <div className="flex items-center gap-2.5 text-slate-900">
              <div className="p-2 bg-emerald-100 text-emerald-700 rounded-full">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <h3 className="font-bold text-sm">Confirm Operational Dataset Import</h3>
                <p className="text-xs text-slate-500">Explicit confirmation required</p>
              </div>
            </div>

            <div className="space-y-2 text-xs text-slate-600 bg-slate-50 p-3 rounded border border-slate-200">
              <p>
                You are about to activate <strong>{previewResult.tours.length} verified tours</strong> from:
              </p>
              <p className="font-mono font-semibold text-slate-800">
                {previewResult.summary.workbookName}
              </p>
              <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-600 pt-1">
                <li>Will replace active demo mock tours across the platform.</li>
                <li>Data persists permanently in server storage (survives refresh).</li>
                <li>All dates, references, and ambiguity flags will be preserved.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmOpen(false)}
                disabled={isCommitting}
                className="px-3 py-1.5 rounded text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCommitImport}
                disabled={isCommitting}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-xs"
              >
                {isCommitting ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    <span>Committing...</span>
                  </>
                ) : (
                  <span>Yes, Commit & Activate</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
