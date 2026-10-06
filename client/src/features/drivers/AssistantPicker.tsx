import { useEffect, useId, useRef, useState } from 'react';
import { autoUpdate, flip, FloatingPortal, offset, shift, size, useDismiss, useFloating, useInteractions } from '@floating-ui/react';
import { ChevronDown, Plus, X } from 'lucide-react';

interface Props {
  selected: string[];
  options: string[];
  saving: boolean;
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
}

/** One field-wide option list for both the empty text trigger and the pinned plus. */
export default function AssistantPicker({ selected, options, saving, onAdd, onRemove }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const optionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const typeahead = useRef({ text: '', at: 0 });
  const available = options.filter(name => !selected.includes(name));
  const disabled = saving || available.length === 0;
  const { refs, floatingStyles, context } = useFloating({
    open, onOpenChange: setOpen, placement: 'bottom-start', strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [offset(4), flip({ padding: 12 }), shift({ padding: 12, crossAxis: true }), size({
      padding: 12,
      apply({ rects, availableWidth, availableHeight, elements }) {
        Object.assign(elements.floating.style, {
          width: `${Math.min(rects.reference.width, Math.max(0, availableWidth))}px`,
          maxHeight: `${Math.min(280, Math.max(0, availableHeight))}px`,
        });
      },
    })],
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([useDismiss(context)]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => {
    if (open && activeIndex >= 0) optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);
  const choose = (name: string) => { setOpen(false); setActiveIndex(-1); onAdd(name); };

  return <div>
    <label htmlFor={`${id}-trigger`} className="mb-1 block text-sm font-medium text-slate-700">Assistants</label>
    <div ref={refs.setPositionReference} aria-busy={saving}
      className="relative min-h-[60px] w-full min-w-0 rounded-xl border border-blue-200 bg-blue-50/40 p-2 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-600">
      <div className="flex min-h-11 min-w-0 flex-wrap items-start gap-2 pr-14">
        {selected.map(name => <span key={name} className="inline-flex min-h-11 min-w-0 max-w-full items-center rounded-full bg-slate-100 pl-3 text-sm font-medium text-slate-700">
          <span className="min-w-0 break-words">{name}</span>
          <button type="button" disabled={saving} onClick={() => onRemove(name)} aria-label={`Remove ${name}`}
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full hover:bg-slate-200 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50">
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </span>)}
      </div>
      <button ref={refs.setReference} {...getReferenceProps()} id={`${id}-trigger`} type="button" role="combobox"
        aria-label="Add assistant" aria-expanded={open} aria-haspopup="listbox" aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={open && available[activeIndex] ? `${id}-option-${activeIndex}` : undefined}
        aria-describedby={`${id}-status`} disabled={disabled} title="Add assistant"
        onClick={() => { setActiveIndex(0); setOpen(!open); }}
        onBlur={() => setOpen(false)}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setOpen(true);
            setActiveIndex(index => !open ? event.key === 'ArrowDown' ? 0 : available.length - 1
              : (index + (event.key === 'ArrowDown' ? 1 : -1) + available.length) % available.length);
          } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault(); setOpen(true); setActiveIndex(event.key === 'Home' ? 0 : available.length - 1);
          } else if ((event.key === 'Enter' || event.key === ' ') && open) {
            event.preventDefault(); if (available[activeIndex]) choose(available[activeIndex]);
          } else if (event.key === 'Escape') { setOpen(false); }
          else if (event.key === 'Tab') { setOpen(false); }
          else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && event.key !== ' ') {
            const now = Date.now();
            typeahead.current = { text: (now - typeahead.current.at > 700 ? '' : typeahead.current.text) + event.key.toLowerCase(), at: now };
            const index = available.findIndex(name => name.toLowerCase().startsWith(typeahead.current.text));
            if (index >= 0) { setOpen(true); setActiveIndex(index); }
          }
        }}
        className={selected.length > 0
          ? 'absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-lg text-blue-700 hover:bg-blue-100 active:scale-[0.97] active:bg-blue-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50 disabled:cursor-not-allowed'
          : 'absolute inset-x-2 top-2 flex h-11 items-center justify-between rounded-lg px-2 text-base text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50 disabled:cursor-not-allowed'}>
        {selected.length > 0 ? <Plus aria-hidden="true" className="h-5 w-5" /> : <><span>Add assistant…</span><ChevronDown aria-hidden="true" className="h-4 w-4" /></>}
      </button>
    </div>
    <p id={`${id}-status`} role="status" className="min-h-5 text-xs text-slate-500">
      {saving ? 'Saving changes…' : available.length === 0 ? options.length > 0 ? 'All assistants added.' : 'No assistants available.' : ''}
    </p>
    {open && <FloatingPortal>
      <div ref={refs.setFloating} style={floatingStyles} {...getFloatingProps()} id={`${id}-list`} role="listbox" aria-label="Available assistants"
        className="z-50 overflow-y-auto rounded-lg border border-slate-300 bg-white py-1 text-base shadow-lg">
        <div role="presentation" className="px-3 py-2 text-slate-500">Add assistant…</div>
        {available.map((name, index) => <div key={name} ref={element => { optionRefs.current[index] = element; }}
          id={`${id}-option-${index}`} role="option" aria-selected={false}
          onMouseDown={event => event.preventDefault()} onClick={() => choose(name)} onMouseMove={() => setActiveIndex(index)}
          className={`min-h-11 cursor-pointer break-words px-3 py-2 text-slate-800 ${activeIndex === index ? 'bg-slate-200' : 'hover:bg-slate-100'}`}>{name}</div>)}
      </div>
    </FloatingPortal>}
  </div>;
}
