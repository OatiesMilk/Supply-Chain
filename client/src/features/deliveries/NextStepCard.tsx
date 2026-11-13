import { useEffect, useId, useRef, type ReactNode } from 'react';
import { CircleCheck, ArrowRight } from 'lucide-react';
import { workflowPrimaryButtonClass } from './WorkflowSection';

/** One card that names the next step of a run and offers a single button for it.
 *  `focusSignal` moves focus to the heading when it changes, for after a dialog completes the step. */
export default function NextStepCard({ title = 'Next step', text, buttonLabel, onAction, disabled = false, hint, actionHint, done = false, focusSignal, children }: {
  title?: string;
  text: string;
  buttonLabel?: string;
  onAction?: () => void;
  disabled?: boolean;
  /** Why the button is disabled; shown and linked to the button. */
  hint?: string;
  /** What the button opens, shown under it. */
  actionHint?: string;
  done?: boolean;
  focusSignal?: number;
  children?: ReactNode;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const hintId = useId();
  useEffect(() => { if (focusSignal) headingRef.current?.focus(); }, [focusSignal]);
  const described = disabled && hint ? hint : actionHint;
  return <section aria-labelledby={`${hintId}-title`} data-testid="next-step-card"
    className={`rounded-xl border p-4 sm:p-5 ${done ? 'border-emerald-200 bg-emerald-50/60' : 'border-blue-200 bg-blue-50/60'}`}>
    <h3 id={`${hintId}-title`} ref={headingRef} tabIndex={-1} className="text-xs font-bold uppercase tracking-[0.08em] text-[#1F3864] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0078C1]">{title}</h3>
    <p className="mt-1.5 flex items-start gap-2 text-sm font-semibold text-slate-800">
      {done && <CircleCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />}
      <span className="min-w-0 break-words">{text}</span>
    </p>
    {children}
    {buttonLabel && onAction && <div className="mt-3 space-y-1.5">
      <button type="button" className={`${workflowPrimaryButtonClass} w-full sm:w-auto`} disabled={disabled} onClick={onAction}
        aria-describedby={described ? hintId : undefined}>
        {buttonLabel}<ArrowRight aria-hidden="true" className="h-4 w-4" />
      </button>
      {described && <p id={hintId} className="text-xs leading-5 text-slate-600">{described}</p>}
    </div>}
  </section>;
}
