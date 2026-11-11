import { formatCompact, formatFull } from './format';
import { TileSkeleton } from './states';

export interface KpiStripItem {
  /** Full label, visible from sm up and always read by screen readers. */
  label: string;
  /** Short label shown on phones. */
  shortLabel: string;
  /** null or undefined while loading: the cell shows a skeleton, never a guess. */
  value: number | null | undefined;
}

/** Counters in one card, split into equal cells. Built for phone-first screens. */
export default function KpiStrip({ items, label }: { items: KpiStripItem[]; label: string }) {
  return (
    <section aria-label={label} className="grid divide-x divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map(item => {
        const loading = item.value === null || item.value === undefined;
        return (
          <div key={item.label} data-kpi-tile aria-busy={loading || undefined} className="flex min-w-0 flex-col items-center gap-0.5 px-2 py-3 text-center sm:items-start sm:px-4 sm:text-left">
            {loading ? <div className="w-full"><TileSkeleton lines={1} /></div> : (
              <span className="text-xl font-semibold leading-tight tabular-nums text-slate-900 sm:text-2xl" title={formatFull(item.value as number)}>
                {formatCompact(item.value as number)}
              </span>
            )}
            <span className="truncate text-xs font-semibold text-slate-600 sm:text-sm">
              <span className="sm:hidden" aria-hidden="true">{item.shortLabel}</span>
              <span className="sr-only sm:not-sr-only">{item.label}</span>
            </span>
          </div>
        );
      })}
    </section>
  );
}
