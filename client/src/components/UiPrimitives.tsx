import type { ComponentType, ReactNode } from 'react';
import { Inbox } from 'lucide-react';

export interface SectionHeaderProps {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/** Clean sentence-case section/card header with optional subtitle and right-aligned actions. */
export function SectionHeader({ title, subtitle, actions, className = '' }: SectionHeaderProps) {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-tight text-slate-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  action?: ReactNode;
  compact?: boolean;
}

/** Unified empty-state presentation for tables, panels, and filtered views. */
export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  compact = false,
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8 px-4' : 'py-12 px-6'}`}>
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200/80 bg-slate-50 text-slate-400">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export interface TableSkeletonProps {
  columns: number;
  rows?: number;
}

/** Animated shimmer rows rendered inside a <tbody> while tabular records load. */
export function TableSkeleton({ columns, rows = 5 }: TableSkeletonProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <tr key={`skeleton-row-${rowIdx}`} aria-hidden="true">
          {Array.from({ length: columns }).map((__, colIdx) => (
            <td key={`skeleton-cell-${rowIdx}-${colIdx}`} className="px-4 py-3.5">
              <div
                className="h-4 rounded-md bg-slate-100 motion-safe:animate-pulse"
                style={{ width: colIdx === 0 ? '68%' : colIdx === 1 ? '84%' : '56%' }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
