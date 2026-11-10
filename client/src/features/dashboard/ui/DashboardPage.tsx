import { RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatManilaTime } from '@/utils/manilaTimestamp';

interface Props {
  title: string;
  /** ISO timestamp from the server, shown as "Updated 8:27 AM" in Manila time. */
  updatedAt?: string | null;
  onRefresh?: () => void;
  refreshing?: boolean;
  id?: string;
  children: ReactNode;
}

export default function DashboardPage({ title, updatedAt, onRefresh, refreshing = false, id, children }: Props) {
  const stamp = updatedAt ? formatManilaTime(updatedAt) : null;
  return (
    <div className="space-y-6" id={id}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        <div className="flex items-center gap-3">
          {stamp && /\d/.test(stamp) && <span className="text-sm text-slate-600" data-updated-at>Updated {stamp}</span>}
          {onRefresh && (
            <button type="button" onClick={onRefresh} disabled={refreshing} aria-label={refreshing ? 'Refreshing dashboard' : 'Refresh dashboard'}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F3864]">
              <RotateCw className={`h-4 w-4 ${refreshing ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />
              Refresh
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
