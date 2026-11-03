import type { ReactNode } from 'react';

/** Shared visual shell for delivery and RMA status/action groups. */
export function WorkflowSection({
  title,
  description,
  children,
  className = '',
  variant = 'card',
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  variant?: 'card' | 'flat';
}) {
  if (variant === 'flat') {
    return (
      <section className={`space-y-4 border-t border-slate-200 pt-5 ${className}`}>
        <header>
          <h3 className="text-sm font-bold text-[#1F3864]">{title}</h3>
          {description && <div className="mt-1 text-xs leading-5 text-slate-500">{description}</div>}
        </header>
        <div className="space-y-4">{children}</div>
      </section>
    );
  }

  return (
    <section className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <header className="border-b border-slate-100 px-4 py-3.5 sm:px-5">
        <h3 className="text-sm font-bold text-[#1F3864]">{title}</h3>
        {description && <div className="mt-1 text-xs leading-5 text-slate-500">{description}</div>}
      </header>
      <div className="space-y-4 p-4 sm:p-5">{children}</div>
    </section>
  );
}

export const workflowInputClass = 'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-slate-400 focus:border-[#0078C1] focus:ring-4 focus:ring-[#0078C1]/10 focus-visible:border-[#0078C1] focus-visible:ring-4 focus-visible:ring-[#0078C1]/10 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-500 motion-reduce:transition-none';

export const workflowSelectClass = `${workflowInputClass} appearance-none cursor-pointer pr-10`;

export const workflowFieldLabelClass = 'block space-y-1.5 text-sm font-semibold text-slate-700';

export const workflowFieldHintClass = 'text-xs font-normal leading-5 text-slate-500';

export const workflowPrimaryButtonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#0078C1] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-[background-color,transform,box-shadow] duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0078C1] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none disabled:active:scale-100 motion-reduce:transition-none motion-reduce:active:scale-100';

export const workflowSecondaryButtonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors duration-150 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0078C1] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none motion-reduce:transition-none';
