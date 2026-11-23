/**
 * Shared Tailwind utility class tokens for consistent Clean Light Enterprise controls,
 * cards, tables, typography, and focus rings across all portal views.
 */

export const focusRingBrandClass =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue';

export const focusRingNavyClass =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy';

export const cardClass =
  'rounded-xl border border-slate-200/90 bg-white shadow-xs';

export const toolbarClass =
  'flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-200/80';

export const btnPrimaryClass =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-brand-navy px-3.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-brand-blue cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ' +
  focusRingBrandClass;

export const btnSecondaryClass =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ' +
  focusRingBrandClass;

export const btnGhostClass =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ' +
  focusRingBrandClass;

export const btnDangerClass =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-red-700 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ' +
  focusRingBrandClass;

export const navbarIconButtonClass =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200/90 bg-white text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-brand-navy cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ' +
  focusRingBrandClass;

export const fieldLabelClass =
  'block text-xs font-medium text-slate-700 mb-1';

export const fieldInputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 transition-colors focus:outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500';

export const fieldSelectClass = `${fieldInputClass} cursor-pointer`;

export const tableHeaderRowClass =
  'border-b border-slate-200/90 bg-slate-50/80 text-xs font-medium uppercase tracking-wider text-slate-500';

export const tableRowClass =
  'transition-colors hover:bg-slate-50/90 focus-within:bg-slate-50/90';

export const tableLeadButtonClass =
  'rounded-sm text-left font-semibold text-brand-navy underline-offset-2 transition-colors hover:text-brand-blue hover:underline cursor-pointer tabular-nums ' +
  focusRingNavyClass;

export const numericTextClass = 'tabular-nums';

export function filterChipClass(active: boolean): string {
  return (
    'inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors cursor-pointer ' +
    focusRingBrandClass +
    ' ' +
    (active
      ? 'bg-brand-navy text-white border-brand-navy shadow-2xs'
      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900')
  );
}
