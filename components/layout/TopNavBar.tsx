"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Compass,
  Calendar,
  Users,
  Inbox,
  BarChart3,
  Settings,
  Menu,
  X,
  KeyRound,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import { cn } from "@/components/ui/utils";
import { useLanguage } from "@/lib/i18n";
import { StaffAuthModal } from "@/components/auth/StaffAuthModal";

export interface NavItem {
  id: string;
  labelKey: string;
  defaultLabel: string;
  href: string;
  icon: React.ElementType;
}

// Primary navigation visible directly on desktop (1024px+)
export const PRIMARY_NAV_ITEMS: NavItem[] = [
  {
    id: "dashboard",
    labelKey: "nav.dashboard",
    defaultLabel: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    id: "tours",
    labelKey: "nav.tours",
    defaultLabel: "Tours Roster",
    href: "/tours",
    icon: Compass,
  },
  {
    id: "assignments",
    labelKey: "nav.assignments",
    defaultLabel: "Fleet & Guides",
    href: "/assignments",
    icon: Users,
  },
  {
    id: "calendar",
    labelKey: "nav.calendar",
    defaultLabel: "Calendar",
    href: "/calendar",
    icon: Calendar,
  },
  {
    id: "issues",
    labelKey: "nav.issues",
    defaultLabel: "Client Issues",
    href: "/issues",
    icon: Inbox,
  },
  {
    id: "analytics",
    labelKey: "nav.reports",
    defaultLabel: "Analytics",
    href: "/reports",
    icon: BarChart3,
  },
  {
    id: "settings",
    labelKey: "nav.settings",
    defaultLabel: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

// Secondary items (empty, all items rendered directly)
export const MORE_NAV_ITEMS: NavItem[] = [];

export const TOP_NAV_ITEMS: NavItem[] = [
  ...PRIMARY_NAV_ITEMS,
];

export function TopNavBar() {
  const pathname = usePathname();
  const { language, setLanguage, t } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [session, setSession] = useState<{
    authenticated: boolean;
    operator?: string;
    role?: string;
  }>({ authenticated: false });

  // Close menus on path navigation
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setMobileMenuOpen(false);
    setUserMenuOpen(false);
  }

  useEffect(() => {
    let mounted = true;
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => {
        if (mounted && data?.authenticated) {
          setSession({
            authenticated: true,
            operator: data.operator,
            role: data.role,
          });
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  function handleAuthSuccess(info: { operator: string; role?: string }) {
    setSession({ authenticated: true, operator: info.operator, role: info.role });
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("satf-session-change", { detail: info }));
      window.location.reload();
    }
  }

  async function handleLogout() {
    setUserMenuOpen(false);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    setSession({ authenticated: false });
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("satf-session-change", { detail: { authenticated: false } }));
      window.location.reload();
    }
  }

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-white/98 backdrop-blur-md border-b border-slate-200/90 shadow-2xs transition-all duration-200">
        <div className="max-w-[1580px] w-full mx-auto px-3 sm:px-6 lg:px-6 xl:px-8 2xl:px-10">
          <div className="flex items-center justify-between h-16 gap-1.5 sm:gap-3">
            
            {/* Left: Clean Brand Identity */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0 min-w-0">
              <Link
                href="/"
                className="flex items-center gap-2 sm:gap-2.5 group focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-lg p-0.5 sm:p-1 min-w-0"
                aria-label="SATF Operations Platform"
              >
                {/* Authentic enhanced SATF burgundy suitcase logo mark */}
                <div className="flex items-center justify-center p-1 rounded-lg bg-slate-50 border border-slate-200/80 shadow-2xs group-hover:border-blue-300 transition-colors shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/satf-logo.png"
                    alt="South Asia Travel Factory"
                    width={46}
                    height={32}
                    className="h-6 sm:h-7 w-auto object-contain"
                  />
                </div>

                <div className="flex flex-col">
                  <span className="font-extrabold text-[#172d43] text-sm sm:text-[15px] tracking-tight group-hover:text-[#244d70] transition-colors leading-tight">
                    {t("nav.brand")}
                  </span>
                  <span className="hidden md:block text-[11px] text-slate-500 font-medium tracking-normal mt-0.5 leading-none">
                    {t("nav.brand_sub")}
                  </span>
                </div>
              </Link>
            </div>

            {/* Center: Desktop Navigation Bar with Guaranteed Separation */}
            <nav className="hidden xl:flex items-center gap-0.5 2xl:gap-1 shrink-0" aria-label="Main Navigation">
              {PRIMARY_NAV_ITEMS.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : item.href === "/settings"
                    ? pathname.startsWith("/settings") || pathname.startsWith("/import")
                    : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 2xl:px-3 py-1.5 rounded-lg text-[13px] 2xl:text-[13.5px] font-semibold transition-all duration-150 whitespace-nowrap btn-press",
                      isActive
                        ? "bg-[#244d70] text-white shadow-2xs font-bold"
                        : "text-slate-600 hover:text-[#172d43] hover:bg-slate-100/90 active:bg-slate-200/70"
                    )}
                  >
                    <Icon size={14} className={cn("shrink-0", isActive ? "text-white" : "text-slate-400")} />
                    <span>{t(item.labelKey)}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Right: Segmented Switch & Auth Actions with Guaranteed Spacing */}
            <div className="flex items-center gap-1 sm:gap-2.5 shrink-0">
              
              {/* Redesigned Premium Segmented Switch for Language */}
              <div
                className="inline-flex items-center bg-slate-100/90 p-0.5 rounded-lg border border-slate-200 text-xs shadow-2xs select-none shrink-0"
                role="group"
                aria-label="Language selection"
              >
                <button
                  type="button"
                  onClick={() => setLanguage("en")}
                  className={cn(
                    "px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-md text-[11px] sm:text-xs font-bold transition-all duration-150 cursor-pointer flex items-center gap-1 btn-press",
                    language === "en"
                      ? "bg-white text-[#244d70] shadow-xs border border-slate-200/90 font-black"
                      : "text-slate-500 hover:text-slate-800 font-medium"
                  )}
                  aria-pressed={language === "en"}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#244d70]" style={{ display: language === "en" ? "inline-block" : "none" }} />
                  <span>EN</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLanguage("ja")}
                  className={cn(
                    "px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-md text-[11px] sm:text-xs font-bold transition-all duration-150 cursor-pointer font-sans flex items-center gap-1 btn-press",
                    language === "ja"
                      ? "bg-white text-[#244d70] shadow-xs border border-slate-200/90 font-black"
                      : "text-slate-500 hover:text-slate-800 font-medium"
                  )}
                  aria-pressed={language === "ja"}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#244d70]" style={{ display: language === "ja" ? "inline-block" : "none" }} />
                  <span>日本語</span>
                </button>
              </div>

              {/* Staff Access / Operator Session Badge */}
              {session.authenticated ? (
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-[11px] sm:text-xs font-semibold hover:bg-emerald-100/90 transition-colors cursor-pointer"
                    title={session.role === "lead_coordinator" ? "Lead Coordinator" : "Duty Coordinator"}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <ShieldCheck size={13} className="text-emerald-700" />
                    <span className="hidden sm:inline max-w-[120px] truncate">{session.operator}</span>
                  </button>
                  {userMenuOpen && (
                    <div className="absolute right-0 mt-1.5 w-44 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                      <div className="px-3 py-1.5 border-b border-slate-100">
                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{t("auth.authenticated_as")}</p>
                        <p className="text-xs font-bold text-slate-800 truncate">{session.operator}</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <LogOut size={13} />
                        <span>{t("nav.sign_out")}</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAuthModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-lg border border-slate-200/90 text-slate-600 hover:text-[#172d43] hover:border-slate-300 hover:bg-slate-50 text-[11px] sm:text-xs font-semibold transition-colors cursor-pointer shrink-0"
                  aria-label="Staff Access"
                >
                  <KeyRound size={13} className="text-[#244d70]" />
                  <span className="hidden sm:inline">{language === "ja" ? "スタッフ認証" : "Staff Access"}</span>
                </button>
              )}

              {/* Mobile Menu Hamburger Toggle */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="xl:hidden p-1.5 sm:p-2 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer shrink-0"
                aria-label={mobileMenuOpen ? t("nav.close_menu") : t("nav.menu")}
              >
                {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>

          </div>
        </div>

        {/* Mobile Dropdown Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="xl:hidden bg-white/98 backdrop-blur-md border-b border-slate-200 px-4 pt-2 pb-4 space-y-1.5 shadow-lg animate-in slide-in-from-top-2 duration-150">
            {TOP_NAV_ITEMS.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : item.href === "/settings"
                  ? pathname.startsWith("/settings") || pathname.startsWith("/import")
                  : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-lg text-[14px] font-semibold transition-colors",
                    isActive
                      ? "bg-[#244d70] text-white font-bold shadow-xs"
                      : "text-slate-700 hover:bg-slate-100"
                  )}
                >
                  <Icon size={16} className={isActive ? "text-white" : "text-slate-400"} />
                  <span>{t(item.labelKey)}</span>
                </Link>
              );
            })}

            {/* Mobile Auth Action */}
            <div className="pt-2 border-t border-slate-100">
              {session.authenticated ? (
                <div className="flex items-center justify-between px-3 py-2 bg-emerald-50 rounded-lg text-xs">
                  <div className="flex items-center gap-2 text-emerald-800 font-semibold truncate">
                    <ShieldCheck size={14} className="shrink-0" />
                    <span className="truncate">{session.operator}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="text-red-600 font-bold hover:underline cursor-pointer shrink-0 ml-2"
                  >
                    {t("nav.sign_out")}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setAuthModalOpen(true);
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[#244d70] text-white text-xs font-bold hover:bg-[#1a3852] transition-colors cursor-pointer"
                >
                  <KeyRound size={14} />
                  <span>{language === "ja" ? "スタッフ認証" : "Staff Access"}</span>
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Staff Authentication Modal Dialog */}
      <StaffAuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
      />
    </>
  );
}
