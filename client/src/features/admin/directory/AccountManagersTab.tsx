import { useId, useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, UserCheck } from 'lucide-react';
import { api, ApiError, type ApiAccountManager, type ApiAccountManagerOption } from '@/api';
import { ActionDialog } from '@/components/ActionDialog';
import { useAccountManagersQuery, useAccountManagerMutations } from '@/api/queries/useAccountManagersQuery';
import { accountManagerFormErrors, changedFields, filterDirectory, normalizeSpaces, statusCounts, type StatusFilter } from './directoryFilters';
import { DirectoryToolbar, Field, RowActions, StatusBadge, TableShell, describedBy, formatUpdated, inputClass } from './DirectoryParts';

const isAdminRow = (row: ApiAccountManagerOption | ApiAccountManager): row is ApiAccountManager => 'version' in row;
type Form = { name: string; email: string; user_id: string };
const toForm = (row?: ApiAccountManager): Form => ({ name: row?.name ?? '', email: row?.email ?? '', user_id: row?.linked_user?.id ?? '' });

export default function AccountManagersTab({ canManage }: { canManage: boolean }) {
  const query = useAccountManagersQuery();
  const rows = useMemo(() => (query.data ?? []).filter(isAdminRow), [query.data]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [editing, setEditing] = useState<ApiAccountManager | 'new' | null>(null);
  const [toggling, setToggling] = useState<ApiAccountManager | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const visible = filterDirectory(rows, search, status, row => [row.email, row.linked_user?.name]);
  const counts = statusCounts(rows);

  return (
    <section aria-labelledby="am-directory-heading" className="space-y-4">
      <div>
        <h2 id="am-directory-heading" className="text-sm font-bold text-slate-900">Account Managers</h2>
        <p className="text-xs text-slate-500">Names offered on every record form. Link a portal login so AM emails and the 4 PM summary reach the right person.</p>
      </div>
      <DirectoryToolbar label="account managers" search={search} onSearch={setSearch} status={status} onStatus={setStatus} counts={counts}
        addLabel="Add Account Manager" onAdd={() => { setNotice(null); setEditing('new'); }} canManage={canManage} />
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">{notice}</p>}
      {query.isPending ? (
        <p role="status" className="flex items-center justify-center py-12 text-sm text-slate-500"><Loader2 aria-hidden="true" className="mr-2 h-5 w-5 animate-spin" /> Loading account managers…</p>
      ) : query.error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Could not load account managers. <button type="button" className="font-semibold underline" onClick={() => void query.refetch()}>Retry</button>
        </p>
      ) : (
        <TableShell label="Account managers" columns={['Name', 'Email', 'Portal login', 'Status', 'Updated', ...(canManage ? ['Actions'] : [])]}
          empty={visible.length ? null : rows.length ? 'No account managers match these filters.' : 'No account managers yet. Add the first one.'}>
          {visible.map(row => (
            <tr key={row.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-bold text-slate-900">{row.name}</td>
              <td className="px-4 py-3 font-mono text-[11px] text-slate-600">{row.email || <span className="font-sans text-slate-400">None</span>}</td>
              <td className="px-4 py-3">
                {row.linked_user ? (
                  <span className="inline-flex items-center gap-1 text-slate-700">
                    <UserCheck aria-hidden="true" className="h-3.5 w-3.5 text-emerald-600" />{row.linked_user.name}
                    {!row.linked_user.is_active && <span className="text-[10px] font-semibold text-amber-700">(login inactive)</span>}
                  </span>
                ) : <span className="text-[11px] font-semibold text-amber-700">Not linked</span>}
              </td>
              <td className="px-4 py-3"><StatusBadge active={row.is_active} /></td>
              <td className="px-4 py-3 text-slate-500">{formatUpdated(row.updated_at)}</td>
              {canManage && <td className="px-4 py-3"><RowActions name={row.name} active={row.is_active} onEdit={() => { setNotice(null); setEditing(row); }} onToggle={() => { setNotice(null); setToggling(row); }} /></td>}
            </tr>
          ))}
        </TableShell>
      )}
      {editing && <AccountManagerDialog row={editing === 'new' ? undefined : editing} linkedElsewhere={rows}
        onClose={saved => { setEditing(null); if (saved) setNotice(`Saved ${saved}.`); }} />}
      {toggling && <ToggleDialog row={toggling} onClose={saved => { setToggling(null); if (saved) setNotice(saved); }} />}
    </section>
  );
}

function AccountManagerDialog({ row, linkedElsewhere, onClose }: { row?: ApiAccountManager; linkedElsewhere: ApiAccountManager[]; onClose: (saved?: string) => void }) {
  const ids = { name: useId(), email: useId(), user: useId(), form: useId() };
  const { create, update } = useAccountManagerMutations();
  const users = useQuery({ queryKey: ['admin', 'users', 'account-manager-links'], queryFn: () => api.getUsers() });
  const [form, setForm] = useState<Form>(() => toForm(row));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const pending = create.isPending || update.isPending;
  const taken = new Set(linkedElsewhere.filter(other => other.id !== row?.id && other.linked_user).map(other => other.linked_user!.id));
  const choices = (users.data ?? []).filter(user => user.id === form.user_id || (user.is_active && user.role !== 'DRIVER' && !taken.has(user.id)))
    .sort((a, b) => a.name.localeCompare(b.name));

  async function save(event?: FormEvent) {
    event?.preventDefault();
    const found = accountManagerFormErrors(form);
    setErrors(found); setServerError(null);
    if (Object.keys(found).length) return;
    const next = { name: normalizeSpaces(form.name), email: form.email.trim(), user_id: form.user_id || null };
    try {
      if (row) {
        const changes = changedFields({ name: row.name, email: row.email, user_id: row.linked_user?.id ?? null }, next);
        if (Object.keys(changes).length) await update.mutateAsync({ id: row.id, ...changes, expected_version: row.version });
      } else await create.mutateAsync(next);
      onClose(next.name);
    } catch (error) {
      setServerError(error instanceof ApiError && error.status === 409 && /changed by someone else/.test(error.message)
        ? 'Someone else changed this Account Manager. Close this window to see the latest details, then try again.'
        : error instanceof Error ? error.message : 'Could not save. Try again.');
    }
  }

  return (
    <ActionDialog open dismissOnBackdrop={false} title={row ? `Edit ${row.name}` : 'Add Account Manager'} pending={pending} error={serverError}
      description={row ? 'Existing records keep the name they were saved with.' : 'The name appears in the Account Manager list on record forms.'}
      confirmLabel={row ? 'Save changes' : 'Add Account Manager'} onConfirm={() => void save()} onDismiss={() => onClose()}>
      <form id={ids.form} noValidate onSubmit={event => void save(event)} className="space-y-4">
        <Field id={ids.name} label="Name" required error={errors.name} hint="Use the name staff already recognise, for example P. Soriano.">
          <input id={ids.name} value={form.name} maxLength={100} autoFocus autoComplete="off" className={inputClass}
            onChange={event => setForm(value => ({ ...value, name: event.target.value }))} {...describedBy(ids.name, errors.name, 'hint')} />
        </Field>
        <Field id={ids.email} label="Email" error={errors.email} hint="Contact detail. Record emails go to the linked portal login.">
          <input id={ids.email} type="email" value={form.email} maxLength={254} autoComplete="off" className={inputClass}
            onChange={event => setForm(value => ({ ...value, email: event.target.value }))} {...describedBy(ids.email, errors.email, 'hint')} />
        </Field>
        <Field id={ids.user} label="Portal login" hint={users.error ? 'Could not load portal users.' : 'Optional. Active, non-Driver accounts not linked to another Account Manager.'}>
          <select id={ids.user} value={form.user_id} disabled={users.isPending || !!users.error} className={inputClass}
            onChange={event => setForm(value => ({ ...value, user_id: event.target.value }))} {...describedBy(ids.user, undefined, 'hint')}>
            <option value="">Not linked</option>
            {choices.map(user => <option key={user.id} value={user.id}>{user.name} ({user.email}){user.is_active ? '' : ' — inactive'}</option>)}
          </select>
        </Field>
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </ActionDialog>
  );
}

function ToggleDialog({ row, onClose }: { row: ApiAccountManager; onClose: (saved?: string) => void }) {
  const { update } = useAccountManagerMutations();
  const [error, setError] = useState<string | null>(null);
  const deactivate = row.is_active;
  return (
    <ActionDialog open destructive={deactivate} pending={update.isPending} error={error}
      title={deactivate ? `Deactivate ${row.name}?` : `Reactivate ${row.name}?`}
      description={deactivate
        ? 'They will no longer appear on new or edited records. Existing records, reports and the AM Directory keep their name.'
        : 'They will appear again in the Account Manager list on record forms.'}
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
