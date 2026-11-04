import React, { useEffect, useRef, useState } from 'react';
import { api, ApiError, type ApiUserAdmin } from '@/api';
import { useAuthStore } from '@/store/authStore';
import type { PolicyRow, RolePermissionEditor, UserPermissionEditor, PolicyCatalogEntry } from '@/types/permissionEditor';
import { Eye, Pencil, Search, ShieldCheck, Users, SlidersHorizontal } from 'lucide-react';
import PermissionsPanel from './PermissionsPanel';
import PolicyMatrix from './PolicyMatrix';
import PolicyLoadFailure from './PolicyLoadFailure';
import { assignedAccountCount, filterRoles, groupPolicyCatalog, policyLabel, selectedPermissionCount, SCOPE_LABELS, type AssignmentFilter, type ScopeFilter } from './policyPresentation';

export const BUILTIN_ROLES = ['SALES_COORDINATOR', 'LOGISTICS', 'TASS', 'ADMIN', 'DRIVER'] as const;
type Editor = RolePermissionEditor | UserPermissionEditor;
export const policyMap = (rows: PolicyRow[]) => Object.fromEntries(rows.map(p => [p.permissionKey, p.effect]));
export function policyChanges(before: PolicyRow[], after: PolicyRow[]) {
  const a = policyMap(before), b = policyMap(after);
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort().filter(key => a[key] !== b[key])
    .map(key => ({ key, before: a[key] ?? 'INHERIT', after: b[key] ?? 'INHERIT' }));
}
export function protectedPolicyKey(role: string, p: PolicyCatalogEntry) {
  return role === 'ADMIN' && (p.scope === 'SCREEN' && p.module === 'admin' || p.scope === 'RESOURCE' && ['users', 'admin'].includes(p.module));
}
const label = (value: string) => value.replaceAll('_', ' ').toLowerCase();
const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700';
const button = `rounded border px-3 py-2 text-sm disabled:opacity-50 ${focus}`;
export function dependencyIssues(catalog: PolicyCatalogEntry[], draft: PolicyRow[], defaults: PolicyRow[] = []) {
  const requested = { ...policyMap(defaults), ...policyMap(draft) };
  return catalog.filter(p => requested[p.key] === 'ALLOW' && p.action !== 'READ' && (
    requested[`${p.scope}:${p.module}:READ`] !== 'ALLOW' || p.action !== 'WRITE' && requested[`${p.scope}:${p.module}:WRITE`] !== 'ALLOW'
  )).map(p => `${p.key} requires ${p.action === 'WRITE' ? 'Read' : 'Read and Write'} in this policy.`);
}

export function PolicyEditor({ role, user, users = [], usersAvailable = true, viewOnly = false, onClose }: { role: string; user?: ApiUserAdmin; users?: ApiUserAdmin[]; usersAvailable?: boolean; viewOnly?: boolean; onClose: () => void }) {
  const root = useRef<HTMLElement>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [ceiling, setCeiling] = useState<RolePermissionEditor | null>(null);
  const [draft, setDraft] = useState<PolicyRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState<Editor | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [reset, setReset] = useState(false);
  const [filter, setFilter] = useState('');
  const [scope, setScope] = useState<ScopeFilter>('ALL');
  const [editing, setEditing] = useState(!viewOnly);
  const [loadFailure, setLoadFailure] = useState<unknown>(null);
  const changes = editor ? policyChanges(editor.permissions, draft) : [];
  const dirty = changes.length > 0 || reset;
  const read = async () => {
    const policy = await api.getRolePermissionEditor(role);
    const next = user ? await api.getUserPermissionEditor(user.id) : policy;
    if (next.contractVersion !== 1 || next.catalogVersion !== 1 || next.role !== role || policy.catalog.some(p => typeof p.canAllow !== 'boolean')) throw new Error('Unsupported policy editor contract');
    setCeiling(policy); return next;
  };
  useEffect(() => {
    let live = true;
    setBusy(true);
    read().then(next => { if (live) { setEditor(next); setDraft(next.permissions); } }).catch(e => { if (live) { setError(e.message); setLoadFailure(e); } }).finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [role, user?.id]);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const leave = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && !root.current?.contains(target) && target.closest('button,a,[role="button"]') && !window.confirm('Leave this editor and discard unsaved permission changes?')) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', prevent);
    document.addEventListener('click', leave, true);
    return () => { window.removeEventListener('beforeunload', prevent); document.removeEventListener('click', leave, true); };
  }, [dirty]);
  const close = () => { if (!dirty || window.confirm('Discard unsaved permission changes?')) onClose(); };
  const change = (key: string, effect: string) => {
    setDraft(rows => [...rows.filter(p => p.permissionKey !== key), ...(effect === 'INHERIT' ? [] : [{ permissionKey: key, effect: effect as PolicyRow['effect'] }])]);
    setReset(false); setReviewed(false); setNotice('');
  };
  const save = async () => {
    if (!editor || !editing || busy || !dirty || editor.activeMode !== 'V1' || conflict && !reviewed
      || 'conversionStatus' in editor && editor.conversionStatus !== 'CONVERTED'
      || dependencyIssues(editor.catalog, draft, 'roleDefaults' in editor ? editor.roleDefaults : []).length > 0) return;
    setBusy(true); setError('');
    try {
      const body = { contractVersion: 1 as const, catalogVersion: 1 as const, expectedVersion: editor.expectedVersion, permissions: draft };
      const next = user ? reset ? await api.resetUserPermissionEditor(user.id, editor.expectedVersion) : await api.saveUserPermissionEditor(user.id, body) : await api.saveRolePermissionEditor(role, body);
      setEditor(next); setDraft(next.permissions); setReset(false); setConflict(false); setLatest(null); setReviewed(false); setNotice('Permissions saved. The server returned the current policy.');
      if (!user || useAuthStore.getState().authUser?.id === user.id) await useAuthStore.getState().refreshPermissions();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save permissions');
      if (e instanceof ApiError && e.details?.userIds?.length) setError(`${e.message}. Affected accounts: ${e.details.userIds.join(', ')}`);
      if (e instanceof ApiError && e.status === 409) { setConflict(true); setReviewed(false); setLatest(null); }
    } finally { setBusy(false); }
  };
  const refresh = async () => {
    setBusy(true); setError(''); setReviewed(false);
    try { setLatest(await read()); } catch (e) { setError(e instanceof Error ? e.message : 'Refresh failed'); } finally { setBusy(false); }
  };
  const retryRead = async () => {
    setBusy(true); setError('');
    try { const next = await read(); setEditor(next); setDraft(next.permissions); setLoadFailure(null); }
    catch (failure) { setLoadFailure(failure); setError(failure instanceof Error ? failure.message : 'Unable to load policies'); }
    finally { setBusy(false); }
  };
  const values = policyMap(draft);
  const savedUser = editor && 'snapshot' in editor ? editor : null;
  const dependencyErrors = editor ? dependencyIssues(editor.catalog, draft, savedUser?.roleDefaults) : [];
  const groups = groupPolicyCatalog(editor?.catalog ?? [], filter, scope);
  const disabled = busy || !editing || editor?.activeMode !== 'V1' || savedUser?.conversionStatus === 'REQUIRED';
  const canEdit = editor?.activeMode === 'V1' && savedUser?.conversionStatus !== 'REQUIRED';
  const assigned = assignedAccountCount(users, role, usersAvailable);
  return <section ref={root} aria-label={`${user ? user.name : label(role)} permission editor`} className="min-w-0 space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><p className="mb-2 text-xs font-medium text-slate-500">Roles &amp; Permissions <span aria-hidden="true">/</span> {user ? 'Individual account' : 'Role policy'}</p>
        <h3 className="text-xl font-bold text-slate-900">{user ? user.name : policyLabel(role)}</h3>
        <p className="mt-1 text-sm text-slate-500">{user ? `${user.email} · ${policyLabel(role)} · Individual exceptions` : `Role defaults · ${assigned === null ? 'Account count unavailable' : `${assigned} assigned account${assigned === 1 ? '' : 's'}`}`}</p>
      </div>
      <div className="flex gap-2">{!editing && canEdit && <button type="button" className={`${button} flex min-h-11 items-center gap-2 bg-blue-700 font-semibold text-white`} disabled={busy} onClick={() => setEditing(true)}><Pencil aria-hidden="true" className="h-4 w-4" />Edit permissions</button>}<button type="button" className={`${button} min-h-11`} onClick={close} disabled={busy}>Close editor</button></div>
    </div>
    {busy && <p role="status">Loading policy…</p>}
    {error && (loadFailure && !editor ? <PolicyLoadFailure error={loadFailure} busy={busy} onRetry={retryRead} /> : <p role="alert" className="text-red-700">{error}</p>)}
    {notice && <p role="status">{notice}</p>}
    {editor && <>
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600"><p><span className={`mr-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${editor.activeMode === 'V1' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{editor.activeMode === 'V1' ? 'Active policy' : 'Read-only candidate'}</span>{editor.activeMode === 'LEGACY' ? 'Candidate V1 policy only. Current legacy permissions remain active; editing is unavailable until coordinated activation and migration review.' : !editing ? 'Viewing the saved server policy. Select Edit permissions to make changes.' : 'Changes take effect after saving.'}</p></div>
      {savedUser?.conversionStatus === 'REQUIRED' && <p role="alert">Account conversion requires operator verification before editing.</p>}
      <p className="text-sm">Read is required for Write. Specific actions also require Write and the relevant management module. Shared lookup Read does not grant Write. Role restrictions, assignment, ownership, transport and record-state rules still apply. The server validates all dependencies.</p>
      {user ? <p className="text-sm text-slate-600">Inherit follows current role defaults. Explicit Allow and Deny remain exceptions even when they match the role. Reset removes all exceptions.</p> : <p className="text-sm text-slate-600">Role defaults apply to assigned accounts, subject to their individual exceptions. Assigned counts include active and inactive accounts from User Management.</p>}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-4"><div className="flex items-center gap-2"><ShieldCheck aria-hidden="true" className="h-5 w-5 text-blue-700" /><h4 className="font-bold text-slate-900">Permissions</h4></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">{user ? `${draft.length} individual exceptions` : `${selectedPermissionCount(draft, editor.catalog)} permissions selected`}</span></div>
        <div className="space-y-4 p-4">
          <div className="flex flex-wrap items-end gap-3"><label className="min-w-44 flex-1 text-xs font-semibold text-slate-600" htmlFor="policy-module-search">Search modules<div className="relative mt-1"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input id="policy-module-search" aria-label="Search permission modules" placeholder="Search by module name" className={`min-h-11 w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm font-normal ${focus}`} value={filter} onChange={event => setFilter(event.target.value)} /></div></label>
            <label className="text-xs font-semibold text-slate-600" htmlFor="policy-scope-filter">Permission scope<select id="policy-scope-filter" className={`mt-1 block min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal ${focus}`} value={scope} onChange={event => setScope(event.target.value as ScopeFilter)}><option value="ALL">All modules</option>{Object.entries(SCOPE_LABELS).map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>
            {(filter || scope !== 'ALL') && <button type="button" className={`${button} min-h-11`} onClick={() => { setFilter(''); setScope('ALL'); }}>Clear module filters</button>}
          </div>
          <p role="status" className="text-xs text-slate-500">{groups.length} modules shown · Scroll horizontally to see every catalog action. A dash means the action is not defined.</p>
          <PolicyMatrix catalog={editor.catalog} groups={groups} values={values} roleDefaults={savedUser?.roleDefaults ?? []} savedUser={savedUser} ceilings={new Map(ceiling?.catalog.map(entry => [entry.key, entry.canAllow === true]))} disabled={disabled} individual={!!user} protectedKey={entry => protectedPolicyKey(role, entry)} onChange={change} />
        </div>
      </div>
      {editing && <div aria-live="polite" className="rounded-xl border border-slate-200 bg-white p-4 text-sm"><strong>Draft change preview ({changes.length})</strong><p className="mt-1 text-slate-500">This lists requested policy changes, not effective access. The server computes effective access after saving.</p>{changes.map(c => <p key={c.key} className="break-words">{c.key}: {c.before} → {c.after}</p>)}{reset && <p>Reset all individual exceptions to Inherit.</p>}</div>}
      {dirty && dependencyErrors.length > 0 && <div role="alert" className="text-sm text-red-700"><p>Resolve these Read/Write dependencies before saving. Additional server restrictions may apply.</p>{dependencyErrors.map(message => <p key={message}>{message}</p>)}</div>}
      {conflict && <div role="alert" className="border border-amber-500 rounded p-3 space-y-2"><p>The policy or account changed. Your draft is preserved. Refresh and review the latest server policy before saving again.</p><button className={button} disabled={busy} onClick={refresh}>Refresh for conflict review</button>{latest && <>
        <p>Changes on server since this editor opened:</p>{policyChanges(editor.permissions, latest.permissions).map(c => <p key={c.key}>{c.key}: {c.before} → {c.after}</p>)}
        {'snapshot' in latest && <>
          <p>Latest account revision: {latest.authorizationRevision}; latest role policy revision: {latest.rolePolicyRevision}. Saved role: {latest.role}; conversion: {latest.conversionStatus}.</p>
          <p>Role defaults changed:</p>{policyChanges(savedUser?.roleDefaults ?? [], latest.roleDefaults).map(c => <p key={c.key}>{c.key}: {c.before} → {c.after}</p>)}
          <details><summary className={focus}>Review latest server effective decisions</summary>{Object.values(latest.snapshot.decisions).map(d => <p className="break-words" key={d.key}>{d.key}: {d.allowed ? 'Allowed' : 'Denied'} · {label(d.source)} · {d.reasons.map(label).join(', ')}</p>)}</details>
        </>}
        {'revision' in latest && <p>Latest role policy revision: {latest.revision}</p>}
        <label className="block"><input className={focus} type="checkbox" checked={reviewed} onChange={e => { setReviewed(e.target.checked); if (e.target.checked) setEditor(latest); }} /> I reviewed the refreshed policy and my preserved draft.</label></>}</div>}
      {editing && <div className="flex flex-wrap gap-2"><button className={`${button} min-h-11 bg-blue-700 font-semibold text-white`} disabled={disabled || !dirty || dependencyErrors.length > 0 || conflict && !reviewed} onClick={save}>Save permissions</button><button className={`${button} min-h-11 bg-white`} disabled={busy || !dirty} onClick={() => { setDraft(editor.permissions); setReset(false); setNotice('Draft discarded.'); }}>Cancel changes</button>{user && <button className={`${button} min-h-11 bg-white`} disabled={disabled} onClick={() => { if (window.confirm('Reset all individual exceptions to role defaults? Review the preview before saving.')) { setDraft([]); setReset(true); setReviewed(false); } }}>Reset exceptions</button>}</div>}
    </>}
  </section>;
}

export default function RolesPermissions({ users, usersLoading = false, usersError = null, onRetryUsers, initialUserId }: {
  initialUserId?: string | null; users: ApiUserAdmin[]; usersLoading?: boolean; usersError?: string | null; onRetryUsers?: () => void;
}) {
  const [target, setTarget] = useState<{ role: string; user?: ApiUserAdmin; viewOnly: boolean } | null>(() => {
    const user = users.find(account => account.id === initialUserId);
    return user ? { role: user.role, user, viewOnly: true } : null;
  });
  const activeMode = useAuthStore(state => state.authUser?.activeMode);
  const [search, setSearch] = useState('');
  const [assignment, setAssignment] = useState<AssignmentFilter>('ALL');
  const [policies, setPolicies] = useState<Partial<Record<string, RolePermissionEditor>>>({});
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const usersAvailable = !usersLoading && !usersError;
  const count = (role: string) => assignedAccountCount(users, role, usersAvailable);
  const shown = filterRoles(BUILTIN_ROLES, search, assignment, count);
  useEffect(() => {
    let live = true;
    setLoading(true); setFailure(null);
    Promise.allSettled(BUILTIN_ROLES.map(role => api.getRolePermissionEditor(role))).then(results => {
      if (!live) return;
      const next: Partial<Record<string, RolePermissionEditor>> = {};
      let firstFailure: unknown = null;
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.role === BUILTIN_ROLES[index] && result.value.contractVersion === 1 && result.value.catalogVersion === 1) next[BUILTIN_ROLES[index]] = result.value;
        else firstFailure ??= result.status === 'rejected' ? result.reason : new Error('Unsupported policy editor contract');
      });
      setPolicies(next); setFailure(firstFailure); setLoading(false);
    });
    return () => { live = false; };
  }, [reload]);
  const open = (role: string, viewOnly: boolean, trigger: HTMLButtonElement) => {
    returnFocus.current = trigger; setTarget({ role, viewOnly });
  };
  const close = () => {
    setTarget(null); setReload(value => value + 1);
    window.setTimeout(() => { if (returnFocus.current?.isConnected) returnFocus.current.focus(); else heading.current?.focus(); }, 0);
  };
  return <div className="min-w-0 space-y-5">
    {target?.user && activeMode !== 'V1' ? <PermissionsPanel key={target.user.id} user={target.user} onClose={close} /> : target ? <PolicyEditor key={target.user?.id ?? target.role} {...target} users={users} usersAvailable={usersAvailable} onClose={close} /> : <>
      <header><p className="mb-2 text-xs font-medium text-slate-500">Admin Panel <span aria-hidden="true">/</span> Access management</p><h2 ref={heading} tabIndex={-1} className="text-2xl font-bold text-slate-900 focus:outline-none">Roles &amp; Permissions</h2><p className="mt-2 text-sm text-slate-500">Review the five built-in roles, their module permissions and individual account exceptions.</p></header>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label htmlFor="role-search" className="min-w-44 flex-1 text-xs font-semibold text-slate-600">Search roles<div className="relative mt-1"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input id="role-search" placeholder="Search by role name" className={`min-h-11 w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm font-normal ${focus}`} value={search} onChange={event => setSearch(event.target.value)} /></div></label>
          <label htmlFor="role-assignment-filter" className="text-xs font-semibold text-slate-600">Account assignments<select id="role-assignment-filter" value={assignment} onChange={event => setAssignment(event.target.value as AssignmentFilter)} className={`mt-1 block min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal ${focus}`}><option value="ALL">All roles</option><option value="ASSIGNED">With assigned accounts</option><option value="UNASSIGNED">Without assigned accounts</option></select></label>
          <button type="button" className={`${button} min-h-11 bg-white`} onClick={() => { setSearch(''); setAssignment('ALL'); }} disabled={!search && assignment === 'ALL'}>Clear filters</button>
        </div>
        <p role="status" className="mt-3 text-xs text-slate-500">{shown.length} of {BUILTIN_ROLES.length} roles shown{loading ? ' · Loading policy counts…' : ''}</p>
      </div>
      {failure && <PolicyLoadFailure error={failure} busy={loading} onRetry={() => setReload(value => value + 1)} />}
      {(usersLoading || usersError) && <div role="status" className="rounded-lg bg-slate-100 p-3 text-sm text-slate-600">{usersLoading ? 'Loading account assignments…' : 'Account counts are unavailable. Role policies can still be viewed.'}{usersError && onRetryUsers && <button type="button" className={`ml-2 min-h-11 underline ${focus}`} onClick={onRetryUsers}>Reload account counts</button>}</div>}
      <div className="space-y-3" aria-label="Built-in roles">
        {shown.map(role => {
          const policy = policies[role], assigned = count(role);
          return <article key={role} aria-labelledby={`role-${role}`} className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700"><ShieldCheck aria-hidden="true" className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 id={`role-${role}`} className="font-bold text-slate-900">{policyLabel(role)}</h3><span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">Built-in role</span></div>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500"><span>{policy ? `${selectedPermissionCount(policy.permissions, policy.catalog)} permissions selected` : loading ? 'Loading permissions…' : 'Permission count unavailable'}</span><span className="inline-flex items-center gap-1"><Users aria-hidden="true" className="h-3.5 w-3.5" />{assigned === null ? 'Account count unavailable' : `${assigned} assigned account${assigned === 1 ? '' : 's'}`}</span></p>
            </div>
            <div className="flex gap-2"><button type="button" aria-label={`View ${policyLabel(role)} permissions`} className={`${button} flex min-h-11 items-center gap-2 bg-white`} onClick={event => open(role, true, event.currentTarget)}><Eye aria-hidden="true" className="h-4 w-4" /><span>View</span></button><button type="button" aria-label={`Edit ${policyLabel(role)} permissions`} disabled={!policy || policy.activeMode !== 'V1'} title={policy?.activeMode === 'LEGACY' ? 'This environment is in read-only candidate mode' : !policy ? 'Load the role policy before editing' : undefined} className={`${button} flex min-h-11 items-center gap-2 bg-blue-700 font-semibold text-white`} onClick={event => open(role, false, event.currentTarget)}><Pencil aria-hidden="true" className="h-4 w-4" /><span>Edit</span></button></div>
          </article>;
        })}
        {!shown.length && <div role="status" className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No roles match these filters. Clear the search or account assignment filter.</div>}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="mb-3 flex items-center gap-2"><SlidersHorizontal aria-hidden="true" className="h-4 w-4 text-blue-700" /><h3 className="font-semibold text-slate-900">Individual account exceptions</h3></div><p className="mb-3 text-sm text-slate-500">View an account’s inherited defaults and explicit Allow or Deny exceptions.</p><label htmlFor="policy-individual-account" className="text-xs font-semibold text-slate-600">Account<select id="policy-individual-account" aria-label="Individual account" disabled={!usersAvailable} className={`mt-1 block min-h-11 w-full max-w-xl rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal ${focus}`} value="" onChange={event => { const user = users.find(candidate => candidate.id === event.target.value); if (user) setTarget({ role: user.role, user, viewOnly: true }); }}><option value="">Choose an account to view permissions</option>{users.map(user => <option key={user.id} value={user.id}>{user.name} ({policyLabel(user.role)})</option>)}</select></label></div>
    </>}
  </div>;
}
