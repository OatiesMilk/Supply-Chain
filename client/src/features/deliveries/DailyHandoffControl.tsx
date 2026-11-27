import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown, FileSpreadsheet, FileStack, Send } from 'lucide-react';

interface Props {
  /** Toolbar (light) or bulk-selection bar (dark); also prefixes the element ids. */
  variant: 'toolbar' | 'bulk';
  /** TASS with RMA write access dispatches; read-only TASS still gets the two outputs. */
  canDispatch: boolean;
  disabled?: boolean;
  onDispatch: () => void;
  onExtractSlips: () => void;
  onDailyRouteSlip: () => void;
}

const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';
const STYLES = {
  toolbar: {
    primary: `inline-flex items-center gap-1.5 rounded-l-lg bg-brand-blue px-3 py-2 text-xs font-semibold text-white hover:bg-brand-blue-hover disabled:opacity-60 cursor-pointer ${focusRing} focus-visible:outline-brand-blue`,
    trigger: `inline-flex items-center gap-1.5 border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60 cursor-pointer ${focusRing} focus-visible:outline-brand-blue`,
  },
  bulk: {
    primary: `inline-flex items-center gap-1.5 rounded-l-lg bg-white px-3 py-1.5 text-xs font-semibold text-brand-blue hover:bg-white/90 disabled:opacity-60 cursor-pointer ${focusRing} focus-visible:outline-white`,
    trigger: `inline-flex items-center gap-1.5 border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20 disabled:opacity-60 cursor-pointer ${focusRing} focus-visible:outline-white`,
  },
} as const;

/** TASS end-of-day outputs in one place: Dispatch to Logistics is the primary action; slips and DRR sit in its menu. */
export default function DailyHandoffControl({ variant, canDispatch, disabled = false, onDispatch, onExtractSlips, onDailyRouteSlip }: Props) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const style = STYLES[variant];

  const close = (refocus = true) => { setOpen(false); if (refocus) trigger.current?.focus(); };
  const items = () => [...(wrapper.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];

  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const onPointer = (event: MouseEvent) => { if (!wrapper.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); list[(index + 1) % list.length]?.focus(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); list[(index - 1 + list.length) % list.length]?.focus(); }
    else if (event.key === 'Home') { event.preventDefault(); list[0]?.focus(); }
    else if (event.key === 'End') { event.preventDefault(); list[list.length - 1]?.focus(); }
    else if (event.key === 'Tab') setOpen(false);
  };
  const choose = (action: () => void) => { close(false); action(); };
  const itemClass = `flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none cursor-pointer`;

  return (
    <div ref={wrapper} role="group" aria-label="Daily handoff" className="relative inline-flex" data-testid={`${variant}-daily-handoff`}>
      {canDispatch && (
        <button type="button" id={`${variant}-dispatch-logistics`} onClick={onDispatch} disabled={disabled} className={style.primary}>
          <Send className="h-3.5 w-3.5" aria-hidden="true" /> Dispatch to Logistics
        </button>
      )}
      <button
        ref={trigger}
        type="button"
        id={`${variant}-daily-handoff-menu`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={canDispatch ? 'More daily handoff outputs' : undefined}
        disabled={disabled}
        onClick={() => setOpen(value => !value)}
        className={`${style.trigger} ${canDispatch ? 'rounded-r-lg border-l-0' : 'rounded-lg'}`}
      >
        {!canDispatch && 'Daily handoff'}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label="Daily handoff outputs" onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-full z-30 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
          <button type="button" role="menuitem" tabIndex={-1} id={`${variant}-extract-slips`} className={itemClass} onClick={() => choose(onExtractSlips)}>
            <FileStack className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" /> Extract Slips (PDF)
          </button>
          <button type="button" role="menuitem" tabIndex={-1} id={`${variant}-tass-daily-route-slip`} className={itemClass} onClick={() => choose(onDailyRouteSlip)}>
            <FileSpreadsheet className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" /> Daily Route Slip (DRR)
          </button>
        </div>
      )}
    </div>
  );
}
