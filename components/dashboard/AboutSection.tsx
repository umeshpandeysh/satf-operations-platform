"use client";

import React from "react";
import { Compass, MapPin, Globe, Headphones, ExternalLink } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

export function AboutSection() {
  const { t, language } = useLanguage();

  return (
    <section className="mt-10 pt-8 border-t border-slate-200/90 space-y-6" aria-label="About SATF">
      
      {/* Header */}
      <div className="max-w-3xl space-y-2">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
          <Compass size={12} />
          <span>{t("common.inbound_mgmt")}</span>
        </div>
        <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
          South Asia Travel Factory Private Limited
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-normal">
          {language === "ja"
            ? "株式会社エス・ティー・ワールド（ST WORLD）と連携するインド現地手配専門会社です。ツアー運行管理、ホテル手配、日本語対応公認ガイド、専属車両・ドライバーの手配を行い、南アジア全域で高品質な日本人旅行者向けインバウンド手配を提供しています。"
            : "India-based ground operations company associated with Japanese travel company ST WORLD (stworld.jp). Specialized in comprehensive tour ground handling, hotel coordination, licensed guides, fleet transport, and bespoke Japanese-tourist operations across South Asia."}
        </p>
      </div>

      {/* Narrative & Parent Company Box */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs sm:text-sm text-slate-600 leading-relaxed">
        <div className="p-4 sm:p-5 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
            {language === "ja" ? "現地運行管理・手配機能" : "Ground Handling & Tour Operations"}
          </h3>
          <p>
            {language === "ja"
              ? "デリー、アーグラ、ジャイプル（ゴールデントライアングル）およびバラナシ、南インドなどの各周遊ルートにおいて、空港送迎、ホテルチェックイン、観光スケジュール、移動手配を統合管理しています。"
              : "Managing complete end-to-end circuit logistics across the Golden Triangle (Delhi, Agra, Jaipur), Varanasi, and regional circuits, coordinating airport transfers, hotel vouchers, and seamless daily itinerary dispatch."}
          </p>
        </div>

        <div className="p-4 sm:p-5 rounded-xl bg-slate-50 border border-slate-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              {language === "ja" ? "日本側パートナー（親会社）" : "Associated Parent Company"}
            </h3>
            <a
              href="https://stworld.jp/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-semibold text-blue-700 hover:underline inline-flex items-center gap-1"
            >
              <span>stworld.jp</span>
              <ExternalLink size={11} />
            </a>
          </div>
          <p>
            {language === "ja"
              ? "日本の旅行会社「株式会社エス・ティー・ワールド」（ST WORLD）の公式現地運行パートナーとして、日本のお客様の品質基準に合わせた細やかな配慮とおもてなしを実践しています。"
              : "Operating in direct operational coordination with ST WORLD (Tokyo, Japan), fulfilling tailored Japanese hospitality standards, prompt itinerary updates, and responsive coordinator communication."}
          </p>
        </div>
      </div>

      {/* 3 Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        <div className="p-4 sm:p-5 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-2 hover:shadow-xs transition-shadow">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
            <MapPin size={17} />
          </div>
          <h4 className="text-xs font-bold text-slate-900">
            {language === "ja" ? "主要観光地での地上手配" : "Dedicated Circuit Logistics"}
          </h4>
          <p className="text-xs text-slate-500 leading-relaxed">
            {language === "ja"
              ? "主要ホテル、観光箇所入場、国内交通、列車・送迎をワンストップで事前確定・確認。"
              : "Confirmed hotel bookings, heritage monument entries, and seamless domestic transfers across key circuits."}
          </p>
        </div>

        <div className="p-4 sm:p-5 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-2 hover:shadow-xs transition-shadow">
          <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center font-bold">
            <Globe size={17} />
          </div>
          <h4 className="text-xs font-bold text-slate-900">
            {language === "ja" ? "日本語対応スタッフ・公認ガイド" : "Japanese-Speaking Guides"}
          </h4>
          <p className="text-xs text-slate-500 leading-relaxed">
            {language === "ja"
              ? "政府公認の外国語ガイドおよび日本語対応ツアーコーディネーターによる安心の同伴案内。"
              : "Licensed government tour guides and dedicated Japanese-speaking personnel for traveler comfort."}
          </p>
        </div>

        <div className="p-4 sm:p-5 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-2 hover:shadow-xs transition-shadow">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
            <Headphones size={17} />
          </div>
          <h4 className="text-xs font-bold text-slate-900">
            {language === "ja" ? "安全運行・専属ドライバー" : "Verified Fleet & Safety"}
          </h4>
          <p className="text-xs text-slate-500 leading-relaxed">
            {language === "ja"
              ? "厳選された専用車、経験豊富な専属ドライバー、24時間の運行安全モニタリング体制。"
              : "Vetted chauffeur fleet, private air-conditioned vehicles, and continuous coordinator safety dispatch."}
          </p>
        </div>

      </div>

      {/* Enterprise Platform Footer */}
      <footer className="pt-6 pb-2 border-t border-slate-200 text-xs text-slate-500 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-700">
            {t("footer.rights")}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {t("footer.internal_use")}
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-500 font-mono">
          <span>Asia/Kolkata (UTC+5:30)</span>
          <span>·</span>
          <span>Next.js 16 (App Router)</span>
        </div>
      </footer>

    </section>
  );
}
