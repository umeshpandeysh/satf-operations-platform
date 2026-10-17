"use client";

import { useState, Suspense } from "react";
import { Sidebar, Header } from "./Navigation";

function SidebarFallback() {
  return (
    <aside className="hidden lg:flex flex-col w-60 bg-white border-r border-slate-200">
      <div className="flex items-center gap-2 h-16 px-4 border-b border-slate-200 shrink-0">
        <div className="flex items-center justify-center w-8 h-8 rounded-md bg-blue-600 text-white text-xs font-bold shrink-0">
          ST
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900 leading-tight">SATF Ops</p>
          <p className="text-[10px] text-slate-400 leading-tight">South Asia Travel Factory</p>
        </div>
      </div>
    </aside>
  );
}

function HeaderFallback() {
  return (
    <header className="sticky top-0 z-20 h-16 flex items-center bg-white border-b border-slate-200 px-4 lg:px-6 shrink-0">
      <div className="flex-1 min-w-0">
        <h1 className="text-base font-semibold text-slate-900">SATF Operations Platform</h1>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
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
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
