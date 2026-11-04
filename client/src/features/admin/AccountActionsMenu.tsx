import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

/** Portal keeps account actions clear of the scrolling table's clipping boundary. */
export default function AccountActionsMenu({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  const close = (restoreFocus = false) => {
    setPosition(null);
    if (restoreFocus) trigger.current?.focus();
  };
  const open = () => {
    const rect = trigger.current!.getBoundingClientRect();
    setPosition({ top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 200)), right: Math.max(8, window.innerWidth - rect.right) });
  };
  useEffect(() => {
    if (!position) return;
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close();
    };
    const dismiss = () => close();
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [position]);
  return <>
    <button ref={trigger} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={!!position} aria-controls={position ? id : undefined}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700"
      onClick={() => position ? close() : open()} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); open(); } }}>
      <MoreVertical aria-hidden="true" className="h-4 w-4" />
    </button>
    {position && createPortal(<div ref={menu} id={id} role="menu" aria-label={label} style={{ position: 'fixed', ...position }}
      className="z-[100] min-w-44 rounded-lg border border-slate-200 bg-white p-1 shadow-lg [&>button]:flex [&>button]:min-h-10 [&>button]:w-full [&>button]:items-center [&>button]:gap-2 [&>button]:rounded [&>button]:px-3 [&>button]:text-left [&>button:hover]:bg-slate-50 [&>button:focus-visible]:bg-slate-100"
      onClick={event => { if ((event.target as Element).closest('button:not(:disabled)')) close(true); }}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); close(true); }
        if (event.key === 'Tab') close(true);
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const items = [...menu.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
          const index = items.indexOf(document.activeElement as HTMLButtonElement);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
          items[next]?.focus();
        }
      }}>
      {React.Children.map(children, child => React.isValidElement<React.ButtonHTMLAttributes<HTMLButtonElement>>(child) ? React.cloneElement(child, { role: 'menuitem', tabIndex: -1 }) : child)}
    </div>, document.body)}
  </>;
}
