"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Inbox,
  Mail,
  Filter,
  Search,
  ExternalLink,
  RefreshCw,
  X,
  ChevronLeft,
  ChevronRight,
  Check,
  UserCheck,
  Sparkles,
} from "lucide-react";
import { PageContainer, Card, CardHeader, CardContent } from "@/components/ui/Primitives";
import { cn } from "@/components/ui/utils";
import { useLanguage } from "@/lib/i18n";
import type { ClientEmailIssue, EmailGatewayStatus, IssueStatus, IssuePriority } from "@/lib/email-issues";
import { formatDateShort } from "@/lib/utils";

export const SAMPLE_DEMO_ISSUES: ClientEmailIssue[] = [
  {
    id: "demo-issue-01",
    senderName: "Kenji Sato (ST WORLD Tokyo HQ)",
    senderEmail: "k.sato@stworld.jp",
    subject: "URGENT: Flight JL749 Delayed Arrival — Transfer Reschedule Required",
    receivedAt: "2026-10-20T08:15:00+05:30",
    status: "in_progress",
    priority: "urgent",
    assignedCoordinator: "Arun Sharma (Delhi Dispatch)",
    bookingReference: "SATF-35687",
    tourId: "SATF-35687",
    category: "flight_delay",
    tags: ["flight_delay", "urgent", "delhi_airport"],
    bodySnippet: "Flight JL749 from Tokyo Narita has been rescheduled to arrive at IGI T3 at 20:45 IST instead of 18:00. Please ensure chauffeur and Japanese-speaking guide are informed.",
    fullBody: "Flight JL749 (NRT -> DEL) carrying Mr. & Mrs. Hayashi (Booking Ref: SATF-35687) has suffered a 2-hour-45-minute air traffic delay out of Narita.\n\nCurrent revised landing ETA at Delhi IGI Airport Terminal 3 is 20:45 IST.\n\nAction Required:\n1. Reschedule airport representative and chauffeur pickup timing to 20:40 IST at Gate 5.\n2. Alert Delhi hotel (The Claridges) for late check-in notice.\n3. Japanese-speaking guide Mr. Joshi to greet party after customs clearance.",
  },
  {
    id: "demo-issue-02",
    senderName: "Yuki Tanaka (Guest)",
    senderEmail: "yuki.tanaka.traveler@sample.jp",
    subject: "Agra Hotel AC & Room Preference Clarification",
    receivedAt: "2026-10-19T17:40:00+05:30",
    status: "open",
    priority: "high",
    assignedCoordinator: "Pooja Verma",
    bookingReference: "SATF-35690",
    tourId: "SATF-35690",
    category: "hotel_change",
    tags: ["hotel_change", "ac_maintenance", "agra"],
    bodySnippet: "Guest reported that the air conditioning unit in Room 314 at Taj View Agra is blowing warm air. Requesting room change or immediate engineering inspection.",
    fullBody: "Hello SATF Guide team,\n\nWe checked into Taj View Agra this afternoon. The room air conditioner in Room 314 is not cooling properly and is making a loud buzzing sound.\n\nOur tour guide mentioned we could email your central operations desk. Could you kindly coordinate with the hotel duty manager to either move us to a quiet room or service the unit before tonight?\n\nThank you for your prompt assistance!\n\nYuki Tanaka\nGroup Booking: SATF-35690",
  },
  {
    id: "demo-issue-03",
    senderName: "Megumi Nakamura (ST WORLD Customer Care)",
    senderEmail: "m.nakamura@stworld.jp",
    subject: "Special Dietary Preference (Strict Vegetarian / Jain) for Varanasi Segment",
    receivedAt: "2026-10-19T14:20:00+05:30",
    status: "open",
    priority: "medium",
    assignedCoordinator: undefined,
    bookingReference: "SATF-35712",
    tourId: "SATF-35712",
    category: "general_inquiry",
    tags: ["dietary", "varanasi", "meals"],
    bodySnippet: "Pax request strictly vegetarian meals with no onion/garlic during their 2-day stay in Varanasi (Brijrama Palace). Guide briefing required.",
    fullBody: "Greetings SATF Dispatch,\n\nPlease note an important meal restriction for Booking SATF-35712 (4 pax arriving in Varanasi on October 22nd):\n\n2 pax are strict vegetarians and prefer Jain preparations (no root vegetables, no garlic/onion).\nThe other 2 pax take standard Japanese/continental vegetarian breakfast and mild curries.\n\nPlease coordinate with Brijrama Palace and designated guide Rajesh Mishra.",
  },
  {
    id: "demo-issue-04",
    senderName: "Taro Takahashi (Tour Leader)",
    senderEmail: "t.takahashi@tourleader.jp",
    subject: "Jaipur Amber Fort Jeep vs. Elephant Upgrade Confirmation",
    receivedAt: "2026-10-18T19:30:00+05:30",
    status: "resolved",
    priority: "low",
    assignedCoordinator: "Arun Sharma (Delhi Dispatch)",
    bookingReference: "SATF-35688",
    tourId: "SATF-35688",
    category: "guide_request",
    tags: ["jaipur", "amber_fort", "jeep_transfer"],
    bodySnippet: "All 6 passengers confirmed preference for private 4x4 AC jeep ascent to Amber Fort instead of elephant ride for animal welfare reasons.",
    fullBody: "Good evening,\n\nFollowing up on the Amber Fort excursion scheduled for tomorrow in Jaipur:\nAll 6 guests have confirmed they prefer the sanitized 4x4 Jeep transfer up the ramparts rather than elephant ride, in accordance with ST WORLD responsible tourism guidelines.\n\nLocal guide Mr. Dinesh Sharma has been informed and vouchers are validated.\nStatus: Resolved and confirmed.",
  },
  {
    id: "demo-issue-05",
    senderName: "Ayumi Kobayashi",
    senderEmail: "a.kobayashi@voyage-tokyo.jp",
    subject: "Vehicle Coach Wi-Fi & Recharging Port Inspection Request",
    receivedAt: "2026-10-18T11:05:00+05:30",
    status: "waiting_client",
    priority: "medium",
    assignedCoordinator: "Vikram Singh (Fleet Manager)",
    bookingReference: "SATF-35705",
    tourId: "SATF-35705",
    category: "complaint",
    tags: ["vehicle", "wifi", "comfort"],
    bodySnippet: "Tempo Traveller onboard Wi-Fi hotspot showed weak signal on Delhi-Jaipur highway. Fleet manager dispatched mobile router replacement at mid-way halt.",
    fullBody: "Dear Operations,\n\nDuring yesterday's drive from Delhi to Jaipur on the Express Highway, guests noticed intermittent Wi-Fi connectivity on Tempo Traveller DL-1VB-8921.\n\nFleet Manager Vikram arranged for an alternate Airtel high-gain 5G dongle to be handed over at Behror mid-way restaurant. We are waiting for the group leader's confirmation that signal quality is satisfactory today.",
  },
  {
    id: "demo-issue-06",
    senderName: "Ryo Ishikawa (ST WORLD Inbound Agency)",
    senderEmail: "r.ishikawa@stworld.jp",
    subject: "Taj Mahal Sunrise Monument Voucher QR Re-issuance",
    receivedAt: "2026-10-17T16:10:00+05:30",
    status: "resolved",
    priority: "urgent",
    assignedCoordinator: "Pooja Verma",
    bookingReference: "SATF-35689",
    tourId: "SATF-35689",
    category: "general_inquiry",
    tags: ["asi_tickets", "taj_mahal", "vouchers"],
    bodySnippet: "ASI portal voucher QR barcode reprinted and handed to licensed Agra guide for 05:45 AM sunrise entry. Successfully entered without queue delays.",
    fullBody: "High Priority Notice:\n\nThe ASI e-ticket barcode for Taj Mahal sunrise entry on Booking SATF-35689 experienced an encoding glitch on passenger #2 passport verification.\n\nSATF Agra liaison office re-issued the corrected PDF voucher directly with the Archeological Survey of India counter and WhatsApped the printable voucher to Guide Mr. Joshi.\n\nGuests entered safely at 05:45 AM. Ticket problem resolved.",
  },
];

export interface ClientIssuesViewProps {
  initialGateway?: EmailGatewayStatus;
  initialIssues?: ClientEmailIssue[];
}

export function ClientIssuesView({ initialIssues = [] }: ClientIssuesViewProps) {
  const { t, language } = useLanguage();
  const [issues, setIssues] = useState<ClientEmailIssue[]>(() => {
    return initialIssues.length > 0 ? initialIssues : SAMPLE_DEMO_ISSUES;
  });
  const [statusFilter, setStatusFilter] = useState<IssueStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<IssuePriority | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIssue, setSelectedIssue] = useState<ClientEmailIssue | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Local-only coordinator overrides (status, assignedCoordinator)
  const [localOverrides, setLocalOverrides] = useState<
    Record<string, { status?: IssueStatus; assignedCoordinator?: string }>
  >(() => {
    if (typeof window === "undefined") return {};
    try {
      const cached = localStorage.getItem("satf_issues_local_overrides");
      return cached ? JSON.parse(cached) : {};
    } catch {
      return {};
    }
  });

  // Ephemeral editing state for selected issue in modal
  const [editStatus, setEditStatus] = useState<IssueStatus>("open");
  const [editCoordinator, setEditCoordinator] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleOpenIssue = (issue: ClientEmailIssue) => {
    const currentOverride = localOverrides[issue.id];
    setEditStatus(currentOverride?.status || issue.status);
    setEditCoordinator(currentOverride?.assignedCoordinator || issue.assignedCoordinator || "");
    setSaveSuccess(false);
    setSelectedIssue(issue);
  };

  const handleSaveIssueOverrides = (issueId: string) => {
    const updated = {
      ...localOverrides,
      [issueId]: {
        status: editStatus,
        assignedCoordinator: editCoordinator.trim() || undefined,
      },
    };
    setLocalOverrides(updated);
    try {
      localStorage.setItem("satf_issues_local_overrides", JSON.stringify(updated));
    } catch {}
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  // Reset demo session overrides to default state
  const handleResetDemoData = () => {
    setLocalOverrides({});
    try {
      localStorage.removeItem("satf_issues_local_overrides");
    } catch {}
    setIssues(SAMPLE_DEMO_ISSUES);
  };

  // Poll or refresh demo messages
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/issues?page=${currentPage}&pageSize=${pageSize}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.issues) && data.issues.length > 0) {
          setIssues(data.issues);
        } else {
          setIssues(SAMPLE_DEMO_ISSUES);
        }
      }
    } catch {
      // Retain current demo issues on network error
    } finally {
      setIsRefreshing(false);
    }
  };

  // Apply local coordinator overrides to display
  const effectiveIssues = useMemo(() => {
    return issues.map((item) => {
      const override = localOverrides[item.id];
      if (!override) return item;
      return {
        ...item,
        status: override.status ?? item.status,
        assignedCoordinator: override.assignedCoordinator ?? item.assignedCoordinator,
      };
    });
  }, [issues, localOverrides]);

  const filteredIssues = useMemo(() => {
    return effectiveIssues.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (priorityFilter !== "all" && item.priority !== priorityFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          item.subject.toLowerCase().includes(q) ||
          item.senderName.toLowerCase().includes(q) ||
          item.senderEmail.toLowerCase().includes(q) ||
          (item.bookingReference && item.bookingReference.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [effectiveIssues, statusFilter, priorityFilter, searchQuery]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredIssues.length / pageSize) || 1;
  const paginatedIssues = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredIssues.slice(start, start + pageSize);
  }, [filteredIssues, currentPage, pageSize]);

  return (
    <PageContainer className="space-y-6">
      
      {/* ── Page Header ──────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              {language === "ja" ? "顧客クレーム・問い合わせ" : "Client Complaints & Inquiries"}
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            {language === "ja"
              ? "フライト遅延通報、ホテル要望、緊急問い合わせおよび現地対応管理。"
              : "Flight delay notices, hotel requests, and coordinator inquiries management."}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {Object.keys(localOverrides).length > 0 && (
            <button
              type="button"
              onClick={handleResetDemoData}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 hover:text-rose-600 shadow-2xs btn-press transition-colors cursor-pointer"
            >
              <span>{language === "ja" ? "変更リセット" : "Reset Changes"}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 shadow-2xs btn-press transition-colors cursor-pointer"
          >
            <RefreshCw size={13} className={cn(isRefreshing && "animate-spin text-[#244d70]")} />
            <span>{t("btn.refresh")}</span>
          </button>
        </div>
      </div>

      {/* ── Quick KPI Stat Cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white surface-card rounded-xl border border-slate-200/90 p-4 shadow-2xs hover:shadow-xs transition-all">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            {language === "ja" ? "総案件数" : "Total Inquiries"}
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold font-mono text-[#172d43]">{effectiveIssues.length}</span>
            <span className="text-[10px] text-slate-400">{language === "ja" ? "件" : "records"}</span>
          </div>
        </div>

        <div className="bg-amber-50/40 rounded-xl border border-amber-200/90 p-4 shadow-2xs hover:shadow-xs transition-all">
          <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider block">
            {language === "ja" ? "新規受付 (未着手)" : "Open (Unassigned)"}
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold font-mono text-amber-800">
              {effectiveIssues.filter(i => i.status === "open").length}
            </span>
            <span className="text-[10px] text-amber-600 font-medium">
              {language === "ja" ? "要対応" : "requires action"}
            </span>
          </div>
        </div>

        <div className="bg-[#dcecf7]/30 rounded-xl border border-[#244d70]/20 p-4 shadow-2xs hover:shadow-xs transition-all">
          <span className="text-[11px] font-semibold text-[#244d70] uppercase tracking-wider block">
            {language === "ja" ? "対応中" : "In Progress"}
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold font-mono text-[#172d43]">
              {effectiveIssues.filter(i => i.status === "in_progress").length}
            </span>
            <span className="text-[10px] text-[#244d70] font-medium">
              {language === "ja" ? "担当アサイン済" : "with coordinator"}
            </span>
          </div>
        </div>

        <div className="bg-rose-50/40 rounded-xl border border-rose-200/90 p-4 shadow-2xs hover:shadow-xs transition-all">
          <span className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider block">
            {language === "ja" ? "至急対応" : "Urgent Priority"}
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold font-mono text-rose-800">
              {effectiveIssues.filter(i => i.priority === "urgent").length}
            </span>
            <span className="text-[10px] text-rose-600 font-medium">
              {language === "ja" ? "即時対応要" : "immediate attention"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Filters & Search Ribbon ──────────────────────────────────── */}
      <div className="bg-white surface-card border border-slate-200/90 rounded-xl p-3.5 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        
        {/* Status Filters */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold text-slate-500 mr-1 flex items-center gap-1">
            <Filter size={13} className="text-[#244d70]" />
            <span>{language === "ja" ? "ステータス:" : "Status:"}</span>
          </span>

          {(["all", "open", "in_progress", "waiting_client", "resolved"] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => {
                setStatusFilter(st);
                setCurrentPage(1);
              }}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer btn-press",
                statusFilter === st
                  ? "bg-[#244d70] text-white shadow-2xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
              )}
            >
              {st === "all"
                ? t("issues.all_issues")
                : st === "open"
                ? t("issues.status_open")
                : st === "in_progress"
                ? t("issues.status_in_progress")
                : st === "waiting_client"
                ? t("issues.status_waiting")
                : t("issues.status_resolved")}
            </button>
          ))}
        </div>

        {/* Priority Filter & Search */}
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={priorityFilter}
            onChange={(e) => {
              setPriorityFilter(e.target.value as IssuePriority | "all");
              setCurrentPage(1);
            }}
            className="text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#244d70]/20 focus:border-[#244d70]"
          >
            <option value="all">{t("issues.all_priorities")}</option>
            <option value="urgent">{t("issues.priority_urgent")}</option>
            <option value="high">{t("issues.priority_high")}</option>
            <option value="medium">{t("issues.priority_medium")}</option>
            <option value="low">{t("issues.priority_low")}</option>
          </select>

          <div className="relative min-w-[220px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder={t("issues.search_placeholder")}
              className="w-full text-xs pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#244d70]/20 focus:border-[#244d70]"
            />
          </div>
        </div>

      </div>

      {/* ── Inbox Table / Empty State ────────────────────────────────── */}
      <Card className="overflow-hidden surface-card border-slate-200/90 shadow-2xs">
        <CardHeader className="bg-slate-50/60 border-b border-slate-200/80">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2 font-bold text-slate-900 text-xs">
              <Mail size={15} className="text-[#244d70]" />
              <span>{t("issues.inbox_title")} ({filteredIssues.length})</span>
            </div>
            {Object.keys(localOverrides).length > 0 && (
              <span className="text-[10px] font-medium bg-[#dcecf7]/70 text-[#244d70] px-2 py-0.5 rounded border border-[#244d70]/20">
                {Object.keys(localOverrides).length} {t("issues.session_edits_active")}
              </span>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {filteredIssues.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 text-slate-400 flex items-center justify-center mx-auto">
                <Inbox size={22} />
              </div>
              <h3 className="text-sm font-bold text-slate-800">
                {t("issues.empty_inbox")}
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                {t("issues.empty_desc")}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {paginatedIssues.map((issue) => (
                <div
                  key={issue.id}
                  onClick={() => handleOpenIssue(issue)}
                  className="p-4 hover:bg-slate-50/90 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-xs text-slate-900 group-hover:text-[#244d70] transition-colors truncate">
                        {issue.subject}
                      </span>
                      {issue.bookingReference && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-[#dcecf7]/70 text-[#244d70] border border-[#244d70]/20">
                          {issue.bookingReference}
                        </span>
                      )}
                      <span className={cn(
                        "px-1.5 py-0.2 rounded text-[10px] font-bold uppercase",
                        issue.priority === "urgent" ? "bg-rose-50 text-rose-800 border border-rose-200" :
                        issue.priority === "high" ? "bg-amber-50 text-amber-800 border border-amber-200" :
                        "bg-slate-100 text-slate-700"
                      )}>
                        {issue.priority}
                      </span>
                      <span className={cn(
                        "px-1.5 py-0.2 rounded text-[10px] font-medium uppercase",
                        issue.status === "open" ? "bg-blue-50 text-blue-800 border border-blue-200" :
                        issue.status === "in_progress" ? "bg-purple-50 text-purple-800 border border-purple-200" :
                        issue.status === "waiting_client" ? "bg-amber-50 text-amber-800 border border-amber-200" :
                        "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      )}>
                        {issue.status}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 truncate">
                      {issue.senderName} &lt;{issue.senderEmail}&gt; · {issue.bodySnippet}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 text-xs">
                    {issue.assignedCoordinator && (
                      <span className="text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded flex items-center gap-1 font-medium">
                        <UserCheck size={11} className="text-[#244d70]" />
                        {issue.assignedCoordinator}
                      </span>
                    )}
                    <span className="text-[11px] text-slate-400 font-mono">
                      {formatDateShort(issue.receivedAt)}
                    </span>
                    <button
                      type="button"
                      className="px-2.5 py-1 rounded bg-slate-100 group-hover:bg-[#dcecf7]/50 group-hover:text-[#244d70] text-slate-700 font-semibold text-xs btn-press transition-colors"
                    >
                      {t("btn.details")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination bar */}
          {totalPages > 1 && (
            <div className="p-3 bg-slate-50/60 border-t border-slate-200/80 flex items-center justify-between text-xs text-slate-600">
              <span className="text-[11px]">
                {t("issues.page_showing")} <strong className="text-slate-900">{currentPage}</strong> {t("issues.page_of")} <strong className="text-slate-900">{totalPages}</strong>
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Issue Detail Modal ───────────────────────────────────────── */}
      {selectedIssue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 leading-tight">
                  {selectedIssue.subject}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {language === "ja" ? "送信者: " : "From: "} {selectedIssue.senderName} ({selectedIssue.senderEmail})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedIssue(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-700">{t("issues.modal_category")}:</span>
                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold uppercase text-[10px]">
                  {selectedIssue.category}
                </span>

                <span className="font-semibold text-slate-700 ml-2">{t("issues.modal_priority")}:</span>
                <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 font-bold uppercase text-[10px] border border-amber-200">
                  {selectedIssue.priority}
                </span>

                {selectedIssue.bookingReference && (
                  <>
                    <span className="font-semibold text-slate-700 ml-2">{t("issues.modal_linked_tour")}:</span>
                    <Link
                      href={`/tours/${selectedIssue.tourId || selectedIssue.bookingReference}`}
                      className="text-[#244d70] hover:underline font-mono font-bold flex items-center gap-1"
                    >
                      <span>{selectedIssue.bookingReference}</span>
                      <ExternalLink size={11} />
                    </Link>
                  </>
                )}
              </div>

              {/* Message snippet and text */}
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 leading-relaxed font-sans whitespace-pre-wrap max-h-52 overflow-y-auto">
                {selectedIssue.fullBody || selectedIssue.bodySnippet}
              </div>

              {/* Coordinator Operations Management */}
              <div className="p-3 bg-slate-50/80 border border-slate-200 rounded-lg space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-xs">{t("issues.modal_mgmt_title")}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">{t("issues.modal_status_label")}</label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as IssueStatus)}
                      className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-medium focus:ring-2 focus:ring-[#244d70]/20 focus:border-[#244d70]"
                    >
                      <option value="open">{t("issues.status_open")}</option>
                      <option value="in_progress">{t("issues.status_in_progress")}</option>
                      <option value="waiting_client">{t("issues.status_waiting")}</option>
                      <option value="resolved">{t("issues.status_resolved")}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">{t("issues.modal_coordinator_label")}</label>
                    <input
                      type="text"
                      value={editCoordinator}
                      onChange={(e) => setEditCoordinator(e.target.value)}
                      placeholder={t("issues.modal_coordinator_placeholder")}
                      className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs focus:ring-2 focus:ring-[#244d70]/20 focus:border-[#244d70]"
                    >
                    </input>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-slate-400">
                    {t("issues.modal_persistence_note")}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSaveIssueOverrides(selectedIssue.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#244d70] hover:bg-[#1b3b57] text-white rounded text-xs font-semibold shadow-2xs btn-press transition-colors cursor-pointer"
                  >
                    {saveSuccess ? <Check size={12} className="text-emerald-300" /> : <Sparkles size={12} />}
                    <span>{saveSuccess ? t("issues.modal_saved") : t("issues.modal_save")}</span>
                  </button>
                </div>
              </div>

            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedIssue(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-lg btn-press"
              >
                {t("btn.close")}
              </button>
            </div>

          </div>
        </div>
      )}

    </PageContainer>
  );
}
