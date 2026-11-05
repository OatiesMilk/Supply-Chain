import { useRef, useState, type FormEvent } from 'react';
import type { CreateSupplierInput } from '@/types/supplier';
import { useSupplierCategoriesQuery } from '@/api/queries/useSuppliersQuery';
import { SupplierCategorySelect, SupplierDialog } from './SupplierCategories';

export default function CreateSupplierForm({ onSave, onClose }: { onSave: (data: CreateSupplierInput) => Promise<void>; onClose: () => void }) {
  const query = useSupplierCategoriesQuery();
  const [form, setForm] = useState({ name: '', contact_person: '', email: '', phone: '', address: '', city: '', category_ids: [] as string[] });
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    if (!form.name.trim() || !form.category_ids.length) { setError('Supplier name and at least one category are required.'); return; }
    if (form.category_ids.some(id => !query.data?.some(category => category.id === id && category.is_active))) {
      setError('Remove inactive or unavailable categories before saving.'); return;
    }
    submitting.current = true; setSaving(true); setError('');
    try { await onSave({ ...form, name: form.name.trim() }); onClose(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Supplier could not be saved'); }
    finally { submitting.current = false; setSaving(false); }
  }
  return <SupplierDialog titleId="new-supplier-title" pending={saving} onClose={onClose}>
      <h2 id="new-supplier-title" className="font-bold mb-4">New Supplier</h2>
      <form onSubmit={submit} className="space-y-4 text-xs">
        <fieldset disabled={saving} className="grid grid-cols-2 gap-3">
          {([['name', 'Supplier Name'], ['contact_person', 'Contact Person'], ['email', 'Email'], ['phone', 'Phone'], ['city', 'City'], ['address', 'Address']] as const).map(([key, label]) =>
            <label key={key} className={`font-semibold text-slate-700 ${key === 'name' || key === 'address' ? 'col-span-2' : ''}`}>
              {label}{key === 'name' ? ' *' : ''}<input required={key === 'name'} maxLength={key === 'address' ? 1000 : 250}
                type={key === 'email' ? 'email' : 'text'} value={form[key]} onChange={event => setForm(value => ({ ...value, [key]: event.target.value }))}
                className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg" />
            </label>)}
        </fieldset>
        {query.isPending && <p role="status">Loading categories…</p>}
        {query.error && <p role="alert">Categories unavailable. <button type="button" onClick={() => void query.refetch()}>Retry</button></p>}
        {query.data && <SupplierCategorySelect categories={query.data} selected={form.category_ids} disabled={saving} onChange={category_ids => setForm(value => ({ ...value, category_ids }))} />}
        {error && <p role="alert" className="text-red-700">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
          <button type="button" disabled={saving} onClick={onClose} className="px-4 py-2 border border-slate-300 rounded-lg disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={saving || !query.data} className="px-4 py-2 bg-[#1F3864] text-white rounded-lg disabled:opacity-50">{saving ? 'Creating…' : 'Create Supplier'}</button>
        </div>
      </form>
  </SupplierDialog>;
}
