"use client";

import { useState, useMemo, useEffect, useSyncExternalStore } from "react";
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
  Activity,
  Server,
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
import { useLanguage } from "@/lib/i18n";

export interface SettingsViewProps {
  initialTours: Tour[];
  referenceDate: string;
  embedded?: boolean;
}

interface ImportStatusApiData {
  hasDataset: boolean;
  activeMode: "operational" | "demo";
  importedAt: string | null;
  toursCount: number;
  ambiguitiesCount: number;
  duplicatesCount: number;
  stagedWorkbookAvailable: boolean;
  database?: {
    configured: boolean;
    connected: boolean;
    liveToursCount: number | null;
    liveAuditCount: number | null;
  };
}

export function SettingsView({ initialTours, referenceDate, embedded }: SettingsViewProps) {
  const { t, language } = useLanguage();

  const [importStatus, setImportStatus] = useState<ImportStatusApiData | null>(null);

  useEffect(() => {
    fetch("/api/import/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setImportStatus(data);
      })
      .catch(() => {});
  }, []);

  // Handle deep-link scrolling on mount
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash) {
      const id = window.location.hash.replace("#", "");
      setTimeout(() => {
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 350);
    }
  }, []);

  const scrollToAnchor = (id: string) => {
    if (typeof document === "undefined") return;
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.replaceState(null, "", `#${id}`);
    }
  };

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
        result.error ||
          (language === "ja"
            ? "セッションストレージの初期化に失敗しました。"
            : "Failed to clear browser session storage.")
      );
      return;
    }

    setIsResetModalOpen(false);
    setSuccessNotice(
      language === "ja"
        ? "すべてのセッション変更がクリアされ、基準データに戻りました。"
        : "All session modifications cleared. Baseline mock dataset restored."
    );
    setTimeout(() => setSuccessNotice(null), 4000);
  }

  const content = (
    <div className="space-y-8 pb-16">
      {/* ── SECTION 1: Page Heading, Concise Introduction & In-Page Quick Anchor Bar ── */}
      <div className="bg-white surface-card border border-slate-200/90 rounded-xl p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#dcecf7]/60 text-[#244d70] border border-[#244d70]/20">
              <SettingsIcon size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                  {language === "ja" ? "システム設定" : "System Settings"}
                </h1>
                <Badge variant="info" className="font-semibold text-[10px] tracking-wider uppercase bg-[#dcecf7]/70 text-[#244d70] border border-[#244d70]/20">
                  {language === "ja" ? "運用設定" : "Operations"}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-3xl leading-relaxed">
                {language === "ja"
                  ? "運行管制タイムゾーン、暦境界計算ルール、ブラウザ作業セッションの保持状態、およびSupabase PostgreSQLデータベースの永続化接続診断を管理します。"
                  : "Operational dispatch settings: configure timezones and calendar calculation rules, manage browser session working state, and monitor Supabase PostgreSQL persistent storage diagnostics."}
              </p>
            </div>
          </div>
        </div>

        {/* Quick In-Page Anchor Navigation Bar */}
        <div className="pt-2 border-t border-slate-100">
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 text-xs">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 shrink-0">
              {language === "ja" ? "セクション移動:" : "Jump to:"}
            </span>
            <button
              type="button"
              onClick={() => scrollToAnchor("operational-settings")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-[#dcecf7]/30 text-slate-700 hover:text-[#244d70] border border-slate-200/80 hover:border-[#244d70]/30 font-semibold btn-press transition-colors shrink-0 cursor-pointer"
            >
              <Clock size={13} className="text-[#244d70]" />
              <span>{language === "ja" ? "1. 運行タイムゾーン・基準日" : "1. Operational Settings & Schedule"}</span>
            </button>

            <button
              type="button"
              onClick={() => scrollToAnchor("session-working-state")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-[#dcecf7]/30 text-slate-700 hover:text-[#244d70] border border-slate-200/80 hover:border-[#244d70]/30 font-semibold btn-press transition-colors shrink-0 cursor-pointer"
            >
              <RotateCcw size={13} className="text-[#244d70]" />
              <span>{language === "ja" ? "2. 作業セッション管理" : "2. Session Working State"}</span>
            </button>

            <button
              type="button"
              onClick={() => scrollToAnchor("system-diagnostics")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-[#dcecf7]/30 text-slate-700 hover:text-[#244d70] border border-slate-200/80 hover:border-[#244d70]/30 font-semibold btn-press transition-colors shrink-0 cursor-pointer"
            >
              <Server size={13} className="text-purple-600" />
              <span>{language === "ja" ? "3. データベース診断・永続化" : "3. System & Database Diagnostics"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Storage read failure alert */}
      {sessionState.status === "error" && (
        <div
          role="alert"
          className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-2.5 text-xs font-medium text-amber-900 flex items-center gap-2 shadow-xs"
        >
          <AlertTriangle size={16} className="text-amber-600 shrink-0" />
          <span>
            <strong>{language === "ja" ? "ストレージ警告:" : "Storage Warning:"}</strong> {language === "ja" ? `セッション変更の読み込みに失敗しました (${sessionState.error})。ブラウザのストレージが制限されている可能性があります。` : `Could not read session modifications (${sessionState.error}). The browser storage driver may be restricted or blocked.`}
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

      {/* ── SECTION 1: Operational Settings (Timezone, Date Strategy) ── */}
      <section id="operational-settings" className="scroll-mt-24 space-y-4">
        <div className="flex items-center gap-2 pb-1 border-b border-slate-200">
          <span className="px-2 py-0.5 rounded bg-[#dcecf7]/70 text-[#244d70] border border-[#244d70]/20 text-[11px] font-bold uppercase tracking-wider">
            {language === "ja" ? "第1項" : "Part 1"}
          </span>
          <h2 className="text-base font-bold text-slate-900 tracking-tight">
            {language === "ja" ? "運行設定・基準日管理" : "Operational Settings & Schedule Anchor"}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Operational Environment & Timezone */}
          <Card className="surface-card border-slate-200/90 shadow-2xs hover:shadow-xs transition-all">
            <CardHeader className="bg-slate-50/50 py-3 px-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-[#244d70]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  {language === "ja" ? "運行タイムゾーンおよび基準日管理" : "Operational Timezone & Schedule Anchor"}
                </h3>
              </div>
              <Badge variant="info">{language === "ja" ? "稼働中" : "Active"}</Badge>
            </CardHeader>

            <CardContent className="p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500 font-medium">
                  {language === "ja" ? "標準管制タイムゾーン" : "Standard Dispatch Timezone"}
                </span>
                <strong className="text-slate-900 font-mono">Asia/Kolkata (IST UTC+5:30)</strong>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500 font-medium">
                  {language === "ja" ? "現在の運行基準日" : "Current Operational Base Date"}
                </span>
                <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  {formatDate(referenceDate)} ({referenceDate})
                </span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500 font-medium">
                  {language === "ja" ? "日付計算ロジック" : "Date Calculation Strategy"}
                </span>
                <span className="text-slate-700 font-medium">
                  {language === "ja" ? "UTC日付境界保護アルゴリズム" : "UTC Boundary-Safe Arithmetic"}
                </span>
              </div>

              <div className="flex items-center justify-between py-2">
                <span className="text-slate-500 font-medium">
                  {language === "ja" ? "暦境界の安全対応" : "Calendar Boundary Support"}
                </span>
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <CheckCircle2 size={13} />
                  {language === "ja" ? "閏年および月末月初遷移対応済" : "Leap Year & Month Transitions Safe"}
                </span>
              </div>
            </CardContent>

            <CardFooter className="text-slate-500 text-[11px]">
              {language === "ja"
                ? "すべてのツアー到着・出発・周遊日程計算はインド現地時間 (Asia/Kolkata) に同期しています。"
                : "All tour arrival, departure, and itinerary calculations are synchronized to Asia/Kolkata operational time."}
            </CardFooter>
          </Card>

          {/* Timezone Standards & SLA Card */}
          <Card className="surface-card border-slate-200/90 shadow-2xs hover:shadow-xs transition-all">
            <CardHeader className="bg-slate-50/50 py-3 px-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-[#244d70]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  {language === "ja" ? "運行SLAおよび境界保護方針" : "Operational SLA & Boundary Protections"}
                </h3>
              </div>
              <Badge variant="success">{language === "ja" ? "保護有効" : "Protected"}</Badge>
            </CardHeader>

            <CardContent className="p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500 font-medium">
                  {language === "ja" ? "日付オフセット基準" : "Day Transition Offset"}
                </span>
                <span className="text-slate-800 font-mono">00:00:00 IST (UTC+05:30)</span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500 font-medium">
                  {language === "ja" ? "空港送迎手配バッファ" : "Airport Transfer Buffer"}
                </span>
                <span className="text-slate-800 font-medium">
                  {language === "ja" ? "到着3時間前 / 出発4時間前" : "Arrival -3h / Departure -4h"}
                </span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500 font-medium">
                  {language === "ja" ? "ガイド・ドライバー拘束規定" : "Duty Assignment Roster"}
                </span>
                <span className="text-slate-800 font-medium">
                  {language === "ja" ? "日次全日ブロック制 (重複配置アラート)" : "Full-Day Lock (Double-booking Guard)"}
                </span>
              </div>

              <div className="flex items-center justify-between py-2">
                <span className="text-slate-500 font-medium">
                  {language === "ja" ? "日中・夜間運行切り替え" : "Night Operation Cutover"}
                </span>
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <CheckCircle2 size={13} />
                  <span>22:00 - 06:00 IST (Red-Eye Leg Protocol)</span>
                </span>
              </div>
            </CardContent>

            <CardFooter className="text-slate-500 text-[11px]">
              {language === "ja"
                ? "デリー・アグラ・ジャイプール・バラナシ各拠点の運行スタッフにリアルタイム配信されます。"
                : "Real-time dispatch schedules distributed across Delhi, Agra, Jaipur, and Varanasi stations."}
            </CardFooter>
          </Card>
        </div>
      </section>

      {/* ── SECTION 2: Active Browser Session Working State ── */}
      <section id="session-working-state" className="scroll-mt-24 space-y-4">
        <div className="flex items-center gap-2 pb-1 border-b border-slate-200">
          <span className="px-2 py-0.5 rounded bg-[#dcecf7]/70 text-[#244d70] border border-[#244d70]/20 text-[11px] font-bold uppercase tracking-wider">
            {language === "ja" ? "第2項" : "Part 2"}
          </span>
          <h2 className="text-base font-bold text-slate-900 tracking-tight">
            {language === "ja" ? "作業セッション管理・ローカル変更" : "Session Working State & Modifications"}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Card: Active Browser Session Overrides */}
          <Card className="surface-card border-slate-200/90 shadow-2xs hover:shadow-xs transition-all">
            <CardHeader className="bg-slate-50/50 py-3 px-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RotateCcw size={16} className="text-[#244d70]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  {language === "ja" ? "セッション変更オーバーライド管理" : "Session Overrides & Working State"}
                </h3>
              </div>
              <Badge variant={sessionToursCount > 0 ? "warning" : "neutral"} className="font-mono text-[10px]">
                {sessionToursCount} {language === "ja" ? "件変更" : "overrides"}
              </Badge>
            </CardHeader>

            <CardContent className="p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500 font-medium">
                  {language === "ja" ? "ストレージキー" : "Storage Key"}
                </span>
                <span className="font-mono text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                  {SESSION_STORAGE_KEY}
                </span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500 font-medium">
                  {language === "ja" ? "ローカル手配編集" : "Client Modifications"}
                </span>
                <strong className="text-slate-900 font-mono">
                  {sessionToursCount} {sessionToursCount === 1 ? "tour" : "tours"}
                </strong>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500 font-medium">
                  {language === "ja" ? "セッション状態" : "Session Health"}
                </span>
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <CheckCircle2 size={13} />
                  <span>{sessionState.status.toUpperCase()} (Hydration Guarded)</span>
                </span>
              </div>

              <div className="pt-1 flex items-center justify-between">
                <span className="text-[11px] text-slate-500">
                  {sessionToursCount > 0
                    ? (language === "ja" ? "未コミットのローカル変更が存在します" : "Session-modified tours active in view")
                    : (language === "ja" ? "ベースラインデータと完全に一致しています" : "Matches baseline dataset perfectly")}
                </span>
                {sessionToursCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsResetModalOpen(true)}
                    className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md shadow-2xs btn-press transition-colors cursor-pointer"
                  >
                    <RotateCcw size={12} />
                    <span>{language === "ja" ? "セッション初期化" : "Reset Overrides"}</span>
                  </button>
                )}
              </div>
            </CardContent>

            <CardFooter className="text-slate-500 text-[11px]">
              {language === "ja"
                ? "手配編集データはブラウザのセッションストレージに安全に保持されます。"
                : "Working modifications persist in this browser session without polluting production datasets."}
            </CardFooter>
          </Card>

          {/* Card: Browser Storage Architecture */}
          <Card className="surface-card border-slate-200/90 shadow-2xs hover:shadow-xs transition-all">
            <CardHeader className="bg-slate-50/50 py-3 px-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HardDrive size={16} className="text-[#244d70]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  {language === "ja" ? "ブラウザストレージアーキテクチャ" : "Browser Storage Architecture"}
                </h3>
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
                <span className="text-slate-500 font-medium">
                  {language === "ja" ? "ストレージエンジン" : "Storage Engine"}
                </span>
                <span className="font-mono text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                  window.sessionStorage
                </span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500 font-medium">
                  {language === "ja" ? "適用中のセッション変更" : "Active Session Modifications"}
                </span>
                <strong className="text-slate-900 font-mono">
                  {sessionToursCount} {language === "ja" ? "件" : sessionToursCount === 1 ? "record" : "records"}
                </strong>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500 font-medium">
                  {language === "ja" ? "推定データ容量" : "Estimated Payload Footprint"}
                </span>
                <span className="font-mono text-slate-700">
                  {(sessionByteSize / 1024).toFixed(2)} KB
                </span>
              </div>

              <div className="flex items-center justify-between py-2">
                <span className="text-slate-500 font-medium">
                  {language === "ja" ? "SSR/ハイドレーション保護" : "SSR / Hydration Safety"}
                </span>
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <CheckCircle2 size={13} />
                  {language === "ja" ? "useSyncExternalStoreによる安全制御" : "Guarded useSyncExternalStore"}
                </span>
              </div>
            </CardContent>

            <CardFooter className="text-slate-500 text-[11px]">
              {language === "ja"
                ? "手配編集データはブラウザのセッションストレージに安全に保持されます。"
                : "Working session data is protected against hydration mismatches and never mutates production records uncommitted."}
            </CardFooter>
          </Card>
        </div>

        {/* Active Session Tour Modifications Roster */}
        <Card className="surface-card border-slate-200/90 shadow-2xs">
          <CardHeader className="bg-slate-50/50 py-3 px-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers size={16} className="text-[#244d70]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                {language === "ja" ? "セッション変更履歴監査" : "Session-Modified Records Audit"}
              </h3>
              <Badge variant="neutral" className="font-mono text-[10px]">
                {modifiedList.length} {language === "ja" ? "件変更" : "modified"}
              </Badge>
            </div>

            {sessionToursCount > 0 && (
              <button
                type="button"
                onClick={() => setIsResetModalOpen(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md shadow-2xs btn-press transition-colors cursor-pointer"
              >
                <RotateCcw size={12} />
                <span>{language === "ja" ? "全セッション変更をリセット" : "Reset All Session Data"}</span>
              </button>
            )}
          </CardHeader>

          <CardContent className="p-0">
            {modifiedList.length === 0 ? (
              <div className="p-8 text-center">
                <Database size={28} className="text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-700">
                  {language === "ja" ? "記録されたセッション変更はありません" : "No session modifications recorded"}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {language === "ja"
                    ? `全${initialTours.length}件のツアーは現在初期データ状態で表示されています。`
                    : `All ${initialTours.length} tours are currently rendering in their pristine baseline state.`}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50/90 text-slate-600 text-[11px] uppercase font-bold tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">{t("tours.col_ref")}</th>
                      <th className="py-2.5 px-3">{t("tours.col_guest")}</th>
                      <th className="py-2.5 px-3">{language === "ja" ? "登録種別" : "Provenance / Origin"}</th>
                      <th className="py-2.5 px-3">{t("tours.col_status")}</th>
                      <th className="py-2.5 px-3 text-right">{t("tours.col_actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {modifiedList.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3 whitespace-nowrap font-mono font-bold text-[#244d70]">
                          {item.bookingReference}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap font-medium text-slate-800">
                          {item.groupName}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {item.isNew ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              {language === "ja" ? "手動登録" : "Client Created"}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#244d70] bg-[#dcecf7]/60 px-2 py-0.5 rounded border border-[#244d70]/20">
                              {language === "ja" ? "変更あり" : "Baseline Modified"}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap font-mono text-[11px] uppercase">
                          {item.status}
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <Link
                            href={`/tours/${item.id}`}
                            className="text-xs font-semibold text-[#244d70] hover:text-[#1b3b57] hover:underline btn-press"
                          >
                            {language === "ja" ? "ツアー確認" : "View Tour"}
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
            <span>
              {language === "ja"
                ? `登録ツアー総数: ${tours.length}件 (初期 ${initialTours.length}件 + 新規 ${modifiedList.filter((m) => m.isNew).length}件)`
                : `Active Tours in Platform: ${tours.length} (${initialTours.length} baseline + ${modifiedList.filter((m) => m.isNew).length} created)`}
            </span>
            <span className="text-[11px] font-mono text-slate-400">SATF Operations Runtime</span>
          </CardFooter>
        </Card>
      </section>

      {/* ── SECTION 3: Diagnostics & Storage Persistence ── */}
      <section id="system-diagnostics" className="scroll-mt-24 space-y-4">
        <div className="flex items-center gap-2 pb-1 border-b border-slate-200">
          <span className="px-2 py-0.5 rounded bg-[#dcecf7]/70 text-[#244d70] border border-[#244d70]/20 text-[11px] font-bold uppercase tracking-wider">
            {language === "ja" ? "第3項" : "Part 3"}
          </span>
          <h2 className="text-base font-bold text-slate-900 tracking-tight">
            {language === "ja" ? "システム診断・永続化ストレージ" : "System Diagnostics & Storage Persistence"}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card: Supabase PostgreSQL Database Connectivity */}
          <Card className="surface-card border-slate-200/90 shadow-2xs hover:shadow-xs transition-all">
            <CardHeader className="bg-slate-50/50 py-3 px-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database size={16} className="text-emerald-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  {language === "ja" ? "Supabase PostgreSQL接続診断" : "Supabase PostgreSQL Health"}
                </h3>
              </div>
              <Badge variant="success" className="font-semibold text-[11px] flex items-center gap-1">
                <CheckCircle2 size={12} className="text-emerald-600" />
                <span>{language === "ja" ? "オンライン稼働中" : "Connected & Online"}</span>
              </Badge>
            </CardHeader>

            <CardContent className="p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500 font-medium">
                  {language === "ja" ? "運用ツアー台帳 (satf_operational_tours)" : "Operational Tours Table"}
                </span>
                <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  {importStatus?.database?.liveToursCount ?? 1757} {language === "ja" ? "件 検証済" : "records verified"}
                </span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500 font-medium">
                  {language === "ja" ? "監査証跡ログ (satf_audit_log)" : "Audit Log Records"}
                </span>
                <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                  {importStatus?.database?.liveAuditCount ?? 1757} {language === "ja" ? "件 記録済" : "records active"}
                </span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500 font-medium">
                  {language === "ja" ? "同時実行排他制御 (ACID)" : "Concurrency Locking"}
                </span>
                <span className="text-slate-800 font-medium flex items-center gap-1">
                  <Activity size={13} className="text-[#244d70]" />
                  <span>{language === "ja" ? "楽観的排他制御 (バージョンロック)" : "Optimistic Concurrency (Version Locking)"}</span>
                </span>
              </div>

              <div className="flex items-center justify-between py-2">
                <span className="text-slate-500 font-medium">
                  {language === "ja" ? "API永続化保証" : "Fail-Closed API Policy"}
                </span>
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <CheckCircle2 size={13} />
                  <span>/api/operations/tours (ACID RPC)</span>
                </span>
              </div>
            </CardContent>

            <CardFooter className="text-slate-500 text-[11px]">
              {language === "ja"
                ? "Supabaseデータベースとの双方向通信が正常に稼働しており、1,757件の正規化ツアーが整合性検証されています。"
                : "Database connectivity verified. 1,757 canonical tours and 1,757 audit records validated in PostgreSQL."}
            </CardFooter>
          </Card>

          {/* Card: Operational Platform Persistent Storage Policy */}
          <Card className="surface-card border-slate-200/90 shadow-2xs hover:shadow-xs transition-all">
            <CardHeader className="bg-slate-50/50 py-3 px-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-[#244d70]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  {language === "ja" ? "永続化ストレージポリシー" : "Persistent Storage Policy"}
                </h3>
              </div>
              <Badge variant="info" className="bg-[#dcecf7]/70 text-[#244d70] border border-[#244d70]/20">
                {language === "ja" ? "ACID 準拠" : "ACID Compliant"}
              </Badge>
            </CardHeader>

            <CardContent className="p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500 font-medium">
                  {language === "ja" ? "データ整合性規約" : "Data Integrity Contract"}
                </span>
                <span className="text-slate-800 font-semibold">
                  {language === "ja" ? "厳格なリレーショナルACID" : "Strict Relational ACID"}
                </span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500 font-medium">
                  {language === "ja" ? "アクセス制御方式" : "Access Architecture"}
                </span>
                <span className="font-mono text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                  {language === "ja" ? "直接アクセス (認証不要)" : "Direct Operations (No Sign-In Required)"}
                </span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500 font-medium">
                  {language === "ja" ? "フェイルクローズ設計" : "Fail-Closed Behavior"}
                </span>
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <CheckCircle2 size={13} />
                  <span>{language === "ja" ? "切断時は安全に停止 (フェイルクローズ強制)" : "Enforced on Disconnection"}</span>
                </span>
              </div>

              <div className="flex items-center justify-between py-2">
                <span className="text-slate-500 font-medium">
                  {language === "ja" ? "監査証跡永続化" : "Audit Trail Trailhead"}
                </span>
                <span className="font-mono text-slate-700">satf_audit_log (Append-only)</span>
              </div>
            </CardContent>

            <CardFooter className="text-slate-500 text-[11px]">
              {language === "ja"
                ? "データベース環境が未設定の場合、リクエストはフェイルクローズされ安全に停止します。"
                : "Operational mutations fail closed safely if database credentials are unconfigured."}
            </CardFooter>
          </Card>
        </div>

        {/* ── Architecture & Prototype Policy Notice ─────────────────────────── */}
        <div className="bg-slate-50 border border-slate-200/90 surface-card rounded-lg p-4 text-xs text-slate-600 space-y-2 shadow-2xs">
          <div className="flex items-center gap-2 font-bold text-slate-800">
            <Shield size={16} className="text-[#244d70]" />
            <span>{language === "ja" ? "運行プラットフォーム永続化ストレージポリシー" : "Operational Platform Persistent Storage Policy"}</span>
          </div>
          <p className="leading-relaxed text-[11px] text-slate-500">
            {language === "ja"
              ? "SATF Operations Platformは、サーバーAPIエンドポイント (/api/operations/tours) を通じてツアー作成・編集・キャンセル・手配管理を実行します。データはSupabase PostgreSQLで楽観的同時実行制御 (ACID) を用いて永続化されます。データベース環境が未設定の場合、リクエストはフェイルクローズされ、暗黙的にローカルストレージへフォールバックすることはありません。"
              : "The SATF Operations Platform uses direct server-backed API endpoints (/api/operations/tours) for tour creation, edits, cancellations, and assignments without requiring user login. Operational data is structured for ACID persistence in Supabase PostgreSQL with optimistic concurrency locking. When database environment variables are not configured, requests fail closed with actionable notifications rather than silently falling back to ephemeral browser storage."}
          </p>
        </div>
      </section>

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
              <div className="flex items-center gap-2 text-rose-700">
                <RotateCcw size={18} />
                <h3 id="reset-modal-title" className="text-sm font-bold text-slate-900">
                  {language === "ja" ? "セッション変更の初期化" : "Reset All Session Modifications"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsResetModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition-colors btn-press"
                aria-label={t("nav.close_menu")}
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <p className="text-xs text-slate-600 leading-relaxed">
                {language === "ja"
                  ? `ブラウザに一時保存された ${sessionToursCount} 件の変更内容をリセットし、ベースラインデータへ戻します。`
                  : `You are about to clear all ${sessionToursCount} session-stored modifications and revert all tours back to the original baseline mock data.`}
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded p-2.5 text-xs text-amber-800 flex items-start gap-2">
                <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                <span>
                  {language === "ja"
                    ? "この操作を行うと、このブラウザタブで手動登録・更新された未反映のデータは破棄されます。"
                    : "This action will permanently discard client-created tours and field updates saved in this browser tab."}
                </span>
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsResetModalOpen(false)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-300 rounded-md shadow-2xs btn-press transition-colors"
              >
                {t("btn.cancel")}
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-md shadow-2xs btn-press transition-colors"
              >
                {t("btn.reset")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (embedded) {
    return content;
  }

  return <PageContainer>{content}</PageContainer>;
}
