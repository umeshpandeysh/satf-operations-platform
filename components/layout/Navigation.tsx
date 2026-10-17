"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Globe,
  Calendar,
  Users,
  BarChart2,
  Settings,
  Menu,
  X,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/components/ui/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  implemented: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard, implemented: true },
  { label: "Tours", href: "/tours", icon: Globe, implemented: true },
  { label: "Calendar", href: "/calendar", icon: Calendar, implemented: false },
  { label: "Assignments", href: "/assignments", icon: Users, implemented: false },
  { label: "Reports", href: "/reports", icon: BarChart2, implemented: false },
  { label: "Settings", href: "/settings", icon: Settings, implemented: false },
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
        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
        isActive
          ? "bg-blue-50 text-blue-700"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      )}
    >
      <item.icon
        size={18}
        className={cn(
          "shrink-0",
          isActive ? "text-blue-600" : "text-slate-400"
        )}
        aria-hidden="true"
      />
      <span className="flex-1">{item.label}</span>
      {!item.implemented && (
        <span className="text-[10px] font-semibold tracking-wide uppercase text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
          Soon
        </span>
      )}
      {isActive && (
        <ChevronRight size={14} className="text-blue-400 shrink-0" aria-hidden="true" />
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

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col w-60 bg-white border-r border-slate-200 transition-transform duration-200",
          "lg:static lg:translate-x-0 lg:z-auto lg:flex",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        aria-label="Main navigation"
      >
        {/* Logo / wordmark */}
        <div className="flex items-center gap-2 h-16 px-4 border-b border-slate-200 shrink-0">
          <div
            className="flex items-center justify-center px-1.5 h-8 rounded-md bg-blue-700 text-white text-[11px] font-bold tracking-wider shrink-0"
            aria-hidden="true"
          >
            SATF
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 leading-tight truncate">
              SATF Ops
            </p>
            <p className="text-[10px] text-slate-400 leading-tight truncate">
              South Asia Travel Factory
            </p>
          </div>
          {/* Close button — mobile only */}
          <button
            className="ml-auto lg:hidden p-1 rounded text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            onClick={onClose}
            aria-label="Close navigation menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              pathname={pathname}
              onClick={onClose}
            />
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-200 shrink-0">
          <p className="text-[10px] text-slate-400 leading-tight">
            Phase 1 — Frontend foundation
          </p>
          <p className="text-[10px] text-slate-400">Demo data only</p>
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

  return (
    <header className="sticky top-0 z-20 h-16 flex items-center gap-4 bg-white border-b border-slate-200 px-4 lg:px-6 shrink-0">
      {/* Mobile hamburger */}
      <button
        className="lg:hidden p-2 rounded text-slate-500 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        onClick={onMenuToggle}
        aria-label="Open navigation menu"
      >
        <Menu size={20} />
      </button>

      {/* Page title */}
      <div className="flex-1 min-w-0">
        <h1 className="text-base font-semibold text-slate-900 truncate">
          {current.label}
        </h1>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-3">
        {/* User placeholder */}
        <div
          className="flex items-center gap-2 cursor-default"
          title="Authentication coming in Phase 3"
        >
          <div
            className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600 shrink-0"
            aria-hidden="true"
          >
            OP
          </div>
          <span className="hidden sm:block text-sm text-slate-700">
            Ops Staff
          </span>
        </div>
      </div>
    </header>
  );
}
