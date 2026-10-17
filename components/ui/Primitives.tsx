import { cn } from "./utils";

// ─── Badge ────────────────────────────────────────────────────────────────────

interface BadgeProps {
  children: React.ReactNode;
  className?: string;
}

export function Badge({ children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium leading-tight",
        className
      )}
    >
      {children}
    </span>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <div
      className={cn(
        "bg-white rounded-xl border border-slate-200 shadow-sm",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  className,
}: CardProps) {
  return (
    <div
      className={cn(
        "px-5 py-4 border-b border-slate-100",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardContent({
  children,
  className,
}: CardProps) {
  return (
    <div className={cn("px-5 py-4", className)}>{children}</div>
  );
}

// ─── Metric card ──────────────────────────────────────────────────────────────

interface MetricCardProps {
  label: string;
  value: number | string;
  icon: React.ElementType;
  iconClass?: string;
  description?: string;
}

export function MetricCard({
  label,
  value,
  icon: Icon,
  iconClass = "text-blue-600 bg-blue-50",
  description,
}: MetricCardProps) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <div
          className={cn(
            "flex items-center justify-center w-11 h-11 rounded-lg shrink-0",
            iconClass
          )}
          aria-hidden="true"
        >
          <Icon size={22} />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold text-slate-900 leading-none">
            {value}
          </p>
          <p className="text-sm text-slate-500 mt-0.5 truncate">{label}</p>
          {description && (
            <p className="text-xs text-slate-400 mt-0.5 truncate">
              {description}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

interface SectionHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function SectionHeader({
  title,
  description,
  action,
}: SectionHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {description && (
          <p className="text-sm text-slate-500 mt-0.5">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon: React.ElementType;
  title: string;
  description: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      <div className="flex items-center justify-center w-14 h-14 rounded-full bg-slate-100 mb-4" aria-hidden="true">
        <Icon size={26} className="text-slate-400" />
      </div>
      <p className="text-base font-medium text-slate-700">{title}</p>
      <p className="text-sm text-slate-400 mt-1 max-w-xs">{description}</p>
    </div>
  );
}

// ─── Page container ───────────────────────────────────────────────────────────

export function PageContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {children}
    </div>
  );
}

// ─── Placeholder section (for unimplemented modules) ─────────────────────────

interface PlaceholderPageProps {
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
      <div className="flex flex-col items-center justify-center py-24 text-center px-4">
        <div
          className="flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-50 mb-6"
          aria-hidden="true"
        >
          <Icon size={32} className="text-blue-400" />
        </div>
        <h2 className="text-xl font-semibold text-slate-800">{title}</h2>
        <p className="text-sm text-slate-500 mt-2 max-w-md">{description}</p>
        <span className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 text-xs font-medium text-slate-500">
          Planned for {plannedPhase}
        </span>
      </div>
    </PageContainer>
  );
}
