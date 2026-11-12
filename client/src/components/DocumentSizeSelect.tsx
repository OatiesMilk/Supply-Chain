import React, { useId } from 'react';
import { DocumentSize } from '@/utils/documentSize';

interface DocumentSizeSelectProps {
  value: DocumentSize;
  onChange: (val: DocumentSize) => void;
  disabled?: boolean;
  inline?: boolean;
}

export default function DocumentSizeSelect({ value, onChange, disabled, inline }: DocumentSizeSelectProps) {
  const id = useId();
  if (inline) {
    return (
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="text-[11px] font-semibold text-slate-600 whitespace-nowrap">
          Document size:
        </label>
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value as DocumentSize)}
          disabled={disabled}
          className="border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#1F3864] disabled:opacity-50"
        >
          <option value="a4">A4</option>
          <option value="letter">Letter</option>
          <option value="legal">Legal</option>
        </select>
      </div>
    );
  }
  return (
    <div className="mb-4">
      <label htmlFor={id} className="block text-xs font-semibold text-slate-700 mb-1">
        Document size <span className="text-slate-400 font-normal ml-1">(Landscape)</span>
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as DocumentSize)}
        disabled={disabled}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 disabled:opacity-50"
      >
        <option value="a4">A4</option>
        <option value="letter">Letter</option>
        <option value="legal">Legal</option>
      </select>
    </div>
  );
}
