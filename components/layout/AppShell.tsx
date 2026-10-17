"use client";

import { useState, Suspense } from "react";
import { Sidebar, Header } from "./Navigation";

function SidebarFallback() {
  return (
    <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-slate-200/90 shrink-0">
      <div className="flex items-center gap-2.5 h-14 px-4 border-b border-slate-200/90 shrink-0 bg-slate-50/50">
        <div className="flex items-center justify-center w-7 h-7 rounded bg-blue-700 text-white text-[11px] font-bold tracking-wider shrink-0 shadow-xs">
          ST
        </div>
        <div>
          <p className="text-xs font-bold text-slate-900 leading-none">SATF Operations</p>
          <p className="text-[10px] text-slate-500 mt-0.5 leading-none">South Asia Travel Factory</p>
        </div>
      </div>
    </aside>
  );
}

function HeaderFallback() {
  return (
    <header className="sticky top-0 z-30 h-14 flex items-center bg-white border-b border-slate-200/90 px-4 sm:px-6 shrink-0">
      <div className="flex-1 min-w-0">
        <h1 className="text-xs sm:text-sm font-semibold text-slate-900">SATF Operations Command</h1>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Suspense fallback={<SidebarFallback />}>
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
      </Suspense>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Suspense fallback={<HeaderFallback />}>
          <Header onMenuToggle={() => setSidebarOpen((v) => !v)} />
        </Suspense>
        <main className="flex-1 overflow-y-auto bg-slate-50/60 focus:outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}
