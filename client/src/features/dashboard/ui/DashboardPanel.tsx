import { useId, type ReactNode } from 'react';

interface Props {
  title: string;
  /** Short badge next to the title, e.g. "14 open". */
  count?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** "Showing 10 of 14" and a "View all" link belong here. */
  footer?: ReactNode;
}

export default function DashboardPanel({ title, count, actions, children, footer }: Props) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 id={id} className="text-base font-semibold text-slate-900">{title}</h2>
          {count !== undefined && count !== null && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">{count}</span>}
        </div>
        {actions}
      </header>
      <div className="p-4">{children}</div>
      {footer && <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-sm text-slate-600">{footer}</footer>}
    </section>
  );
}
