"use client";

import React from "react";
import Link from "next/link";
import {
  Compass,
  Calendar,
  ShieldCheck,
  ChevronRight,
  ExternalLink,
  MapPin,
  CheckCircle2,
  Users,
  Activity,
  ArrowRight,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n";

export interface HeroSectionProps {
  toursCount?: number;
}

export function HeroSection({ toursCount = 1757 }: HeroSectionProps) {
  const { t, language } = useLanguage();

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#dcecf7]/50 via-white to-slate-50/80 border border-slate-200/80 shadow-2xs p-6 sm:p-8 lg:p-10 transition-all">
      
      {/* Route-line & Destination Connection SVG Motif */}
      <svg
        className="absolute top-0 right-0 w-full h-full max-w-xl opacity-30 pointer-events-none hidden md:block"
        viewBox="0 0 600 400"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M 50 180 C 150 120, 250 260, 380 160 S 520 220, 580 140"
          stroke="#244d70"
          strokeWidth="2"
          strokeDasharray="6 6"
          className="animate-pulse"
        />
        <circle cx="50" cy="180" r="5" fill="#244d70" />
        <circle cx="380" cy="160" r="5" fill="#244d70" />
        <circle cx="580" cy="140" r="5" fill="#172d43" />
      </svg>

      {/* Decorative ambient gradients */}
      <div
        className="absolute top-0 right-1/4 -mt-16 w-80 h-80 bg-sky-200/15 rounded-full blur-3xl pointer-events-none"
        aria-hidden="true"
      />
      <div
        className="absolute bottom-0 right-0 -mb-16 -mr-16 w-72 h-72 bg-blue-100/20 rounded-full blur-2xl pointer-events-none"
        aria-hidden="true"
      />

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        
        {/* Left Column: Positioning, Headline & Action Navigation */}
        <div className="lg:col-span-7 space-y-5">
          
          {/* Authentic Destination Management Pill */}
          <div className="inline-flex flex-wrap items-center gap-1.5 sm:gap-2 px-3 py-1.5 rounded-xl sm:rounded-full text-xs font-semibold bg-white border border-slate-200 text-slate-800 shadow-2xs max-w-full">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="text-[#172d43] font-bold">
              {language === "ja" ? "南アジア現地オペレーション本部" : "South Asia Travel Factory Pvt. Ltd."}
            </span>
            <span className="text-slate-300 hidden sm:inline">|</span>
            <a
              href="https://stworld.jp/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-slate-500 hover:text-[#244d70] hover:underline text-[11px]"
              title="Official ST WORLD Japan website"
            >
              <span>ST WORLD Japan Partner</span>
              <ExternalLink size={10} />
            </a>
          </div>

          {/* Headline with Clean Typography Hierarchy */}
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-[#172d43] leading-tight">
              {t("hero.title_line1")}{" "}
              <span className="text-[#244d70] underline decoration-[#b6d6eb] decoration-wavy decoration-1 underline-offset-4">
                {t("hero.title_line2")}
              </span>
            </h1>
            <p className="text-xs sm:text-sm lg:text-base text-slate-600 font-normal leading-relaxed max-w-2xl pt-1">
              {language === "ja"
                ? "株式会社エス・ティー・ワールド（ST WORLD）の現地運行管理拠点として、訪印ツアーにおける地上手配、公認ガイド・配車管理、および運行調整を統括しています。"
                : "India and South Asia inbound ground handling and operations hub associated with ST WORLD Japan. Comprehensive tour itinerary management, transport dispatch, and licensed guide coordination."}
            </p>
          </div>

          {/* Operational Metrics Pills (Real Database Records) */}
          <div className="flex items-center gap-2.5 flex-wrap pt-0.5 text-xs">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-200/90 shadow-2xs">
              <ShieldCheck size={15} className="text-emerald-600 shrink-0" />
              <span className="font-bold text-[#172d43] font-mono text-sm">
                {toursCount.toLocaleString()}
              </span>
              <span className="text-slate-600 font-medium">
                {language === "ja" ? "件の手配確定台帳 (Supabase連携)" : "Confirmed Operational Tours"}
              </span>
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-200/90 shadow-2xs">
              <CheckCircle2 size={15} className="text-[#244d70] shrink-0" />
              <span className="text-slate-700 font-medium">
                {language === "ja" ? "日本語対応ガイド常駐" : "Japanese-Speaking Guides"}
              </span>
            </div>
          </div>

          {/* Action Navigation Shortcuts */}
          <div className="flex items-center gap-2.5 sm:gap-3 pt-2 flex-wrap">
            <Link
              href="/tours"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-[13px] font-bold bg-[#244d70] hover:bg-[#1b3b57] text-white shadow-2xs hover:shadow-xs hover:-translate-y-0.5 transition-all btn-press"
            >
              <Compass size={15} className="text-white" />
              <span>{t("hero.open_tours")}</span>
              <ChevronRight size={14} />
            </Link>

            <Link
              href="/calendar"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-[13px] font-semibold bg-white hover:bg-slate-50 text-[#172d43] border border-slate-200 shadow-2xs hover:shadow-xs hover:-translate-y-0.5 transition-all btn-press"
            >
              <Calendar size={15} className="text-[#244d70]" />
              <span>{t("hero.open_calendar")}</span>
            </Link>

            <Link
              href="/assignments"
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs sm:text-[13px] font-semibold text-slate-600 hover:text-[#244d70] hover:bg-[#dcecf7]/50 transition-colors btn-press"
            >
              <Users size={14} className="text-slate-500" />
              <span>{t("nav.assignments")}</span>
              <ArrowRight size={12} />
            </Link>
          </div>

        </div>

        {/* Right Column: Editorial Operational Circuit Overview */}
        <div className="lg:col-span-5 relative">
          <div className="relative mx-auto max-w-sm lg:max-w-none space-y-3.5">
            
            {/* Primary Front Card: Active Circuit Dispatch */}
            <div className="rounded-xl bg-white border border-slate-200/85 shadow-2xs p-4 sm:p-5 space-y-3.5 transition-transform duration-200 hover:-translate-y-0.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity size={16} className="text-[#244d70]" />
                  <span className="text-xs font-bold text-[#172d43]">
                    {language === "ja" ? "主要周遊ルート運行状況" : "Primary Circuit Operations"}
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/90">
                  {language === "ja" ? "定刻運行中" : "On Schedule"}
                </span>
              </div>

              {/* Circuit Route Tags */}
              <div className="space-y-2">
                <div className="p-3 rounded-lg bg-slate-50/80 border border-slate-200/70 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-[#172d43]">
                    <span className="flex items-center gap-1">
                      <MapPin size={13} className="text-[#244d70]" />
                      <span>{t("common.golden_triangle")}</span>
                    </span>
                    <span className="font-mono text-slate-500 text-[11px]">DEL · AGR · JAI</span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {language === "ja"
                      ? "デリー、タージマハル（アーグラ）、ピンクシティ（ジャイプル）のホテル・専用車・日本語ガイド配車。"
                      : "Daily coordinated airport greeting, heritage monument entry, private transport, and boutique hotel check-in."}
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-slate-50/80 border border-slate-200/70 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-[#172d43]">
                    <span className="flex items-center gap-1">
                      <MapPin size={13} className="text-[#244d70]" />
                      <span>{t("common.holy_ganges")}</span>
                    </span>
                    <span className="font-mono text-slate-500 text-[11px]">VNS</span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {language === "ja"
                      ? "ガンジス川早朝ボートクルーズおよびブッダ初転法輪の地サルナート観光の手配。"
                      : "Morning Ganges sunrise cruise coordination and Sarnath Buddhist heritage excursions."}
                  </p>
                </div>
              </div>

              {/* Bottom bar inside front card */}
              <div className="flex items-center justify-between pt-1 text-[11px] border-t border-slate-100 text-slate-500">
                <span>{t("common.ops_desk")}</span>
                <span className="font-mono text-[#244d70] font-semibold">{t("common.active_dispatch")}</span>
              </div>
            </div>

            {/* Secondary Mid-layer Card: Company & Association (Clean Light Surface) */}
            <div className="rounded-xl bg-white text-slate-800 p-4 shadow-2xs border border-slate-200/85 flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                  {language === "ja" ? "現地運営法人" : "Operating Organization"}
                </p>
                <p className="text-xs font-bold text-[#172d43]">
                  South Asia Travel Factory Pvt. Ltd.
                </p>
                <p className="text-[11px] text-[#244d70] font-medium">
                  {t("common.parent_company")}
                </p>
              </div>

              <a
                href="https://stworld.jp/"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg bg-[#dcecf7]/70 hover:bg-[#dcecf7] text-[#244d70] text-xs font-semibold border border-[#b6d6eb]/80 transition-colors shrink-0 flex items-center gap-1 btn-press"
              >
                <span>stworld.jp</span>
                <ExternalLink size={11} />
              </a>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}

