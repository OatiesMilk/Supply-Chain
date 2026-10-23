import React, { useState, useRef, useEffect, useMemo, useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { Field, Input } from '@/components/ui';

interface ComboboxFieldProps {
  id?: string;
  label: string;
  required?: boolean;
  optional?: boolean;
  options: string[];
  optionGroups?: { label: string; options: string[] }[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
}

export default function ComboboxField({
  id,
  label,
  required,
  optional,
  options,
  optionGroups,
  value,
  onChange,
  placeholder,
  error,
}: ComboboxFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listId = `${inputId}-options`;
  const [inputValue, setInputValue] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Keep input text in sync when value is set externally (e.g. Auto Fill)
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const filteredGroups = useMemo(() => {
    if (!optionGroups) return null;
    const q = inputValue.trim().toLowerCase();
    const groups = optionGroups.map(g => ({
      label: g.label,
      options: q ? g.options.filter(o => o.toLowerCase().includes(q)) : g.options,
    })).filter(g => g.options.length > 0);
    return groups.length > 0 ? groups : null;
  }, [optionGroups, inputValue]);

  const filtered = useMemo(() => {
    if (filteredGroups) return filteredGroups.flatMap(g => g.options);
    const q = inputValue.toLowerCase();
    if (!q) return options;
    return options.filter(o => o.toLowerCase().includes(q));
  }, [filteredGroups, options, inputValue]);

  // Close when clicking outside the component
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setHighlighted(-1);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlighted >= 0 && listRef.current) {
      const item = listRef.current.querySelector(`[data-opt="${highlighted}"]`) as HTMLElement | null;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlighted]);

  const commitSelection = (option: string) => {
    setInputValue(option);
    onChange(option);
    setOpen(false);
    setHighlighted(-1);
    inputRef.current?.focus();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setInputValue(text);
    onChange(text);
    setOpen(true);
    setHighlighted(-1);

    // Auto-select when typed text is an exact case-insensitive match
    if (text) {
      const exact = options.find(o => o.toLowerCase() === text.toLowerCase());
      if (exact && exact !== text) {
        // Normalise casing but don't close — still let user see what matched
        setInputValue(exact);
        onChange(exact);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true);
      setHighlighted(e.key === 'ArrowDown' ? 0 : filtered.length - 1);
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlighted(h => (h < filtered.length - 1 ? h + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlighted(h => (h > 0 ? h - 1 : filtered.length - 1));
        break;
      case 'Enter':
        if (!open) break;
        e.preventDefault();
        if (highlighted >= 0 && highlighted < filtered.length) {
          commitSelection(filtered[highlighted]);
        } else if (filtered.length === 1) {
          commitSelection(filtered[0]);
        }
        break;
      case 'Escape':
        setOpen(false);
        setHighlighted(-1);
        break;
    }
  };

  return (
    <div ref={containerRef} className="space-y-1.5">
      <Field id={inputId} label={label} required={required} description={optional ? 'Optional.' : undefined} error={error}>
      {control => <div className="relative">
        <Input
          {...control}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && filtered.length > 0}
          aria-controls={open && filtered.length > 0 ? listId : undefined}
          aria-activedescendant={open && highlighted >= 0 && highlighted < filtered.length ? `${listId}-${highlighted}` : undefined}
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          className="pr-8"
        />
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />

        {open && filtered.length > 0 && (
          <ul
            ref={listRef}
            id={listId}
            aria-label={label}
            role="listbox"
            className="absolute z-50 top-full left-0 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-52 overflow-y-auto"
          >
            {filteredGroups ? (
              filteredGroups.map(group => (
                <React.Fragment key={group.label}>
                  <li role="presentation" className="px-3 py-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 select-none cursor-default sticky top-0 z-10">
                    {group.label}
                  </li>
                  {group.options.map(option => {
                    const idx = filtered.indexOf(option);
                    return (
                      <li
                        key={option}
                        id={`${listId}-${idx}`}
                        role="option"
                        data-opt={idx}
                        aria-selected={idx === highlighted}
                        onMouseDown={(e) => { e.preventDefault(); commitSelection(option); }}
                        className={`min-h-11 px-3 py-2 pl-5 text-xs cursor-pointer select-none ${
                          idx === highlighted ? 'bg-[#0078C1] text-white' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {option}
                      </li>
                    );
                  })}
                </React.Fragment>
              ))
            ) : (
              filtered.map((option, idx) => (
                <li
                  key={option}
                  id={`${listId}-${idx}`}
                  role="option"
                  data-opt={idx}
                  aria-selected={idx === highlighted}
                  onMouseDown={(e) => { e.preventDefault(); commitSelection(option); }}
                  className={`min-h-11 px-3 py-2 text-xs cursor-pointer select-none ${
                    idx === highlighted ? 'bg-[#0078C1] text-white' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {option}
                </li>
              ))
            )}
          </ul>
        )}

        {open && filtered.length === 0 && inputValue.trim() !== '' && (
          <div className="absolute z-50 top-full left-0 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs text-slate-400">
            No matches found
          </div>
        )}
      </div>}
      </Field>
    </div>
  );
}
