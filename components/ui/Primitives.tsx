import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "./utils";
import type { TourStatus, AssignmentStatus } from "@/lib/types";
import {
  TOUR_STATUS_CLASSES,
  TOUR_STATUS_LABELS,
  ASSIGNMENT_STATUS_LABELS,
} from "@/lib/utils";

// ─── Badge ────────────────────────────────────────────────────────────────────

export interface BadgeProps {
  children: React.ReactNode;
  className?: string;
  variant?: "neutral" | "success" | "warning" | "danger" | "info" | "outline";
  dot?: boolean;
}

const BADGE_VARIANTS: Record<NonNullable<BadgeProps["variant"]>, string> = {
  neutral: "bg-slate-100 text-slate-700 border-slate-200",
  success: "bg-emerald-50 text-emerald-800 border-emerald-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
  danger: "bg-red-50 text-red-800 border-red-200",
  info: "bg-blue-50 text-blue-800 border-blue-200",
  outline: "bg-transparent text-slate-700 border-slate-300",
};

export function Badge({ children, className, variant, dot }: BadgeProps) {
  const variantClass = variant ? BADGE_VARIANTS[variant] : "";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium tracking-tight border",
        variant ? variantClass : "border-transparent",
        className
      )}
    >
      {dot && (
        <span
          className="w-1.5 h-1.5 rounded-full bg-current opacity-75"
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}

// ─── StatusBadge (Semantic wrapper for TourStatus) ───────────────────────────

export function StatusBadge({
  status,
  className,
}: {
  status: TourStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold tracking-tight border",
        TOUR_STATUS_CLASSES[status],
        className
      )}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          status === "active" && "bg-emerald-500 animate-pulse",
          status === "upcoming" && "bg-blue-500",
          status === "attention" && "bg-amber-500",
          status === "completed" && "bg-slate-400",
          status === "cancelled" && "bg-red-500"
        )}
        aria-hidden="true"
      />
      {TOUR_STATUS_LABELS[status]}
    </span>
  );
}

// ─── AssignmentStatusBadge ───────────────────────────────────────────────────

export function AssignmentBadge({
  status,
  className,
}: {
  status: AssignmentStatus;
  className?: string;
}) {
  const styles: Record<AssignmentStatus, string> = {
    assigned: "bg-emerald-50 text-emerald-700 border-emerald-200",
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    unassigned: "bg-red-50 text-red-700 border-red-200",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium tracking-tight border",
        styles[status],
        className
      )}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          status === "assigned" && "bg-emerald-500",
          status === "pending" && "bg-amber-500",
          status === "unassigned" && "bg-red-500"
        )}
        aria-hidden="true"
      />
      {ASSIGNMENT_STATUS_LABELS[status]}
    </span>
  );
}

// ─── Card Components ──────────────────────────────────────────────────────────

export interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <div
      className={cn(
        "bg-white rounded-lg border border-slate-200/90 shadow-xs transition-shadow",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: CardProps) {
  return (
    <div
      className={cn(
        "px-4 py-3 sm:px-5 sm:py-3.5 border-b border-slate-100/90 flex items-center justify-between",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardContent({ children, className }: CardProps) {
  return <div className={cn("px-4 py-3.5 sm:px-5 sm:py-4", className)}>{children}</div>;
}

export function CardFooter({ children, className }: CardProps) {
  return (
    <div
      className={cn(
        "px-4 py-2.5 sm:px-5 sm:py-3 bg-slate-50/70 border-t border-slate-100 text-xs text-slate-500 rounded-b-lg",
        className
      )}
    >
      {children}
    </div>
  );
}

// ─── Metric Card (Enterprise Operations KPI) ─────────────────────────────────

export interface MetricCardProps {
  label: string;
  value: number | string;
  icon: React.ElementType;
  iconClass?: string;
  description?: string;
  badge?: React.ReactNode;
}

export function MetricCard({
  label,
  value,
  icon: Icon,
  iconClass = "text-blue-600 bg-blue-50/80 border-blue-100",
  description,
  badge,
}: MetricCardProps) {
  return (
    <Card className="hover:border-slate-300 transition-colors">
      <CardContent className="p-4 sm:p-4.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-wider uppercase text-slate-500 truncate">
              {label}
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-slate-900 tracking-tight tabular-nums">
                {value}
              </span>
              {badge}
            </div>
            {description && (
              <p className="text-xs text-slate-500 mt-1 truncate font-normal">
                {description}
              </p>
            )}
          </div>
          <div
            className={cn(
              "flex items-center justify-center w-9 h-9 rounded-md border shrink-0",
              iconClass
            )}
            aria-hidden="true"
          >
            <Icon size={18} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────

export interface SectionHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  badge?: React.ReactNode;
}

export function SectionHeader({
  title,
  description,
  action,
  badge,
}: SectionHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 w-full">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-900 tracking-tight">
            {title}
          </h2>
          {badge}
        </div>
        {description && (
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

export interface EmptyStateProps {
  icon: React.ElementType;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div
        className="flex items-center justify-center w-11 h-11 rounded-lg bg-slate-100 border border-slate-200 text-slate-500 mb-3"
        aria-hidden="true"
      >
        <Icon size={20} />
      </div>
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      <p className="text-xs text-slate-500 mt-1 max-w-sm leading-relaxed">
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ─── Page Container ───────────────────────────────────────────────────────────

export function PageContainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-5",
        className
      )}
    >
      {children}
    </div>
  );
}

// ─── Placeholder Page (Roadmap modules) ───────────────────────────────────────

export interface PlaceholderPageProps {
  title: string;
  description: string;
  plannedPhase?: string;
  icon: React.ElementType;
}

export function PlaceholderPage({
  title,
  description,
  plannedPhase = "Phase 2",
  icon: Icon,
}: PlaceholderPageProps) {
  return (
    <PageContainer>
      <div className="max-w-2xl mx-auto mt-8">
        <Card className="text-center p-8 sm:p-12 border-dashed">
          <div
            className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 mb-4"
            aria-hidden="true"
          >
            <Icon size={24} />
          </div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-2 max-w-md mx-auto leading-relaxed">
            {description}
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              Roadmap: {plannedPhase}
            </span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 text-xs font-medium border border-amber-200">
              Prototype placeholder
            </span>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors shadow-xs"
            >
              <ArrowLeft size={14} />
              Return to Dashboard
            </Link>
            <Link
              href="/tours"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors shadow-xs"
            >
              View Tours Roster
            </Link>
          </div>
        </Card>
      </div>
    </PageContainer>
  );
}
