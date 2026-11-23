import type { ComponentType } from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { formatCompact, formatFull } from './format';
import { TileSkeleton } from './states';

export type KpiTone = 'neutral' | 'warning' | 'critical';

interface Props {
  label: string;
  /** null or undefined while the server numbers load: the tile shows a skeleton, never a guess. */
  value: number | null | undefined;
  /** One line explaining the number. */
  context?: string;
  /** Noun for the accessible name, e.g. "records". */
  unit?: string;
  tone?: KpiTone;
  icon?: ComponentType<{ className?: string }>;
  /** Omit when the viewer cannot open the target screen: the tile then has no button or arrow. */
  onOpen?: () => void;
  actionLabel?: string;
  size?: 'default' | 'compact';
}

const topBar: Record<KpiTone, string> = {
  neutral: 'bg-slate-200/80',
  warning: 'bg-amber-400',
  critical: 'bg-red-500',
};

const cardBorder: Record<KpiTone, string> = {
  neutral: 'border-slate-200/90 hover:border-slate-300',
  warning: 'border-amber-200/80 hover:border-amber-300',
  critical: 'border-red-200/80 hover:border-red-300',
};

const iconBadge: Record<KpiTone, string> = {
  neutral: 'bg-slate-50 text-slate-600 ring-slate-200/80',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200/80',
  critical: 'bg-red-50 text-red-600 ring-red-200/80',
};

const contextTone: Record<KpiTone, string> = {
  neutral: 'text-slate-500',
  warning: 'text-amber-800',
  critical: 'text-red-700',
};

const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue';

/** Warning and critical only apply when there is something to act on. */
export const effectiveTone = (tone: KpiTone, value: number | null | undefined): KpiTone => (value && value > 0 ? tone : 'neutral');

export default function KpiTile({
  label,
  value,
  context,
  unit,
  tone = 'neutral',
  icon: Icon,
  onOpen,
  actionLabel = 'View list',
  size = 'default',
}: Props) {
  const loading = value === null || value === undefined;
  const shown = effectiveTone(tone, value);
  const interactive = Boolean(onOpen) && !loading;
  const compact = size === 'compact';

  const body = (
    <>
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 top-0 h-[3px] ${topBar[shown]}`}
      />

      {/* Row 1: Label + Icon badge */}
      <span className="flex w-full items-start justify-between gap-3">
        <span className={`${compact ? 'text-xs' : 'text-sm'} font-medium leading-snug text-slate-600`}>
          {label}
        </span>
        {Icon && (
          <span
            className={`flex shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${
              compact ? 'h-8 w-8' : 'h-9 w-9'
            } ${iconBadge[shown]}`}
            aria-hidden="true"
          >
            <Icon className={compact ? 'h-4 w-4' : 'h-[18px] w-[18px]'} />
          </span>
        )}
      </span>

      {/* Row 2: Focal Metric */}
      <span className={`${compact ? 'mt-2' : 'mt-2.5'} block w-full`}>
        {loading ? (
          <TileSkeleton lines={2} />
        ) : (
          <span
            className={`${compact ? 'text-2xl' : 'text-3xl'} block font-bold leading-none tracking-tight tabular-nums text-slate-900`}
            title={formatFull(value)}
          >
            {formatCompact(value)}
          </span>
        )}
      </span>

      {/* Row 3: Context footer + interactive arrow */}
      {!loading && (context || interactive) && (
        <span
          className={`${compact ? 'mt-3 pt-2.5' : 'mt-4 pt-3'} flex w-full items-center justify-between gap-2 border-t border-slate-100`}
        >
          <span className={`flex min-w-0 items-center gap-1.5 text-xs font-medium ${contextTone[shown]}`}>
            {shown !== 'neutral' && (
              <AlertTriangle
                className={`h-3.5 w-3.5 shrink-0 ${shown === 'critical' ? 'text-red-600' : 'text-amber-600'}`}
                aria-hidden="true"
              />
            )}
            <span className="truncate">{context ?? actionLabel}</span>
          </span>
          {interactive && (
            <ArrowRight
              className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-brand-blue motion-reduce:transform-none"
              aria-hidden="true"
            />
          )}
        </span>
      )}
    </>
  );

  const base = `group relative flex h-full w-full flex-col justify-between overflow-hidden rounded-xl border bg-white text-left shadow-xs ${
    compact ? 'px-3.5 pb-3 pt-4' : 'px-4 pb-3.5 pt-4.5'
  } ${cardBorder[shown]}`;

  if (!interactive) {
    return (
      <div className={base} data-kpi-tile data-tone={shown} aria-busy={loading || undefined}>
        {body}
      </div>
    );
  }

  const name = `${label}, ${formatFull(value)}${unit ? ` ${unit}` : ''}. ${actionLabel}`;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={name}
      data-kpi-tile
      data-tone={shown}
      className={`${base} cursor-pointer transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 motion-reduce:transform-none ${focus}`}
    >
      {body}
    </button>
  );
}
