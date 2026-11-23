import type { ReactNode } from 'react';
import { ArrowRight, ArrowUpRight } from 'lucide-react';

export interface ActionPillProps {
  /** Compact visible text shown inside the pill (e.g. "Deliveries"). */
  label: string;
  /** Optional full accessible/test label when visual text is shortened (e.g. "View Deliveries in transit"). */
  accessibleLabel?: string;
  /** Optional numeric badge displayed beside the label. */
  count?: number;
  /** Emphasize active queues with brand tint, or calm empty/zero items. */
  emphasis?: 'default' | 'active' | 'muted';
  /** Arrow style: 'external' (↗) for module drill-down chips, 'forward' (→) for single view-all actions, or 'none'. */
  arrow?: 'external' | 'forward' | 'none';
  onClick: () => void;
}

const pillTone: Record<NonNullable<ActionPillProps['emphasis']>, string> = {
  default:
    'border-slate-200/90 bg-white text-slate-700 shadow-2xs hover:border-brand-blue/40 hover:bg-brand-sky/50 hover:text-brand-navy',
  active:
    'border-brand-blue/30 bg-brand-sky/80 text-brand-navy shadow-2xs hover:border-brand-navy hover:bg-brand-navy hover:text-white',
  muted:
    'border-slate-200/80 bg-slate-50/70 text-slate-500 hover:border-slate-300 hover:bg-white hover:text-slate-700',
};

const badgeTone: Record<NonNullable<ActionPillProps['emphasis']>, string> = {
  default: 'bg-slate-100 text-slate-700 group-hover:bg-brand-navy/10 group-hover:text-brand-navy',
  active: 'bg-brand-navy text-white group-hover:bg-white/20 group-hover:text-white',
  muted: 'bg-slate-200/70 text-slate-500 group-hover:bg-slate-100 group-hover:text-slate-700',
};

/** Crisp, scannable pill action used in dashboard panel headers and footers. */
export function ActionPill({
  label,
  accessibleLabel,
  count,
  emphasis = 'default',
  arrow = 'external',
  onClick,
}: ActionPillProps) {
  const Icon = arrow === 'forward' ? ArrowRight : ArrowUpRight;
  const shortened = Boolean(accessibleLabel && accessibleLabel !== label);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={accessibleLabel}
      className={`group inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue ${pillTone[emphasis]}`}
    >
      {shortened && <span className="sr-only">{accessibleLabel}</span>}
      <span aria-hidden={shortened || undefined}>{label}</span>
      {count !== undefined && (
        <span
          aria-hidden={shortened || undefined}
          className={`rounded-full px-1.5 py-0.5 text-xs font-semibold leading-none tabular-nums transition-colors ${badgeTone[emphasis]}`}
        >
          {count.toLocaleString()}
        </span>
      )}
      {arrow !== 'none' && (
        <Icon
          aria-hidden="true"
          className={`h-3.5 w-3.5 shrink-0 transition-transform duration-150 motion-reduce:transform-none ${
            emphasis === 'active'
              ? 'text-brand-blue group-hover:text-white'
              : 'text-slate-400 group-hover:text-brand-blue'
          } ${arrow === 'forward' ? 'group-hover:translate-x-0.5' : 'group-hover:translate-x-0.5 group-hover:-translate-y-0.5'}`}
        />
      )}
    </button>
  );
}

/** Optional muted prefix label + horizontally wrapped group of ActionPill items. */
export function ActionPillGroup({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {label && <span className="mr-1 text-xs font-medium text-slate-400">{label}</span>}
      {children}
    </div>
  );
}
