"use client";

import React from "react";
import Image from "next/image";
import { ExternalLink } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

export function Footer() {
  const { language } = useLanguage();

  return (
    <footer className="mt-auto border-t border-slate-200/80 bg-[#f7fafc]/90 py-5 px-4 sm:px-6 lg:px-8 text-slate-500 text-xs transition-colors">
      <div className="max-w-[1580px] w-full mx-auto space-y-3.5">
        
        {/* Main Footer Row: Desktop Balanced / Mobile Stacked */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 text-center md:text-left">
          
          {/* Brand & Identification */}
          <div className="flex items-center gap-2.5">
            <div className="p-1 rounded-md bg-white border border-slate-200/90 shadow-2xs shrink-0">
              <Image
                src="/satf-logo.png"
                alt="SATF"
                width={28}
                height={20}
                className="h-5 w-auto object-contain"
              />
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2 text-xs">
              <span className="font-bold text-[#172d43] tracking-tight">
                {language === "ja"
                  ? "サウスアジア・トラベルファクトリー株式会社"
                  : "South Asia Travel Factory Pvt. Ltd."}
              </span>
              <span className="hidden sm:inline text-slate-300" aria-hidden="true">|</span>
              <span className="text-slate-500 text-[11.5px]">
                {language === "ja" ? "南アジア現地運行管制統括" : "South Asia Tour Operations Hub"}
              </span>
            </div>
          </div>

          {/* Regional Circuit Locations */}
          <div className="flex items-center justify-center gap-1.5 text-xs text-slate-600 font-medium tracking-normal">
            <span>New Delhi</span>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span>Agra</span>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span>Jaipur</span>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span>Varanasi</span>
          </div>

          {/* Partner Attribution Link */}
          <div className="flex items-center justify-center md:justify-end gap-1.5 text-xs">
            <span className="text-slate-400">
              {language === "ja" ? "提携パートナー:" : "In partnership with"}
            </span>
            <a
              href="https://stworld.jp/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[#244d70] hover:text-[#172d43] hover:underline font-semibold transition-colors"
              title="ST WORLD Japan Official Site"
            >
              <span>ST WORLD Japan (stworld.jp)</span>
              <ExternalLink size={11} className="shrink-0 text-[#244d70]" />
            </a>
          </div>

        </div>

        {/* Bottom Sub-row: Copyright & Integrity */}
        <div className="pt-2.5 border-t border-slate-200/70 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-400 text-center sm:text-left">
          <span>
            © 2026 South Asia Travel Factory Private Limited. All rights reserved.
          </span>
          <span className="font-mono text-[10.5px] text-slate-400">
            {language === "ja" ? "安全基準・法令遵守オペレーション" : "Operational Precision & Field Coordination"}
          </span>
        </div>

      </div>
    </footer>
  );
}
