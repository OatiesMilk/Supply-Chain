import { useId, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Loader2, X } from 'lucide-react';
import { ApiError, type ApiAccountManagerOption, type ApiCompany } from '@/api';
import { ActionDialog } from '@/components/ActionDialog';
import { useCompaniesQuery } from '@/api/queries/useCompaniesQuery';
import { useAccountManagersQuery, useCompanyMutations } from '@/api/queries/useAccountManagersQuery';
import { companySapNumbers } from '@/utils/accountDirectory';
import { changedFields, companyFormErrors, filterDirectory, normalizeSpaces, statusCounts, type StatusFilter } from './directoryFilters';
import { DirectoryToolbar, Field, RowActions, StatusBadge, TableShell, describedBy, formatUpdated, inputClass } from './DirectoryParts';

type Form = { name: string; sap_numbers: string[]; pending_sap: string; address: string; contact_person: string; account_manager_ids: string[] };
/** Assigned Account Managers; payloads from before multi-AM support carry only the single default. */
const assignedManagers = (row?: ApiCompany): ApiAccountManagerOption[] =>
  row?.account_managers ?? (row?.default_account_manager ? [row.default_account_manager] : []);
const toForm = (row?: ApiCompany): Form => ({ name: row?.name ?? '', sap_numbers: companySapNumbers(row), pending_sap: '', address: row?.address ?? '',
  contact_person: row?.contact_person ?? '', account_manager_ids: assignedManagers(row).map(am => am.id) });
const sortedIds = (ids: readonly string[]) => [...ids].sort();
const none = <span className="text-slate-400">None</span>;
const pill = 'inline-flex max-w-full items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700';

export default function CompaniesTab({ canManage }: { canManage: boolean }) {
  const query = useCompaniesQuery();
  const rows = useMemo(() => query.data ?? [], [query.data]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [editing, setEditing] = useState<ApiCompany | 'new' | null>(null);
  const [toggling, setToggling] = useState<ApiCompany | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const visible = filterDirectory(rows, search, status, row => [...companySapNumbers(row), row.contact_person, row.address,
    ...assignedManagers(row).map(am => am.name)]);

  return (
    <section aria-labelledby="company-directory-heading" className="space-y-4">
      <div>
        <h2 id="company-directory-heading" className="text-sm font-bold text-slate-900">Companies</h2>
        <p className="text-xs text-slate-500">Companies offered on record forms. SAP numbers are optional. When a company has exactly one Account Manager, new records fill it in; with several, the record form lists them first.</p>
      </div>
      <DirectoryToolbar label="companies" search={search} onSearch={setSearch} status={status} onStatus={setStatus} counts={statusCounts(rows)}
        addLabel="Add Company" onAdd={() => { setNotice(null); setEditing('new'); }} canManage={canManage} />
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">{notice}</p>}
      {query.isPending ? (
        <p role="status" className="flex items-center justify-center py-12 text-sm text-slate-500"><Loader2 aria-hidden="true" className="mr-2 h-5 w-5 animate-spin" /> Loading companies…</p>
      ) : query.error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Could not load companies. <button type="button" className="font-semibold underline" onClick={() => void query.refetch()}>Retry</button>
        </p>
      ) : (
        <TableShell label="Companies" columns={['Company', 'SAP No(s).', 'Contact person', 'Account Manager(s)', 'Status', 'Updated', ...(canManage ? ['Actions'] : [])]}
          empty={visible.length ? null : rows.length ? 'No companies match these filters.' : 'No companies yet. Add the first one.'}>
          {visible.map(row => (
            <tr key={row.id} className="hover:bg-slate-50">
              <td className="max-w-[18rem] px-4 py-3">
                <span className="block font-bold text-slate-900">{row.name}</span>
                {row.address && <span className="block truncate text-xs text-slate-500" title={row.address}>{row.address}</span>}
              </td>
              <td className="max-w-[14rem] px-4 py-3">
                {companySapNumbers(row).length
                  ? <ul className="flex flex-wrap gap-1" aria-label={`SAP numbers of ${row.name}`}>{companySapNumbers(row).map(sap => <li key={sap} className={`${pill} tabular-nums`}>{sap}</li>)}</ul>
                  : none}
              </td>
              <td className="px-4 py-3 text-slate-700">{row.contact_person || <span className="text-slate-400">None</span>}</td>
              <td className="max-w-[16rem] px-4 py-3">
                {assignedManagers(row).length
                  ? <ul className="flex flex-wrap gap-1" aria-label={`Account Managers of ${row.name}`}>{assignedManagers(row).map(am => (
                    <li key={am.id} className={pill}>{am.name}{!am.is_active && <span className="ml-1 font-semibold text-amber-700">(inactive)</span>}</li>
                  ))}</ul>
                  : none}
              </td>
              <td className="px-4 py-3"><StatusBadge active={row.is_active} /></td>
              <td className="px-4 py-3 text-slate-500">{formatUpdated(row.updated_at)}</td>
              {canManage && <td className="px-4 py-3"><RowActions name={row.name} active={row.is_active} onEdit={() => { setNotice(null); setEditing(row); }} onToggle={() => { setNotice(null); setToggling(row); }} /></td>}
            </tr>
          ))}
        </TableShell>
      )}
      {editing && <CompanyDialog row={editing === 'new' ? undefined : editing} onClose={saved => { setEditing(null); if (saved) setNotice(`Saved ${saved}.`); }} />}
      {toggling && <ToggleDialog row={toggling} onClose={saved => { setToggling(null); if (saved) setNotice(saved); }} />}
    </section>
  );
}

function CompanyDialog({ row, onClose }: { row?: ApiCompany; onClose: (saved?: string) => void }) {
  const ids = { name: useId(), sap: useId(), contact: useId(), address: useId(), am: useId(), form: useId() };
  const { create, update } = useCompanyMutations();
  const managers = useAccountManagersQuery();
  const [form, setForm] = useState<Form>(() => toForm(row));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const pending = create.isPending || update.isPending;
  const retained = assignedManagers(row);
  // Active Account Managers plus any inactive one this company already has (it may be kept or removed).
  const activeManagers = (managers.data ?? []).filter(am => am.is_active);
  const amChoices = [...activeManagers, ...retained.filter(am => !activeManagers.some(live => live.id === am.id)).map(am => ({ ...am, is_active: false }))]
    .sort((a, b) => a.name.localeCompare(b.name));
  const set = (key: 'name' | 'address' | 'contact_person' | 'pending_sap') => (event: { target: { value: string } }) =>
    setForm(value => ({ ...value, [key]: event.target.value }));

  /** Moves the typed SAP number into the list; returns the list including it. */
  function commitPendingSap(current: Form): Form | null {
    const sap = current.pending_sap.trim();
    if (!sap) return { ...current, pending_sap: '' };
    const found = companyFormErrors({ ...current, pending_sap: sap });
    if (found.sap_numbers) { setErrors(value => ({ ...value, sap_numbers: found.sap_numbers })); return null; }
    return { ...current, sap_numbers: [...current.sap_numbers, sap], pending_sap: '' };
  }
  function addSap() {
    const next = commitPendingSap(form);
    if (!next) return;
    setForm(next);
    setErrors(value => { const rest = { ...value }; delete rest.sap_numbers; return rest; });
  }
  function onSapKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault(); // Enter adds the SAP number instead of submitting the dialog.
    addSap();
  }
  const removeSap = (sap: string) => setForm(value => ({ ...value, sap_numbers: value.sap_numbers.filter(entry => entry !== sap) }));
  const toggleAm = (id: string, checked: boolean) => setForm(value => ({ ...value,
    account_manager_ids: checked ? [...value.account_manager_ids, id] : value.account_manager_ids.filter(entry => entry !== id) }));

  async function save(event?: FormEvent) {
    event?.preventDefault();
    const committed = commitPendingSap(form);
    if (!committed) return;
    setForm(committed);
    const found = companyFormErrors(committed);
    setErrors(found); setServerError(null);
    if (Object.keys(found).length) return;
    const next = { name: normalizeSpaces(committed.name), sap_numbers: committed.sap_numbers.map(sap => sap.trim()), address: committed.address.trim(),
      contact_person: committed.contact_person.trim(), account_manager_ids: sortedIds(committed.account_manager_ids) };
    try {
      if (row) {
        const changes = changedFields({ name: row.name, sap_numbers: companySapNumbers(row), address: row.address, contact_person: row.contact_person,
          account_manager_ids: sortedIds(retained.map(am => am.id)) }, next);
        if (Object.keys(changes).length) await update.mutateAsync({ id: row.id, ...changes, expected_version: row.version });
      } else await create.mutateAsync(next);
      onClose(next.name);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save. Try again.';
      if (error instanceof ApiError && /SAP number/.test(message)) setErrors({ sap_numbers: message });
      else if (error instanceof ApiError && /already exists/.test(message)) setErrors({ name: message });
      else setServerError(/changed by someone else/.test(message)
        ? 'Someone else changed this company. Close this window to see the latest details, then try again.' : message);
    }
  }

  return (
    <ActionDialog open title={row ? `Edit ${row.name}` : 'Add Company'} pending={pending} error={serverError}
      description={row ? 'Changes apply to new and edited records. Existing records stay linked to this company.' : 'The company appears in the Company Name list on record forms.'}
      confirmLabel={row ? 'Save changes' : 'Add Company'} onConfirm={() => void save()} onDismiss={() => onClose()}>
      <form id={ids.form} noValidate onSubmit={event => void save(event)} className="space-y-4">
        <Field id={ids.name} label="Company name" required error={errors.name}>
          <input id={ids.name} value={form.name} maxLength={200} autoFocus autoComplete="organization" className={inputClass} onChange={set('name')} {...describedBy(ids.name, errors.name)} />
        </Field>
        <Field id={ids.sap} label="SAP number(s)" error={errors.sap_numbers}
          hint="Optional — walk-in clients may have none yet. Add each SAP number; each must be unique across companies.">
          {form.sap_numbers.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="SAP numbers to save">
              {form.sap_numbers.map(sap => (
                <li key={sap} className={`${pill} gap-1 tabular-nums`}>
                  {sap}
                  <button type="button" aria-label={`Remove SAP number ${sap}`} onClick={() => removeSap(sap)}
                    className="rounded-full p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800">
                    <X aria-hidden="true" className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input id={ids.sap} value={form.pending_sap} maxLength={50} autoComplete="off" placeholder="e.g., SAP-88231"
              className={`${inputClass} tabular-nums`} onChange={set('pending_sap')} onKeyDown={onSapKey} {...describedBy(ids.sap, errors.sap_numbers, 'hint')} />
            <button type="button" onClick={addSap} disabled={!form.pending_sap.trim()}
              className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Add</button>
          </div>
        </Field>
        <Field id={ids.contact} label="Contact person" error={errors.contact_person}>
          <input id={ids.contact} value={form.contact_person} maxLength={200} autoComplete="off" className={inputClass} onChange={set('contact_person')} {...describedBy(ids.contact, errors.contact_person)} />
        </Field>
        <Field id={ids.address} label="Address" error={errors.address}>
          <textarea id={ids.address} value={form.address} maxLength={1000} rows={2} className={inputClass} onChange={set('address')} {...describedBy(ids.address, errors.address)} />
        </Field>
        <fieldset disabled={managers.isPending || !!managers.error} className="space-y-1.5" aria-describedby={`${ids.am}-hint`}>
          <legend className="block text-xs font-bold text-slate-700">Account Manager(s)</legend>
          <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
            {amChoices.map(am => (
              <label key={am.id} className="flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" className="mt-0.5" checked={form.account_manager_ids.includes(am.id)} onChange={event => toggleAm(am.id, event.target.checked)} />
                <span className="break-words">{am.name}{!am.is_active && <span className="ml-1 text-xs font-semibold text-amber-700">(inactive — existing assignment)</span>}</span>
              </label>
            ))}
            {!amChoices.length && <p className="text-xs text-slate-500">{managers.isPending ? 'Loading Account Managers…' : 'No active Account Managers yet.'}</p>}
          </div>
          <p id={`${ids.am}-hint`} className="text-xs text-slate-500">
            {managers.error ? 'Could not load Account Managers.' : 'Optional. One Account Manager fills in automatically on new records; with several, the record form lists them first.'}
          </p>
        </fieldset>
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </ActionDialog>
  );
}

function ToggleDialog({ row, onClose }: { row: ApiCompany; onClose: (saved?: string) => void }) {
  const { update } = useCompanyMutations();
  const [error, setError] = useState<string | null>(null);
  const deactivate = row.is_active;
  return (
    <ActionDialog open destructive={deactivate} pending={update.isPending} error={error}
      title={deactivate ? `Deactivate ${row.name}?` : `Reactivate ${row.name}?`}
      description={deactivate
        ? 'It will no longer be offered on new records. Existing records stay linked to it and keep showing its name.'
        : 'It will be offered again on record forms.'}
      confirmLabel={deactivate ? 'Deactivate' : 'Reactivate'} onDismiss={() => onClose()}
      onConfirm={async () => {
        setError(null);
        try {
          await update.mutateAsync({ id: row.id, is_active: !deactivate, expected_version: row.version });
          onClose(`${row.name} is now ${deactivate ? 'inactive' : 'active'}.`);
        } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save. Try again.'); }
      }} />
  );
}
