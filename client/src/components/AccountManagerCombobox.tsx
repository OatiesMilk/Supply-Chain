import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  inputClassName?: string;
}

export default function AccountManagerCombobox({
  value,
  onChange,
  options,
  placeholder = 'Account Manager',
  inputClassName = '',
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const suggestions = options
    .filter(o => !value || o.toLowerCase().includes(value.toLowerCase()))
    .slice(0, 10);

  return (
    <div className="relative" ref={ref}>
      <div className="relative flex items-center">
        <input
          type="text"
          value={value}
          onChange={e => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className={`${inputClassName}${value ? ' pr-6' : ''}`}
        />
        {value && (
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); onChange(''); setOpen(false); }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[160px] max-w-[240px]">
          {suggestions.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-slate-400 italic">No matches found.</p>
          ) : (
            suggestions.map(s => (
              <button
                key={s}
                type="button"
                onMouseDown={e => { e.preventDefault(); onChange(s); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                {s}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
