import { useId, useMemo, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { ApiError, type ApiCompany } from '@/api';
import { ActionDialog } from '@/components/ActionDialog';
import { useCompaniesQuery } from '@/api/queries/useCompaniesQuery';
import { useAccountManagersQuery, useCompanyMutations } from '@/api/queries/useAccountManagersQuery';
import { changedFields, companyFormErrors, filterDirectory, normalizeSpaces, statusCounts, type StatusFilter } from './directoryFilters';
import { DirectoryToolbar, Field, RowActions, StatusBadge, TableShell, describedBy, formatUpdated, inputClass } from './DirectoryParts';

type Form = { name: string; sap_number: string; address: string; contact_person: string; default_account_manager_id: string };
const toForm = (row?: ApiCompany): Form => ({ name: row?.name ?? '', sap_number: row?.sap_number ?? '', address: row?.address ?? '',
  contact_person: row?.contact_person ?? '', default_account_manager_id: row?.default_account_manager?.id ?? '' });

export default function CompaniesTab({ canManage }: { canManage: boolean }) {
  const query = useCompaniesQuery();
  const rows = useMemo(() => query.data ?? [], [query.data]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [editing, setEditing] = useState<ApiCompany | 'new' | null>(null);
  const [toggling, setToggling] = useState<ApiCompany | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const visible = filterDirectory(rows, search, status, row => [row.sap_number, row.contact_person, row.address, row.default_account_manager?.name]);

  return (
    <section aria-labelledby="company-directory-heading" className="space-y-4">
      <div>
        <h2 id="company-directory-heading" className="text-sm font-bold text-slate-900">Companies</h2>
        <p className="text-xs text-slate-500">Companies offered on record forms. A default Account Manager fills in automatically on new records.</p>
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
        <TableShell label="Companies" columns={['Company', 'SAP No.', 'Contact person', 'Default AM', 'Status', 'Updated', ...(canManage ? ['Actions'] : [])]}
          empty={visible.length ? null : rows.length ? 'No companies match these filters.' : 'No companies yet. Add the first one.'}>
          {visible.map(row => (
            <tr key={row.id} className="hover:bg-slate-50">
              <td className="max-w-[18rem] px-4 py-3">
                <span className="block font-bold text-slate-900">{row.name}</span>
                {row.address && <span className="block truncate text-[11px] text-slate-500" title={row.address}>{row.address}</span>}
              </td>
              <td className="px-4 py-3 font-mono text-[11px] text-slate-700">{row.sap_number || <span className="font-sans text-amber-700">Missing</span>}</td>
              <td className="px-4 py-3 text-slate-700">{row.contact_person || <span className="text-slate-400">None</span>}</td>
              <td className="px-4 py-3 text-slate-700">
                {row.default_account_manager ? <>{row.default_account_manager.name}{!row.default_account_manager.is_active && <span className="ml-1 text-[10px] font-semibold text-amber-700">(inactive)</span>}</> : <span className="text-slate-400">None</span>}
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
  const amChoices = (managers.data ?? []).filter(am => am.is_active || am.id === form.default_account_manager_id)
    .sort((a, b) => a.name.localeCompare(b.name));
  const set = (key: keyof Form) => (event: { target: { value: string } }) => setForm(value => ({ ...value, [key]: event.target.value }));

  async function save(event?: FormEvent) {
    event?.preventDefault();
    const found = companyFormErrors(form);
    setErrors(found); setServerError(null);
    if (Object.keys(found).length) return;
    const next = { name: normalizeSpaces(form.name), sap_number: form.sap_number.trim(), address: form.address.trim(),
      contact_person: form.contact_person.trim(), default_account_manager_id: form.default_account_manager_id || null };
    try {
      if (row) {
        const changes = changedFields({ name: row.name, sap_number: row.sap_number, address: row.address, contact_person: row.contact_person,
          default_account_manager_id: row.default_account_manager?.id ?? null }, next);
        if (Object.keys(changes).length) await update.mutateAsync({ id: row.id, ...changes, expected_version: row.version });
      } else await create.mutateAsync(next);
      onClose(next.name);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save. Try again.';
      if (error instanceof ApiError && /SAP number/.test(message)) setErrors({ sap_number: message });
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
        <Field id={ids.sap} label="SAP number" required error={errors.sap_number} hint="Must be unique across companies.">
          <input id={ids.sap} value={form.sap_number} maxLength={50} autoComplete="off" className={`${inputClass} font-mono`} onChange={set('sap_number')} {...describedBy(ids.sap, errors.sap_number, 'hint')} />
        </Field>
        <Field id={ids.contact} label="Contact person" error={errors.contact_person}>
          <input id={ids.contact} value={form.contact_person} maxLength={200} autoComplete="off" className={inputClass} onChange={set('contact_person')} {...describedBy(ids.contact, errors.contact_person)} />
        </Field>
        <Field id={ids.address} label="Address" error={errors.address}>
          <textarea id={ids.address} value={form.address} maxLength={1000} rows={2} className={inputClass} onChange={set('address')} {...describedBy(ids.address, errors.address)} />
        </Field>
        <Field id={ids.am} label="Default Account Manager" hint={managers.error ? 'Could not load Account Managers.' : 'Optional. Fills in automatically when this company is picked on a new record.'}>
          <select id={ids.am} value={form.default_account_manager_id} disabled={managers.isPending || !!managers.error} className={inputClass}
            onChange={set('default_account_manager_id')} {...describedBy(ids.am, undefined, 'hint')}>
            <option value="">None</option>
            {amChoices.map(am => <option key={am.id} value={am.id}>{am.name}{am.is_active ? '' : ' (inactive)'}</option>)}
          </select>
        </Field>
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
