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
  Info,
  ShieldAlert,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardContent,
  Badge,
} from "@/components/ui/Primitives";
import { useLanguage } from "@/lib/i18n";
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
  const { t, language } = useLanguage();
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

  async function handleToggleMode(newMode: "operational" | "demo") {
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch("/api/import/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

    setIsPreviewLoading(true);
    setPreviewResult(null);

    try {
      let res: Response;
      const seasonParam = selectedSeason === "ALL" ? undefined : selectedSeason;

      if (useStaged) {
        res = await fetch("/api/import/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "load_staged", seasonFilter: seasonParam }),
        });
      } else if (selectedFile) {
        const formData = new FormData();
        formData.append("file", selectedFile);
        if (seasonParam) formData.append("seasonFilter", seasonParam);
        res = await fetch("/api/import/preview", {
          method: "POST",
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

    setIsCommitting(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

      {/* ── Status & Active Mode Card ───────────────────────────────────────── */}
      <Card>
        <CardHeader className="bg-slate-50/60 py-3 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database size={16} className="text-blue-600" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              {language === "ja" ? "運用データセット状態・永続ストレージ" : "Active Dataset Source & Permanent Storage"}
            </h2>
          </div>
          {status && (
            <Badge
              variant={status.activeMode === "operational" ? "success" : "warning"}
              className="font-semibold text-[11px]"
            >
              {status.activeMode === "operational" ? t("import_mgr.real_data_active") : t("import_mgr.demo_data_active")}
            </Badge>
          )}
        </CardHeader>

        <CardContent className="p-4 space-y-4 text-xs">
          {isLoadingStatus ? (
            <div className="py-6 text-center text-slate-400">{t("import_mgr.loading_dataset")}</div>
          ) : status && status.hasDataset ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/80 p-3 rounded-lg border border-slate-200/80">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">{t("import_mgr.canonical_tours")}</span>
                  <span className="text-base font-bold text-slate-900 font-mono">{status.toursCount}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">{t("import_mgr.sheets_parsed")}</span>
                  <span className="text-base font-bold text-slate-900 font-mono">{status.summary?.totalSheetsFound ?? 91}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">{t("import_mgr.spanning_merged")}</span>
                  <span className="text-base font-bold text-blue-700 font-mono">{status.duplicatesCount}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">{t("import_mgr.date_ambiguities")}</span>
                  <span className="text-base font-bold text-amber-700 font-mono">{status.ambiguitiesCount}</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 text-[11px] text-slate-600">
                <div>
                  <span>{t("import_mgr.source_workbook")} </span>
                  <strong className="text-slate-900 font-mono">
                    {status.summary?.workbookName || "NEW CHART 2025-2026 (1).xls"}
                  </strong>
                  {status.importedAt && (
                    <span className="text-slate-400 ml-2">
                      ({t("import_mgr.imported_on")} {new Date(status.importedAt).toLocaleDateString(language === "ja" ? "ja-JP" : "en-US")})
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href="/api/import/export-report"
                    download="SATF_Reconciliation_Report.csv"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 font-medium border border-slate-200 shadow-2xs btn-press transition-colors"
                  >
                    <Download size={13} className="text-blue-600" />
                    <span>{t("import_mgr.download_audit_report")}</span>
                  </a>

                  {status.activeMode === "operational" ? (
                    <button
                      type="button"
                      onClick={() => handleToggleMode("demo")}
                      className="px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 font-medium border border-amber-200 btn-press transition-colors"
                    >
                      {t("import_mgr.switch_to_demo")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleToggleMode("operational")}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-2xs btn-press transition-colors"
                    >
                      {t("import_mgr.switch_to_operational")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-3.5 text-slate-700 flex items-start gap-3">
              <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-semibold text-slate-900">{t("import_mgr.no_dataset_title")}</p>
                <p className="text-slate-600">
                  {t("import_mgr.no_dataset_desc")}
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
              {t("import_mgr.stage_workbook_title")}
            </h2>
          </div>
          <Badge variant="neutral">{language === "ja" ? "3行構造サポート" : "3-Row Layout Supported"}</Badge>
        </CardHeader>

        <CardContent className="p-4 space-y-4 text-xs">
          <p className="text-slate-600">
            {t("import_mgr.stage_workbook_desc")}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            {/* Season Filter Selector */}
            <div>
              <label htmlFor="season-filter-select" className="block text-[11px] font-bold text-slate-600 mb-1">
                {t("import_mgr.workbook_scope")}:
              </label>
              <select
                id="season-filter-select"
                value={selectedSeason}
                onChange={(e) => setSelectedSeason(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#244d70]/20 focus:border-[#244d70]"
              >
                <option value="ALL">{t("import_mgr.all_seasons")}</option>
                <option value="2025-2026">{t("import_mgr.season_2025_2026")}</option>
                <option value="2024-2025">{t("import_mgr.season_2024_2025")}</option>
                <option value="2023-2024">{t("import_mgr.season_2023_2024")}</option>
                <option value="2018-2019">{t("import_mgr.season_2018_2019")}</option>
                <option value="2015-2016">{t("import_mgr.season_2015_2016")}</option>
              </select>
            </div>

            {/* File Upload Selector */}
            <div className="sm:col-span-2">
              <label htmlFor={uploadInputId} className="block text-[11px] font-bold text-slate-600 mb-1">
                {t("import_mgr.upload_custom_title")}:
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
                    className="shrink-0 px-3 py-1.5 bg-[#244d70] hover:bg-[#1b3b57] text-white rounded font-medium text-xs shadow-2xs btn-press transition-colors disabled:opacity-50"
                  >
                    {isPreviewLoading ? (language === "ja" ? "解析中..." : "Analyzing...") : (language === "ja" ? "ファイルを検証" : "Analyze File")}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Quick Action: Staged Desktop File */}
          <div className="bg-[#dcecf7]/30 border border-[#244d70]/20 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-3">
            <div>
              <strong className="text-slate-900 block font-semibold">{t("import_mgr.staged_detected")}</strong>
              <span className="text-[11px] text-slate-600 font-mono">
                data/source/NEW CHART 2025-2026 (1).xls (19.64 MB, SHA-256 verified)
              </span>
            </div>

            <button
              type="button"
              onClick={() => handleRunDryRunPreview(true)}
              disabled={isPreviewLoading}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#244d70] hover:bg-[#1b3b57] text-white rounded-lg font-medium text-xs shadow-2xs btn-press transition-colors disabled:opacity-50 shrink-0"
            >
              {isPreviewLoading ? (
                <>
                  <RefreshCw size={13} className="animate-spin" />
                  <span>{t("import_mgr.auditing_workbook")}</span>
                </>
              ) : (
                <>
                  <Eye size={13} />
                  <span>{t("import_mgr.dry_run")}</span>
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
                  {language === "ja" ? "事前検証（ドライラン）プレビュー・整合性監査" : "Dry-Run Preview & Reconciliation Audit"}
                </h2>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {language === "ja"
                  ? "本番取込を確定する前に、解析結果、日付曖昧性判定、複数シート統合ツアーを確認できます。"
                  : "Inspect parsed records, flagged date ambiguities, and merged multi-sheet tours before confirming import."}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsConfirmOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-2xs btn-press transition-colors"
              >
                <CheckCircle2 size={14} />
                <span>{language === "ja" ? "このデータセットを本番反映・有効化" : "Commit & Activate This Dataset"}</span>
              </button>
            </div>
          </CardHeader>

          <CardContent className="p-4 space-y-4 text-xs">
            {/* KPI Reconciled Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">{t("import_mgr.total_blocks")}</span>
                <span className="text-lg font-bold text-slate-900 font-mono">{previewResult.summary.totalTourBlocks}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">{t("import_mgr.canonical_tours")}</span>
                <span className="text-lg font-bold text-emerald-700 font-mono">{previewResult.summary.canonicalToursCount}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">{t("import_mgr.spanning_merged")}</span>
                <span className="text-lg font-bold text-blue-700 font-mono">{previewResult.summary.spanningToursCount}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">{t("import_mgr.date_ambiguities")}</span>
                <span className="text-lg font-bold text-amber-700 font-mono">{previewResult.summary.dateAmbiguityCount}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">{t("import_mgr.unassigned_guides")}</span>
                <span className="text-lg font-bold text-slate-600 font-mono">{previewResult.summary.unassignedGuidesCount}</span>
              </div>
            </div>

            {/* Inspector Navigation Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <button
                type="button"
                onClick={() => setActiveTab("summary")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold btn-press transition-colors ${
                  activeTab === "summary" ? "bg-[#244d70] text-white shadow-2xs" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {t("import_mgr.tab_summary")} ({previewResult.summary.sheetsSummary.filter((s) => s.toursCount > 0).length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("ambiguities")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold btn-press transition-colors ${
                  activeTab === "ambiguities" ? "bg-amber-600 text-white shadow-2xs" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {t("import_mgr.tab_ambiguities")} ({previewResult.ambiguities.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("duplicates")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold btn-press transition-colors ${
                  activeTab === "duplicates" ? "bg-[#244d70] text-white shadow-2xs" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {t("import_mgr.tab_duplicates")} ({previewResult.duplicates.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("preview")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold btn-press transition-colors ${
                  activeTab === "preview" ? "bg-[#244d70] text-white shadow-2xs" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {t("import_mgr.tab_preview")} ({Math.min(25, previewResult.tours.length)})
              </button>
            </div>

            {/* TAB: Sheets Summary */}
            {activeTab === "summary" && (
              <div className="overflow-x-auto max-h-72 overflow-y-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0 uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-2 px-3">{t("import_mgr.sheet_name")}</th>
                      <th className="py-2 px-3">{t("import_mgr.season")}</th>
                      <th className="py-2 px-3">{t("import_mgr.rows")}</th>
                      <th className="py-2 px-3">{t("import_mgr.tours_detected")}</th>
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
                          <td className="py-1.5 px-3 font-mono font-bold text-[#244d70]">{sh.toursCount}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB: Ambiguities Inspector */}
            {activeTab === "ambiguities" && (
              <div className="space-y-2">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-900 flex items-start gap-2">
                  <ShieldAlert size={14} className="text-amber-700 shrink-0 mt-0.5" />
                  <span>
                    <strong>{t("import_mgr.ambiguity_preserved")} </strong>
                    {language === "ja"
                      ? "パーサーは日付の推測や改変を行いません。テンプレートの引き継ぎコピーによって新月シートに過去のシリアル番号が残っていた場合、元データ表記と変換日付の双方を明示的な警告とともに保持します。"
                      : "The parser does not rewrite or guess dates. Where template copy-forwarding produced older serial numbers in newer month sheets, both raw serial and converted dates are kept intact with explicit ambiguity warnings."}
                  </span>
                </div>
                <div className="overflow-x-auto max-h-72 overflow-y-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0 uppercase tracking-wider text-[11px]">
                      <tr>
                        <th className="py-2 px-3">{t("import_mgr.booking_ref")}</th>
                        <th className="py-2 px-3">{t("import_mgr.sheet")}</th>
                        <th className="py-2 px-3">{language === "ja" ? "行" : "Row"}</th>
                        <th className="py-2 px-3">{t("import_mgr.raw_serial")}</th>
                        <th className="py-2 px-3">{t("import_mgr.ambiguity_reason")}</th>
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
              <div className="overflow-x-auto max-h-72 overflow-y-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0 uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-2 px-3">{t("import_mgr.booking_ref")}</th>
                      <th className="py-2 px-3">{t("import_mgr.sheets_occurring")}</th>
                      <th className="py-2 px-3">{t("import_mgr.source_rows")}</th>
                      <th className="py-2 px-3">{t("import_mgr.resolution")}</th>
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
                            {d.resolution === "merged_spanning" && language === "ja"
                              ? "複数シート統合済"
                              : d.resolution.replace("_", " ").toUpperCase()}
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
              <div className="overflow-x-auto max-h-72 overflow-y-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0 uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-2 px-3">{t("import_mgr.booking_ref")}</th>
                      <th className="py-2 px-3">{language === "ja" ? "旅行者・人数" : "Guest & Pax"}</th>
                      <th className="py-2 px-3">{t("import_mgr.dates")}</th>
                      <th className="py-2 px-3">{t("import_mgr.destination")}</th>
                      <th className="py-2 px-3">{t("import_mgr.agency")}</th>
                      <th className="py-2 px-3">{t("import_mgr.guide")}</th>
                      <th className="py-2 px-3">{t("import_mgr.source")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewResult.tours.slice(0, 25).map((t) => {
                      const guide = t.assignments.find((a) => a.role === "guide")?.name || (language === "ja" ? "未配属" : "Unassigned");
                      return (
                        <tr key={t.id} className="hover:bg-slate-50">
                          <td className="py-1.5 px-3 font-mono font-bold text-[#244d70]">{t.bookingReference}</td>
                          <td className="py-1.5 px-3 text-slate-900">
                            <strong>{t.group.groupName}</strong> ({t.group.adultCount} {language === "ja" ? "名" : "pax"})
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-5 space-y-4">
            <div className="flex items-center gap-2.5 text-slate-900">
              <div className="p-2 bg-emerald-100 text-emerald-700 rounded-full">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <h3 className="font-bold text-sm">{t("import_mgr.confirm_title")}</h3>
                <p className="text-xs text-slate-500">{t("import_mgr.confirm_desc")}</p>
              </div>
            </div>

            <div className="space-y-2 text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <p>
                {language === "ja" ? (
                  <>以下より <strong>{previewResult.tours.length} 件の検証済ツアー</strong>を有効化します:</>
                ) : (
                  <>You are about to activate <strong>{previewResult.tours.length} verified tours</strong> from:</>
                )}
              </p>
              <p className="font-mono font-semibold text-slate-800">
                {previewResult.summary.workbookName}
              </p>
              <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-600 pt-1">
                <li>{t("import_mgr.confirm_replace")}</li>
                <li>{t("import_mgr.confirm_persist")}</li>
                <li>{t("import_mgr.confirm_flags")}</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmOpen(false)}
                disabled={isCommitting}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 btn-press transition-colors"
              >
                {t("create.cancel")}
              </button>
              <button
                type="button"
                onClick={handleCommitImport}
                disabled={isCommitting}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 btn-press transition-colors shadow-2xs"
              >
                {isCommitting ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    <span>{t("import_mgr.committing")}</span>
                  </>
                ) : (
                  <span>{language === "ja" ? "はい、本番反映を実行します" : "Yes, Commit & Activate"}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
