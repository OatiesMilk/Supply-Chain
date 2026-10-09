import React from 'react';
import { DashboardFilterId, getDashboardFilterLabel } from '@/utils/dashboardFilters';

interface DashboardFilterChipProps {
  filterId: DashboardFilterId | null;
  onClear: () => void;
}

export default function DashboardFilterChip({ filterId, onClear }: DashboardFilterChipProps) {
  if (!filterId) return null;
  const label = getDashboardFilterLabel(filterId);

  return (
    <div data-testid="dashboard-filter-chip" className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 max-w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900 print:hidden">
      <span className="min-w-0 max-w-full break-words">Showing: {label} (from Dashboard)</span>
      <button
        type="button"
        aria-label={`Clear dashboard filter: ${label}`}
        onClick={onClear}
        className="inline-flex min-h-6 min-w-6 shrink-0 items-center justify-center rounded-full font-bold text-blue-800 hover:bg-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-700"
      >
        ×
      </button>
    </div>
  );
}
