import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  autoUpdate, flip, offset, shift, size, FloatingFocusManager, FloatingPortal,
  useDismiss, useFloating, useInteractions,
} from '@floating-ui/react';
import { SlidersHorizontal, X } from 'lucide-react';

const boundaryPadding = 12;
const FilterOverlayContext = createContext<string | null>(null);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  onClear: () => void;
  children: ReactNode;
}

/** Shared filter panel with collision-aware, accessible nested suggestions. */
export default function FilterPopover({ open, onOpenChange, count, onClear, children }: Props) {
  const id = useId();
  const { refs, floatingStyles, context } = useFloating({
    open, onOpenChange, placement: 'bottom-end', strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip({ padding: boundaryPadding }), shift({ padding: boundaryPadding, crossAxis: true }), size({
      padding: boundaryPadding,
      apply({ availableWidth, availableHeight, elements }) {
        Object.assign(elements.floating.style, {
          width: `${Math.min(420, Math.max(0, availableWidth))}px`,
          maxHeight: `${Math.max(0, availableHeight)}px`,
        });
      },
    })],
  });
  const dismiss = useDismiss(context, {
    // Suggestions are portaled alongside the panel, so they count as inside clicks.
    outsidePress: event => !(event.target instanceof Element
      && event.target.closest('[data-filter-options-owner]')?.getAttribute('data-filter-options-owner') === id),
    escapeKey: false,
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([dismiss]);

  return <>
    <button ref={refs.setReference} {...getReferenceProps()} type="button"
      aria-label={`Advanced filters${count ? `, ${count} active` : ''}`}
      aria-expanded={open} aria-controls={open ? id : undefined} aria-haspopup="dialog"
      onClick={() => onOpenChange(!open)}
      className={`flex min-h-10 min-w-10 items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg border ${open || count ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'}`}>
      <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
      {count > 0 && <span className="min-w-[18px] px-1 bg-blue-600 text-white text-[10px] rounded-full">{count}</span>}
    </button>
    {open && <FloatingPortal>
      <FloatingFocusManager context={context} modal={false} returnFocus>
        <div ref={refs.setFloating} style={floatingStyles} {...getFloatingProps({
          onKeyDown(event) {
            if (event.key === 'Escape') { event.stopPropagation(); onOpenChange(false); }
          },
        })} id={id} role="dialog" aria-labelledby={`${id}-title`}
          className="z-40 flex flex-col min-h-0 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-3 shrink-0">
            <h2 id={`${id}-title`} className="text-sm font-bold text-slate-800">Advanced Filters</h2>
            <button type="button" aria-label="Close advanced filters" onClick={() => onOpenChange(false)}
              className="min-h-10 min-w-10 flex items-center justify-center rounded-lg hover:bg-slate-100"><X className="w-4 h-4" /></button>
          </div>
          <div className="p-4 space-y-4 min-h-0 overflow-y-auto">
            <FilterOverlayContext.Provider value={id}>{children}</FilterOverlayContext.Provider>
          </div>
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-100 shrink-0">
            <button type="button" disabled={!count} onClick={onClear}
              className="min-h-10 text-xs font-bold text-red-600 disabled:text-slate-400">Clear All Filters</button>
            <button type="button" onClick={() => onOpenChange(false)} className="min-h-10 px-4 bg-[#1F3864] text-white text-xs font-bold rounded-lg">Done</button>
          </div>
        </div>
      </FloatingFocusManager>
    </FloatingPortal>}
  </>;
}

interface ComboboxProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
}

export function FilterCombobox({ label, value, options, onChange, placeholder = 'All' }: ComboboxProps) {
  const id = useId();
  const ownerId = useContext(FilterOverlayContext);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const optionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const suggestions = options.filter(option => !value || option.toLowerCase().includes(value.toLowerCase()));
  const { refs, context, floatingStyles } = useFloating({
    open, onOpenChange: setOpen, placement: 'bottom-start', strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [offset(4), flip({ padding: boundaryPadding }), shift({ padding: boundaryPadding, crossAxis: true }), size({
      padding: boundaryPadding,
      apply({ availableWidth, availableHeight, rects, elements }) {
        Object.assign(elements.floating.style, {
          width: `${Math.min(Math.max(rects.reference.width, 180), Math.max(0, availableWidth))}px`,
          maxHeight: `${Math.min(240, Math.max(0, availableHeight))}px`,
        });
      },
    })],
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([useDismiss(context, { escapeKey: false })]);
  useEffect(() => { setActiveIndex(-1); }, [value, options]);
  useEffect(() => {
    if (open && activeIndex >= 0) optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);
  const choose = (option: string) => { onChange(option); setOpen(false); setActiveIndex(-1); };

  return <div className="min-w-0">
    <label htmlFor={id} className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
    <div className="relative">
      <input ref={refs.setReference} {...getReferenceProps()} id={id} role="combobox" type="text"
        aria-autocomplete="list" aria-expanded={open} aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={open && activeIndex >= 0 && suggestions[activeIndex] ? `${id}-option-${activeIndex}` : undefined}
        value={value} placeholder={placeholder}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        onChange={event => { onChange(event.target.value); setOpen(true); }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setOpen(true);
            setActiveIndex(index => suggestions.length === 0 ? -1 : event.key === 'ArrowDown'
              ? (index + 1) % suggestions.length : index <= 0 ? suggestions.length - 1 : index - 1);
          } else if (event.key === 'Enter' && open && activeIndex >= 0 && suggestions[activeIndex]) {
            event.preventDefault(); choose(suggestions[activeIndex]);
          } else if (event.key === 'Escape' && open) {
            event.preventDefault(); event.stopPropagation(); setOpen(false);
          } else if (event.key === 'Tab') { setOpen(false); }
        }}
        className="w-full min-h-10 border border-slate-200 rounded-lg pl-2.5 pr-10 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#0078C1]" />
      {value && <button type="button" aria-label={`Clear ${label}`} onClick={() => { onChange(''); setOpen(false); }}
        className="absolute right-0 top-0 min-h-10 min-w-10 flex items-center justify-center text-slate-500"><X className="w-3.5 h-3.5" /></button>}
    </div>
    {open && <FloatingPortal>
      <div ref={refs.setFloating} style={floatingStyles} {...getFloatingProps()} data-filter-options-owner={ownerId ?? undefined}
        id={`${id}-list`} role="listbox" aria-label={`${label} suggestions`}
        className="z-50 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg py-1">
        {suggestions.length === 0 && <div role="status" className="px-3 py-2 text-xs text-slate-500">No matches found</div>}
        {suggestions.map((option, index) => <div key={option} ref={element => { optionRefs.current[index] = element; }}
          id={`${id}-option-${index}`} role="option" aria-selected={value === option}
          onMouseDown={event => event.preventDefault()} onClick={() => choose(option)} onMouseMove={() => setActiveIndex(index)}
          className={`px-3 py-2 text-xs cursor-pointer break-words ${activeIndex === index ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-50'}`}>{option}</div>)}
      </div>
    </FloatingPortal>}
  </div>;
}
