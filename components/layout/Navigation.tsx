"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Compass,
  Calendar,
  Users,
  BarChart3,
  Settings,
  Menu,
  X,
  Radio,
  Clock,
  ShieldAlert,
  FileSpreadsheet,
} from "lucide-react";
import { cn } from "@/components/ui/utils";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  implemented: boolean;
  section: "operations" | "planning" | "system";
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Operations Command",
    href: "/",
    icon: LayoutDashboard,
    implemented: true,
    section: "operations",
  },
  {
    label: "Tours Roster",
    href: "/tours",
    icon: Compass,
    implemented: true,
    section: "operations",
  },
  {
    label: "Dispatch Calendar",
    href: "/calendar",
    icon: Calendar,
    implemented: true,
    section: "planning",
  },
  {
    label: "Driver & Guide Fleet",
    href: "/assignments",
    icon: Users,
    implemented: true,
    section: "planning",
  },
  {
    label: "Operations Reports",
    href: "/reports",
    icon: BarChart3,
    implemented: true,
    section: "system",
  },
  {
    label: "Import Review",
    href: "/import/review",
    icon: FileSpreadsheet,
    implemented: true,
    section: "system",
  },
  {
    label: "System Settings",
    href: "/settings",
    icon: Settings,
    implemented: true,
    section: "system",
  },
];

function NavLink({
  item,
  pathname,
  onClick,
}: {
  item: NavItem;
  pathname: string;
  onClick?: () => void;
}) {
  const isActive =
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
        isActive
          ? "bg-blue-50 text-blue-800 font-semibold border-l-2 border-blue-600 pl-2.5"
          : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <item.icon
          size={16}
          className={cn(
            "shrink-0 transition-colors",
            isActive
              ? "text-blue-600"
              : "text-slate-400 group-hover:text-slate-600"
          )}
          aria-hidden="true"
        />
        <span className="truncate">{item.label}</span>
      </div>

      {!item.implemented && (
        <span className="text-[10px] font-medium tracking-wide uppercase text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
          Roadmap
        </span>
      )}
    </Link>
  );
}

export function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  const operationsItems = NAV_ITEMS.filter((i) => i.section === "operations");
  const planningItems = NAV_ITEMS.filter((i) => i.section === "planning");
  const systemItems = NAV_ITEMS.filter((i) => i.section === "system");

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs lg:hidden transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar container */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col w-64 bg-white border-r border-slate-200/90 transition-transform duration-200 ease-in-out",
          "lg:static lg:translate-x-0 lg:z-auto lg:flex",
          open ? "translate-x-0 shadow-xl" : "-translate-x-full lg:shadow-none"
        )}
        aria-label="Operations Navigation"
      >
        {/* Wordmark & Brand Header */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-slate-200/90 shrink-0 bg-slate-50/50">
          <Link
            href="/"
            className="flex items-center gap-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            <div
              className="flex items-center justify-center w-7 h-7 rounded bg-blue-700 text-white text-[11px] font-bold tracking-wider shrink-0 shadow-xs"
              aria-hidden="true"
            >
              ST
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-bold text-slate-900 tracking-tight leading-none">
                  SATF Operations
                </p>
                <span className="text-[9px] font-semibold bg-blue-50 text-blue-700 px-1 py-0.2 rounded border border-blue-200">
                  v2.0
                </span>
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5 leading-none truncate">
                South Asia Travel Factory
              </p>
            </div>
          </Link>

          {/* Close button — mobile only */}
          <button
            className="lg:hidden p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            onClick={onClose}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Section List */}
        <nav className="flex-1 overflow-y-auto px-3 py-3.5 space-y-4">
          <div>
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Live Operations
            </p>
            <div className="space-y-0.5">
              {operationsItems.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  onClick={onClose}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Planning & Fleet
            </p>
            <div className="space-y-0.5">
              {planningItems.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  onClick={onClose}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Platform & Controls
            </p>
            <div className="space-y-0.5">
              {systemItems.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  onClick={onClose}
                />
              ))}
            </div>
          </div>
        </nav>

        {/* Operational Status Footer */}
        <div className="p-3 border-t border-slate-200/90 bg-slate-50/60 shrink-0 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-slate-600">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Dispatch Online
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              IST (UTC+5:30)
            </span>
          </div>
          <div className="p-2 rounded bg-white border border-slate-200 text-[10px] text-slate-500 leading-tight">
            <div className="flex items-center gap-1 font-semibold text-slate-700 mb-0.5">
              <Radio size={11} className="text-blue-600" />
              <span>Browser Session Store</span>
            </div>
            Local demo environment. Changes persist within active browser tab.
          </div>
        </div>
      </aside>
    </>
  );
}

export function Header({
  onMenuToggle,
}: {
  onMenuToggle: () => void;
}) {
  const pathname = usePathname();

  const current =
    NAV_ITEMS.find((i) =>
      i.href === "/" ? pathname === "/" : pathname.startsWith(i.href)
    ) ?? NAV_ITEMS[0];

  const getBreadcrumb = () => {
    if (pathname === "/") return "Live Command Center";
    if (pathname === "/tours") return "Tours Roster & Dispatch";
    if (pathname.startsWith("/tours/")) return "Tour Operational File";
    if (pathname === "/calendar") return "Schedule Calendar";
    if (pathname === "/assignments") return "Resource Assignments";
    if (pathname === "/reports") return "Operational Analytics";
    if (pathname === "/settings") return "System Settings";
    return current.label;
  };

  return (
    <header className="sticky top-0 z-30 h-14 flex items-center justify-between gap-4 bg-white border-b border-slate-200/90 px-4 sm:px-6 shrink-0">
      {/* Left: Mobile hamburger & breadcrumbs */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          className="lg:hidden p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          onClick={onMenuToggle}
          aria-label="Toggle navigation menu"
        >
          <Menu size={18} />
        </button>

        <div className="flex items-center gap-1.5 text-xs text-slate-500 min-w-0">
          <span className="hidden sm:inline font-medium text-slate-400">
            Operations
          </span>
          <span className="hidden sm:inline text-slate-300">/</span>
          <h1 className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
            {getBreadcrumb()}
          </h1>
        </div>
      </div>

      {/* Right: Operational Status indicators & Staff Profile */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Date Anchor Indicator */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-100/80 text-[11px] font-medium text-slate-600 border border-slate-200">
          <Clock size={12} className="text-slate-400" />
          <span>India Ops Time</span>
        </div>

        {/* Prototype Scope Indicator */}
        <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-semibold">
          <ShieldAlert size={12} className="text-amber-600" />
          <span className="hidden sm:inline">Prototype Mode</span>
        </div>

        {/* Staff badge */}
        <div
          className="flex items-center gap-2 pl-2 border-l border-slate-200"
          title="Operational Dispatcher (Session Role)"
        >
          <div
            className="w-7 h-7 rounded-full bg-slate-800 text-white flex items-center justify-center text-[10px] font-bold tracking-wider shrink-0"
            aria-hidden="true"
          >
            OP
          </div>
          <div className="hidden lg:block text-left">
            <p className="text-xs font-semibold text-slate-800 leading-tight">
              Ops Dispatch
            </p>
            <p className="text-[10px] text-slate-400 leading-none">
              Duty Officer
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
