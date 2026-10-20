"use client";

import { Suspense } from "react";
import Image from "next/image";
import { TopNavBar } from "./TopNavBar";
import { Footer } from "./Footer";

function TopNavBarFallback() {
  return (
    <header className="sticky top-0 z-40 w-full h-16 bg-white/95 border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <Image
          src="/satf-logo.png"
          alt="SATF"
          width={36}
          height={36}
          className="h-9 w-auto max-h-9 object-contain"
        />
        <div className="flex flex-col">
          <span className="font-bold text-slate-900 text-sm tracking-tight leading-tight">SATF Operations</span>
          <span className="text-[10px] text-slate-500 font-medium leading-none">South Asia Tour Desk</span>
        </div>
      </div>
      <div className="w-5 h-5 border-2 border-slate-300 border-t-blue-700 rounded-full animate-spin" />
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50/70 text-slate-900">
      <Suspense fallback={<TopNavBarFallback />}>
        <TopNavBar />
      </Suspense>
      <main className="flex-1 w-full focus:outline-none">
        {children}
      </main>
      <Footer />
    </div>
  );
}

