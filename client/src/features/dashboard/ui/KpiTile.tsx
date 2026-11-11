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

const accent: Record<KpiTone, string> = { neutral: 'border-l-slate-300', warning: 'border-l-amber-500', critical: 'border-l-red-600' };
const chip: Record<KpiTone, string> = { neutral: 'bg-slate-100 text-slate-700', warning: 'bg-amber-50 text-amber-800', critical: 'bg-red-50 text-red-700' };
const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F3864]';

/** Warning and critical only apply when there is something to act on. */
export const effectiveTone = (tone: KpiTone, value: number | null | undefined): KpiTone => (value && value > 0 ? tone : 'neutral');

export default function KpiTile({ label, value, context, unit, tone = 'neutral', icon: Icon, onOpen, actionLabel = 'View list', size = 'default' }: Props) {
  const loading = value === null || value === undefined;
  const shown = effectiveTone(tone, value);
  const interactive = Boolean(onOpen) && !loading;
  const compact = size === 'compact';
  const body = (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-1 text-left">
        <span className="text-sm font-semibold text-slate-600">{label}</span>
        {loading ? <TileSkeleton lines={2} /> : (
          <>
            <span className={`${compact ? 'text-2xl' : 'text-3xl'} font-semibold leading-tight tabular-nums text-slate-900`} title={formatFull(value)}>{formatCompact(value)}</span>
            {context && (
              <span className="flex items-center gap-1 text-sm text-slate-600">
                {shown !== 'neutral' && <AlertTriangle className={`h-3.5 w-3.5 shrink-0 ${shown === 'critical' ? 'text-red-700' : 'text-amber-700'}`} aria-hidden="true" />}
                {context}
              </span>
            )}
          </>
        )}
      </span>
      {Icon && <span className={`shrink-0 rounded-lg p-2.5 ${chip[shown]}`} aria-hidden="true"><Icon className="h-5 w-5" /></span>}
      {interactive && <ArrowRight className="h-4 w-4 shrink-0 self-center text-slate-500" aria-hidden="true" />}
    </>
  );
  const base = `flex h-full w-full items-start gap-3 rounded-xl border border-l-[3px] border-slate-200 bg-white ${compact ? 'p-3' : 'p-4'} shadow-sm ${accent[shown]}`;
  if (!interactive) return <div className={base} data-kpi-tile aria-busy={loading || undefined}>{body}</div>;
  const name = `${label}, ${formatFull(value)}${unit ? ` ${unit}` : ''}. ${actionLabel}`;
  return (
    <button type="button" onClick={onOpen} aria-label={name} data-kpi-tile className={`${base} transition-colors hover:border-slate-400 hover:bg-slate-50 ${focus}`}>
      {body}
    </button>
  );
}
