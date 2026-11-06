import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Supplier, SupplierCategory } from '@/types/supplier';
import { useAuthStore } from '@/store/authStore';
import { usePermissions } from '@/hooks/usePermissions';
import { useSupplierCategoriesQuery, useSupplierCategoryMutations } from '@/api/queries/useSuppliersQuery';

export function useCanManageSupplierCategories() {
  const role = useAuthStore(state => state.authUser?.role);
  const access = usePermissions();
  return role === 'ADMIN' && access.canWrite('suppliers') && access.canResource('suppliers', 'WRITE');
}
export function SupplierCategoryTags({ supplier }: { supplier: Pick<Supplier, 'categories' | 'category'> }) {
  return <div className="flex flex-wrap gap-1">{supplier.categories.length ? supplier.categories.map(category =>
    <span key={category.id} className="px-2 py-0.5 rounded-full border text-xs bg-slate-50 text-slate-700 border-slate-200 break-words">
      {category.name}{category.is_active ? '' : ' (inactive)'}
    </span>) : <span className="text-xs text-slate-500">{supplier.category || 'Uncategorized'}</span>}</div>;
}
export function SupplierCategorySelect({ categories, selected, onChange, retained = [], disabled = false }: {
  categories: SupplierCategory[]; selected: string[]; retained?: string[]; disabled?: boolean; onChange: (ids: string[]) => void;
}) {
  const choices = categories.filter(category => category.is_active || retained.includes(category.id) || selected.includes(category.id));
  return <fieldset disabled={disabled} className="space-y-2">
    <legend className="font-bold text-slate-700 text-xs mb-2">Categories (select at least one)</legend>
    <div className="max-h-48 overflow-y-auto space-y-2 border border-slate-200 rounded-lg p-3">
      {choices.map(category => <label key={category.id} className="flex gap-2 items-start text-xs text-slate-700">
        <input type="checkbox" checked={selected.includes(category.id)} onChange={event => onChange(event.target.checked
          ? [...selected, category.id] : selected.filter(id => id !== category.id))} />
        <span className="break-words">{category.name}{category.is_active ? '' : retained.includes(category.id)
          ? ' (inactive — existing assignment)' : ' (inactive — remove before saving)'}</span>
      </label>)}
      {!choices.length && <p className="text-xs text-slate-500">No active categories. Ask an Admin to add or reactivate one.</p>}
    </div>
  </fieldset>;
}
const inputClass = 'border border-slate-300 rounded-lg px-3 py-2 text-sm w-full';
const buttonClass = 'border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50';

export function SupplierDialog({ titleId, pending, onClose, children }: { titleId: string; pending: boolean; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} aria-labelledby={titleId} className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-xl max-h-[90vh] overflow-y-auto rounded-xl p-0 border-0 shadow-xl backdrop:bg-black/40"
    onCancel={event => { event.preventDefault(); if (!pending) onClose(); }}>
    <div className="p-5 space-y-4">{children}</div>
  </dialog>;
}

export function SupplierCategoryManager({ onClose }: { onClose: () => void }) {
  const query = useSupplierCategoriesQuery();
  const mutations = useSupplierCategoryMutations();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<SupplierCategory | null>(null);
  const [error, setError] = useState('');
  const busy = mutations.create.isPending || mutations.update.isPending;
  async function save() {
    if (busy) return;
    setError('');
    try {
      if (editing) await mutations.update.mutateAsync({ id: editing.id, name: name.trim(), expected_version: editing.version });
      else await mutations.create.mutateAsync(name.trim());
      setEditing(null); setName('');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Category could not be saved'); }
  }
  return <SupplierDialog titleId="category-manager-title" pending={busy} onClose={onClose}>
      <div className="flex justify-between items-center gap-3"><h2 id="category-manager-title" className="font-bold">Manage Supplier Categories</h2>
        <button type="button" disabled={busy} className={buttonClass} onClick={onClose}>Close</button></div>
      <p className="text-xs text-slate-600">Renaming updates current supplier labels. Deactivation preserves existing assignments and history, and prevents new selections.</p>
      {query.isPending && <p role="status">Loading categories…</p>}
      {query.error && <p role="alert">Categories unavailable. <button type="button" onClick={() => void query.refetch()}>Retry</button></p>}
      <form className="flex gap-2 items-end" onSubmit={event => { event.preventDefault(); void save(); }}>
        <label className="flex-1 text-xs font-semibold">{editing ? 'Rename category' : 'New category name'}
          <input autoFocus required maxLength={120} value={name} disabled={busy} onChange={event => setName(event.target.value)} className={inputClass} /></label>
        <button type="submit" disabled={busy || !name.trim() || !query.data} className={buttonClass}>{busy ? 'Saving…' : editing ? 'Save name' : 'Add Category'}</button>
        {editing && <button type="button" disabled={busy} className={buttonClass} onClick={() => { setEditing(null); setName(''); setError(''); }}>Cancel</button>}
      </form>
      {error && <div role="alert" className="text-sm text-red-700">{error} <button type="button" className="underline" disabled={busy} onClick={async () => {
        await query.refetch(); setEditing(null); setName(''); setError('');
      }}>Refresh catalog</button></div>}
      <ul className="divide-y divide-slate-200">{query.data?.map(category => <li key={category.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm break-words min-w-0">{category.name} <span className="text-xs text-slate-500">({category.is_active ? 'active' : 'inactive'})</span></span>
        <div className="flex gap-2 shrink-0">
          <button type="button" aria-label={`Rename ${category.name}`} className={buttonClass} disabled={busy} onClick={() => { setEditing(category); setName(category.name); setError(''); }}>Rename</button>
          <button type="button" aria-label={`${category.is_active ? 'Deactivate' : 'Reactivate'} ${category.name}`} className={buttonClass} disabled={busy} onClick={async () => {
            setError('');
            try { await mutations.update.mutateAsync({ id: category.id, is_active: !category.is_active, expected_version: category.version }); }
            catch (failure) { setError(failure instanceof Error ? failure.message : 'Category could not be changed'); }
          }}>{category.is_active ? 'Deactivate' : 'Reactivate'}</button>
        </div>
      </li>)}</ul>
  </SupplierDialog>;
}

export function SupplierCategoryEditor({ supplier, onClose }: { supplier: Supplier; onClose: () => void }) {
  const query = useSupplierCategoriesQuery();
  const mutation = useSupplierCategoryMutations().assign;
  // Capture the version and original assignments once. A background refetch
  // must not turn a stale draft into an overwrite of someone else's edit.
  const [original] = useState(() => ({ version: supplier.version, ids: supplier.categories.map(category => category.id) }));
  const [selected, setSelected] = useState(original.ids);
  const [error, setError] = useState('');
  return <form className="space-y-3 border border-slate-200 rounded-xl p-4" onSubmit={async event => {
    event.preventDefault();
    if (mutation.isPending) return;
    setError('');
    try { await mutation.mutateAsync({ id: supplier.id, category_ids: selected, expected_version: original.version }); onClose(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Categories could not be saved'); }
  }}>
    {query.isPending && <p role="status">Loading categories…</p>}
    {query.error && <p role="alert">Categories unavailable. <button type="button" onClick={() => void query.refetch()}>Retry</button></p>}
    {query.data && <SupplierCategorySelect categories={query.data} selected={selected} retained={original.ids} onChange={setSelected} disabled={mutation.isPending} />}
    {error && <p role="alert" className="text-sm text-red-700">{error} Close and reopen this editor after refreshing to load the current supplier version.</p>}
    <div className="flex gap-2"><button type="submit" className={buttonClass} disabled={mutation.isPending || !query.data || !selected.length}>{mutation.isPending ? 'Saving…' : 'Save Categories'}</button>
      <button type="button" className={buttonClass} disabled={mutation.isPending} onClick={onClose}>Cancel</button></div>
  </form>;
}
