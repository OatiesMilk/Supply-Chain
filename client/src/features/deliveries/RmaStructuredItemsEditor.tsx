import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { RecordLineItem, RmaItemUnitType } from '@/types';
import { RMA_ITEM_UNIT_TYPES, RMA_STATUS_TAG_PRESETS, rmaItemBlocks } from '@/utils/rmaItems';
import { focusRingBrandClass } from '@/utils/uiClasses';

export type RmaSerialMode = 'single' | 'pair';
type SerialMode = RmaSerialMode;
const trimmed = (value: string | null | undefined) => (value ?? '').trim();

/**
 * Serial-number mode for a row. Saved serial values always win over the local
 * toggle, so a reloaded draft shows the right inputs; a row with no serial
 * values keeps the user's chosen mode.
 */
export function resolveRmaSerialMode(
  item: Pick<RecordLineItem, 'serial_number' | 'new_serial_number' | 'defective_serial_number'> | undefined,
  preferred?: RmaSerialMode,
): RmaSerialMode {
  if (trimmed(item?.new_serial_number) || trimmed(item?.defective_serial_number)) return 'pair';
  if (trimmed(item?.serial_number)) return 'single';
  return preferred ?? 'single';
}
const pairMode = (item: RecordLineItem): SerialMode => resolveRmaSerialMode(item);

export const emptyRmaItem = (): RecordLineItem => ({ sku: '', quantity: 1, unit_type: 'Unit' });

interface RmaStructuredItemsEditorProps {
  idPrefix: string;
  items: RecordLineItem[];
  onChange: (items: RecordLineItem[]) => void;
  error?: string;
}

// Matches the #357 create-form focus treatment so keyboard focus is always visible.
const inputClass = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/25 aria-[invalid=true]:border-red-500';

/** Structured RMA unit/item rows: Qty + Unit Type, model, single SN or replacement pair, purchase/SO, accessories, notes, status tag. */
export function RmaStructuredItemsEditor({ idPrefix, items, onChange, error }: RmaStructuredItemsEditorProps) {
  const [modes, setModes] = useState<SerialMode[]>(() => items.map(pairMode));
  const modeOf = (index: number): SerialMode => resolveRmaSerialMode(items[index], modes[index]);
  const update = (index: number, patch: Partial<RecordLineItem>) => onChange(items.map((item, i) => i === index ? { ...item, ...patch } : item));
  const setMode = (index: number, mode: SerialMode) => {
    setModes(prev => { const next = items.map((item, i) => prev[i] ?? pairMode(item)); next[index] = mode; return next; });
    update(index, mode === 'single' ? { new_serial_number: null, defective_serial_number: null } : { serial_number: null });
  };
  const remove = (index: number) => {
    setModes(prev => items.map((item, i) => prev[i] ?? pairMode(item)).filter((_, i) => i !== index));
    onChange(items.filter((_, i) => i !== index));
  };
  const headingId = `${idPrefix}-heading`;
  const errorId = `${idPrefix}-error`;
  const describedBy = error ? errorId : undefined;
  const field = (index: number, key: keyof RecordLineItem, label: string, placeholder?: string, type = 'text') => {
    // The model is the one required row value, so it carries the editor's error when blank.
    const invalid = key === 'sku' && !!error && !trimmed(items[index].sku);
    return (
      <div className="space-y-1">
        <label htmlFor={`${idPrefix}-${key}-${index}`} className="text-xs font-semibold text-slate-600">{label}</label>
        <input id={`${idPrefix}-${key}-${index}`} type={type} placeholder={placeholder} value={(items[index][key] as string | null | undefined) ?? ''}
          onChange={e => update(index, { [key]: e.target.value })} className={inputClass}
          aria-invalid={invalid || undefined} aria-describedby={invalid ? describedBy : undefined} />
      </div>
    );
  };
  return (
    <div role="group" aria-labelledby={headingId} aria-describedby={describedBy} className="space-y-2 md:col-span-2">
      <div className="flex justify-between items-center">
        <span id={headingId} className="font-bold text-slate-700">Units / Items <span className="text-xs font-normal text-slate-400">(optional)</span></span>
        <button type="button" onClick={() => { setModes(prev => [...items.map((item, i) => prev[i] ?? pairMode(item)), 'single']); onChange([...items, emptyRmaItem()]); }}
          className={`flex items-center gap-1 rounded text-xs font-bold text-brand-blue hover:text-brand-navy cursor-pointer ${focusRingBrandClass}`}>
          <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Add Unit / Item
        </button>
      </div>
      {items.map((item, index) => (
        <fieldset key={index} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <legend className="text-xs font-bold uppercase tracking-wide text-slate-500">Item {index + 1}</legend>
            <button type="button" aria-label={`Remove item ${index + 1}`} onClick={() => remove(index)} className={`p-1 rounded text-slate-400 hover:text-red-500 cursor-pointer ${focusRingBrandClass}`}>
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[6rem_7rem_1fr] gap-2">
            <div className="space-y-1">
              <label htmlFor={`${idPrefix}-quantity-${index}`} className="text-xs font-semibold text-slate-600">Qty</label>
              <input id={`${idPrefix}-quantity-${index}`} type="number" min={1} value={item.quantity}
                onChange={e => update(index, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })} className={inputClass} />
            </div>
            <div className="space-y-1">
              <label htmlFor={`${idPrefix}-unit_type-${index}`} className="text-xs font-semibold text-slate-600">Unit Type</label>
              <select id={`${idPrefix}-unit_type-${index}`} value={item.unit_type ?? ''} onChange={e => update(index, { unit_type: (e.target.value || null) as RmaItemUnitType | null })}
                className={`${inputClass} bg-white`}>
                <option value="">—</option>
                {RMA_ITEM_UNIT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
            {field(index, 'sku', 'Model / Unit Description *', 'e.g., Lenovo ThinkPad E14')}
          </div>
          <div role="radiogroup" aria-label={`Item ${index + 1} serial number mode`} className="flex flex-wrap gap-4 text-xs">
            {(['single', 'pair'] as const).map(mode => (
              <label key={mode} className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name={`${idPrefix}-serial-mode-${index}`} checked={modeOf(index) === mode} onChange={() => setMode(index, mode)} className={focusRingBrandClass} />
                {mode === 'single' ? 'Single Serial Number' : 'Replacement Unit (New SN + Defective SN)'}
              </label>
            ))}
          </div>
          {modeOf(index) === 'single'
            ? <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{field(index, 'serial_number', 'Serial Number')}</div>
            : <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{field(index, 'new_serial_number', 'New SN')}{field(index, 'defective_serial_number', 'Defective SN')}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {field(index, 'purchase_date', 'Date of Purchase', undefined, 'date')}
            {field(index, 'sales_order_no', 'SO#', 'e.g., 12019325')}
            {field(index, 'accessories', 'Accessories', 'e.g., Power Adaptor, Bag')}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {field(index, 'problem_description', 'Problem / Fault Description', 'e.g., No Display Upon Startup')}
            {field(index, 'repair_note', 'Note / Repair Summary', 'e.g., Installed Keyboard')}
          </div>
          <div className="space-y-1">
            <label htmlFor={`${idPrefix}-status_tag-${index}`} className="text-xs font-semibold text-slate-600">Status Tag (printed bold)</label>
            <input id={`${idPrefix}-status_tag-${index}`} type="text" list={`${idPrefix}-status-tag-presets`} value={item.status_tag ?? ''}
              onChange={e => update(index, { status_tag: e.target.value })} placeholder="Choose a preset or type your own" className={inputClass} />
            <div className="flex flex-wrap gap-1.5">
              {RMA_STATUS_TAG_PRESETS.map(tag => (
                <button key={tag} type="button" onClick={() => update(index, { status_tag: tag })} aria-pressed={item.status_tag === tag}
                  className={`px-2 py-0.5 rounded-full border text-[11px] font-bold cursor-pointer ${focusRingBrandClass} ${item.status_tag === tag ? 'border-brand-blue bg-brand-blue/10 text-brand-navy' : 'border-slate-300 text-slate-600 hover:border-slate-400'}`}>
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </fieldset>
      ))}
      <datalist id={`${idPrefix}-status-tag-presets`}>{RMA_STATUS_TAG_PRESETS.map(tag => <option key={tag} value={tag} />)}</datalist>
      {items.length === 0 && <p className="text-xs text-slate-400 italic">No units or items added. The item description above is used when this list is empty.</p>}
      {error && <p id={errorId} role="alert" className="text-red-500 text-xs font-semibold">{error}</p>}
    </div>
  );
}

/** Read-only item blocks with bold quoted status tags; falls back to the legacy description. */
export function RmaStructuredItemsList({ record }: { record: Parameters<typeof rmaItemBlocks>[0] }) {
  const blocks = rmaItemBlocks(record);
  if (!blocks.length) return <p className="text-sm text-slate-400">—</p>;
  return (
    <ul className="space-y-2">
      {blocks.map((block, index) => (
        <li key={index} className="flex gap-3 text-sm">
          {block.qty && <span className="shrink-0 font-bold text-slate-700 tabular-nums">{block.qty}</span>}
          <div className="space-y-0.5">
            {block.lines.map((line, i) => <p key={i} className={line.bold ? 'font-bold text-slate-900' : i === 0 ? 'font-semibold text-slate-800' : 'text-slate-600'}>{line.text}</p>)}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** True if the user entered any value on this row (not just a freshly added blank placeholder). */
export function hasAnyRmaItemInput(item: RecordLineItem): boolean {
  return Boolean(
    trimmed(item.sku) || trimmed(item.serial_number) || trimmed(item.new_serial_number) || trimmed(item.defective_serial_number)
    || trimmed(item.purchase_date) || trimmed(item.sales_order_no) || trimmed(item.accessories)
    || trimmed(item.problem_description) || trimmed(item.repair_note) || trimmed(item.status_tag)
    || (Number.isFinite(item.quantity) && item.quantity !== 1),
  );
}

/**
 * Items as sent to the API: untouched placeholder rows dropped and empty text
 * fields cleared. Any row with input is kept so validation can reject it
 * (for example a missing unit description) instead of silently losing it.
 */
export function cleanRmaItems(items: readonly RecordLineItem[]): RecordLineItem[] {
  const blank = (value: string | null | undefined) => trimmed(value) || null;
  return items
    .filter(hasAnyRmaItemInput)
    .map(item => ({
      sku: trimmed(item.sku), quantity: item.quantity, unit_type: item.unit_type ?? null,
      serial_number: blank(item.serial_number), new_serial_number: blank(item.new_serial_number), defective_serial_number: blank(item.defective_serial_number),
      purchase_date: blank(item.purchase_date), sales_order_no: blank(item.sales_order_no), accessories: blank(item.accessories),
      problem_description: blank(item.problem_description), repair_note: blank(item.repair_note), status_tag: blank(item.status_tag),
    }));
}
