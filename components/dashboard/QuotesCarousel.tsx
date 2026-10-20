"use client";

import React, { useState, useEffect } from "react";
import { Quote, ChevronLeft, ChevronRight, Compass } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

export function QuotesCarousel() {
  const { language } = useLanguage();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const quotes = [
    {
      key: "quote.one",
      en: "Great journeys are measured not just in miles covered, but in the seamless precision of every arrival and every welcome.",
      ja: "素晴らしい旅の価値は、巡った距離だけでなく、一つひとつの到着と温かな歓迎が完璧に整えられているかに宿る。",
    },
    {
      key: "quote.two",
      en: "True luxury in travel is invisible coordination: every driver in place, every guide prepared, and every guest cherished.",
      ja: "旅における真の贅沢とは、目に見えない完璧な連携である。定時に待つ車、熟練のガイド、そしてお客様への敬意。",
    },
    {
      key: "quote.three",
      en: "Behind every unforgettable sunset across the Subcontinent lies an unwavering dedication to safety, punctuality, and heartfelt care.",
      ja: "南アジアの雄大な夕景の記憶の傍らには、安全・定時運行・真心ある手配に全力を注ぐ専門チームが存在する。",
    },
  ];

  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % quotes.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [isPaused, quotes.length]);

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + quotes.length) % quotes.length);
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % quotes.length);
  };

  const currentQuote = quotes[currentIndex];

  return (
    <section
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#dcecf7]/40 via-white to-slate-50/80 border border-slate-200/80 p-6 sm:p-7 md:p-8 shadow-2xs transition-colors duration-200"
      aria-label="SATF Travel Philosophy"
    >
      {/* Subtle ambient motif */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-sky-100/30 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-100/20 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />

      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
        
        <div className="flex items-start gap-4 flex-1 min-w-0">
          {/* Elegant Quotation Mark Pill */}
          <div className="w-10 h-10 rounded-xl bg-white border border-[#b6d6eb]/80 shadow-2xs flex items-center justify-center shrink-0 text-[#244d70]">
            <Quote size={20} className="rotate-180 fill-[#dcecf7]/60" />
          </div>

          <div className="space-y-2 flex-1 min-w-0">
            {/* Header / Attribution Badge */}
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-white text-[#244d70] border border-[#b6d6eb]/80 shadow-2xs">
                <Compass size={12} className="text-[#244d70]" />
                {language === "ja" ? "SATF トラベル・フィロソフィー" : "SATF Travel Philosophy"}
              </span>
            </div>

            {/* Quotation Body with Gentle Fade */}
            <div className="min-h-[52px] sm:min-h-[46px] flex items-center">
              <blockquote
                key={currentIndex}
                className="text-sm sm:text-base font-normal text-[#172d43] leading-relaxed italic transition-opacity duration-300"
              >
                “{language === "ja" ? currentQuote.ja : currentQuote.en}”
              </blockquote>
            </div>

            {/* Neutral Attribution Label */}
            <p className="text-[11.5px] text-slate-500 font-medium">
              — {language === "ja" ? "SATF 運行管制哲学" : "SATF Operations & Field Philosophy"}
            </p>
          </div>
        </div>

        {/* Carousel Interactive Controls & Dots */}
        <div className="flex items-center gap-2.5 self-end md:self-center shrink-0 pt-2 md:pt-0">
          <div className="flex items-center gap-1.5 mr-1" role="tablist" aria-label="Quote carousel pagination">
            {quotes.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                className={`h-2 rounded-full transition-all duration-200 cursor-pointer ${
                  currentIndex === idx
                    ? "bg-[#244d70] w-6"
                    : "bg-slate-300 hover:bg-slate-400 w-2"
                }`}
                aria-label={`Go to quotation ${idx + 1}`}
                aria-selected={currentIndex === idx}
                role="tab"
              />
            ))}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handlePrev}
              className="p-1.5 text-slate-600 hover:text-[#172d43] bg-white hover:bg-slate-100 border border-slate-200/90 rounded-lg shadow-2xs transition-colors cursor-pointer btn-press"
              aria-label="Previous quotation"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="p-1.5 text-slate-600 hover:text-[#172d43] bg-white hover:bg-slate-100 border border-slate-200/90 rounded-lg shadow-2xs transition-colors cursor-pointer btn-press"
              aria-label="Next quotation"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

      </div>
    </section>
  );
}
