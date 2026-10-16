import { useState, type FormEvent } from 'react';
import type { ApiSku } from '@/api';
import { useCreateSkuMutation } from '@/api/queries/useSkusQuery';

export default function CreateSkuForm({ onCreated, onCancel }: {
  onCreated: (sku: ApiSku) => void;
  onCancel: () => void;
}) {
  const create = useCreateSkuMutation();
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState({ sku_code: '', name: '', category: 'A', unit_cost: '', unit_price: '', reorder_point: '0', description: '', warehouse_location: '' });
  const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';
  const change = (key: keyof typeof fields, value: string) => setFields(previous => ({ ...previous, [key]: value }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (create.isPending) return;
    setError(null);
    try {
      const saved = await create.mutateAsync({
        ...fields, sku_code: fields.sku_code.trim(), name: fields.name.trim(),
        unit_cost: Number(fields.unit_cost), unit_price: Number(fields.unit_price), reorder_point: Number(fields.reorder_point),
      });
      onCreated(saved);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to create SKU. Please try again.');
    }
  }

  return (
    <form onSubmit={submit} aria-label="Create SKU" className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
      <h2 className="font-semibold text-slate-800">Create SKU</h2>
      <p className="text-sm text-slate-500">New SKUs start with zero stock. Record stock receipts separately in the Inventory tab.</p>
      <fieldset disabled={create.isPending} className="grid gap-3 md:grid-cols-3">
        <label className="text-sm">SKU code<input autoFocus required maxLength={100} value={fields.sku_code} onChange={e => change('sku_code', e.target.value)} className={inputClass} /></label>
        <label className="text-sm">Product name<input required maxLength={200} value={fields.name} onChange={e => change('name', e.target.value)} className={inputClass} /></label>
        <label className="text-sm">Category<select value={fields.category} onChange={e => change('category', e.target.value)} className={inputClass}>
          <option value="A">A — High Value</option><option value="B">B — Medium Value</option><option value="C">C — Consumables / Low Value</option>
        </select></label>
        <label className="text-sm">Unit cost<input type="number" required min="0" step="any" value={fields.unit_cost} onChange={e => change('unit_cost', e.target.value)} className={inputClass} /></label>
        <label className="text-sm">Unit price<input type="number" required min="0" step="any" value={fields.unit_price} onChange={e => change('unit_price', e.target.value)} className={inputClass} /></label>
        <label className="text-sm">Reorder point<input type="number" required min="0" max="2147483647" step="1" value={fields.reorder_point} onChange={e => change('reorder_point', e.target.value)} className={inputClass} /></label>
        <label className="text-sm md:col-span-3">Warehouse location (optional)<input placeholder="TBD" value={fields.warehouse_location} onChange={e => change('warehouse_location', e.target.value)} className={inputClass} /></label>
        <label className="text-sm md:col-span-3">Description<textarea value={fields.description} onChange={e => change('description', e.target.value)} className={inputClass} /></label>
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={create.isPending} className="rounded-lg bg-[#0078C1] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{create.isPending ? 'Creating…' : 'Save SKU'}</button>
        <button type="button" disabled={create.isPending} onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancel</button>
      </div>
    </form>
  );
}
