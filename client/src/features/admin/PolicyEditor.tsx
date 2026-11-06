import React, { useEffect, useRef, useState } from 'react';
import { api, ApiError, type ApiUserAdmin } from '@/api';
import { useAuthStore } from '@/store/authStore';
import type { PolicyRow, RolePermissionEditor, UserPermissionEditor, PolicyCatalogEntry } from '@/types/permissionEditor';
import { ChevronDown, Eye, Pencil, Search, ShieldCheck, Users, SlidersHorizontal } from 'lucide-react';
import { ActionDialog } from '@/components/ActionDialog';
import PermissionsPanel from './PermissionsPanel';
import PolicyMatrix from './PolicyMatrix';
import PolicyLoadFailure from './PolicyLoadFailure';
import { assignedAccountCount, filterRoles, groupPolicyCatalog, permissionEffectLabel, permissionLabel, permissionMessage, policyLabel, selectedPermissionCount, SCOPE_LABELS, type AssignmentFilter, type ScopeFilter } from './policyPresentation';

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
const button = `inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium disabled:opacity-50 ${focus}`;
export function dependencyIssues(catalog: PolicyCatalogEntry[], draft: PolicyRow[], defaults: PolicyRow[] = []) {
  const requested = { ...policyMap(defaults), ...policyMap(draft) };
  return catalog.filter(p => requested[p.key] === 'ALLOW' && p.action !== 'READ' && (
    requested[`${p.scope}:${p.module}:READ`] !== 'ALLOW' || p.action !== 'WRITE' && requested[`${p.scope}:${p.module}:WRITE`] !== 'ALLOW'
  )).map(p => `${permissionLabel(p.key)} requires ${p.action === 'WRITE' ? 'Read' : 'Read and Write'} in this policy.`);
}

function PolicyChanges({ changes }: { changes: ReturnType<typeof policyChanges> }) {
  return <ul className="space-y-3">{changes.map(change => <li key={change.key} className="break-words">
    <p>{permissionLabel(change.key)}: {permissionEffectLabel(change.before)} → {permissionEffectLabel(change.after)}</p>
    <details className="mt-1 text-xs text-slate-500"><summary className={`cursor-pointer rounded ${focus}`}>Technical details</summary><code className="block break-all">{change.key}</code></details>
  </li>)}</ul>;
}

export function PolicyEditor({ role, user, users = [], usersAvailable = true, viewOnly = false, onClose }: { role: string; user?: ApiUserAdmin; users?: ApiUserAdmin[]; usersAvailable?: boolean; viewOnly?: boolean; onClose: () => void }) {
  const root = useRef<HTMLElement>(null);
  const allowNavigation = useRef(false);
  const leaveTrigger = useRef<HTMLElement | null>(null);
  const [leaveIntent, setLeaveIntent] = useState<{ action: () => void } | null>(null);
  const editorHeading = useRef<HTMLHeadingElement>(null);
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
  useEffect(() => {
    if (!leaveIntent) {
      leaveTrigger.current?.focus();
      leaveTrigger.current = null;
    }
  }, [leaveIntent]);
  useEffect(() => { editorHeading.current?.focus(); }, [role, user?.id]);
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
    const prevent = (event: BeforeUnloadEvent) => { if (!allowNavigation.current) { event.preventDefault(); event.returnValue = ''; } };
    const leave = (event: MouseEvent) => {
      const target = event.target;
      if (allowNavigation.current || !(target instanceof Element) || root.current?.contains(target)) return;
      const trigger = target.closest<HTMLElement>('button,a,[role="button"]');
      if (!trigger) return;
      event.preventDefault(); event.stopPropagation();
      leaveTrigger.current = trigger;
      setLeaveIntent({ action: () => {
        if (!trigger.isConnected) return;
        // Replay only the chosen navigation after explicit confirmation.
        allowNavigation.current = true;
        try { trigger.click(); } finally { allowNavigation.current = false; }
      } });
    };
    window.addEventListener('beforeunload', prevent);
    document.addEventListener('click', leave, true);
    return () => { window.removeEventListener('beforeunload', prevent); document.removeEventListener('click', leave, true); };
  }, [dirty]);
  const close = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (dirty) {
      leaveTrigger.current = event.currentTarget;
      setLeaveIntent({ action: onClose });
    } else onClose();
  };
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
    {leaveIntent && <ActionDialog open title="Discard unsaved permission changes?"
      description="Your permission changes have not been saved. Stay to keep editing, or discard your draft and leave."
      cancelLabel="Stay" confirmLabel="Discard changes" destructive
      onDismiss={() => setLeaveIntent(null)}
      onConfirm={() => {
        const { action } = leaveIntent;
        leaveTrigger.current = null;
        setLeaveIntent(null); setDraft(editor?.permissions ?? []); setReset(false);
        action();
      }} />}
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:px-5">
      <div className="min-w-0"><p className="mb-2 text-xs font-medium text-slate-500">Roles &amp; Permissions <span aria-hidden="true">/</span> {user ? 'Individual account' : 'Role policy'}</p>
        <h3 ref={editorHeading} tabIndex={-1} className={`text-balance text-xl font-bold text-slate-900 ${focus}`}>{user ? user.name : policyLabel(role)}</h3>
        <p className="mt-1 break-words text-xs leading-5 text-slate-500">{user ? `${user.email} · ${policyLabel(role)} · Individual exceptions` : `Role defaults · ${assigned === null ? 'Account count unavailable' : `${assigned} assigned account${assigned === 1 ? '' : 's'}`}`}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">{!editing && canEdit && <button type="button" className={`${button} border-blue-700 bg-blue-700 font-semibold text-white hover:bg-blue-800`} disabled={busy} onClick={() => { setEditing(true); editorHeading.current?.focus(); }}><Pencil aria-hidden="true" className="size-4 shrink-0" />Edit permissions</button>}<button type="button" className={`${button} bg-white text-slate-700 hover:bg-slate-50`} onClick={close} disabled={busy}>Close editor</button></div>
    </div>
    {busy && <p role="status">Loading policy…</p>}
    {error && (loadFailure && !editor ? <PolicyLoadFailure error={loadFailure} busy={busy} onRetry={retryRead} /> : <p role="alert" className="text-red-700">{permissionMessage(error, editor?.catalog ?? [])}</p>)}
    {notice && <p role="status">{notice}</p>}
    {editor && <>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white text-xs leading-5 text-slate-600"><div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-100 bg-slate-50 px-4 py-3"><span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${editor.activeMode === 'V1' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{editor.activeMode === 'V1' ? 'Active policy' : 'Read-only candidate'}</span><p>{editor.activeMode === 'LEGACY' ? 'Candidate V1 policy only. Current legacy permissions remain active; editing is unavailable until coordinated activation and migration review.' : !editing ? 'Viewing the saved server policy. Select Edit permissions to make changes.' : 'Changes take effect after saving.'}</p></div><div className="grid gap-3 px-4 py-3 lg:grid-cols-2 lg:gap-6"><div><p className="mb-1 font-semibold text-slate-700">Permission dependencies</p><p className="text-pretty">Read is required for Write. Specific actions also require Write and the relevant management module. Shared lookup Read does not grant Write. Role restrictions, assignment, ownership, transport and record-state rules still apply. The server validates all dependencies.</p></div><div><p className="mb-1 font-semibold text-slate-700">{user ? 'Individual exceptions' : 'Role defaults'}</p><p className="text-pretty">{user ? 'Inherit follows current role defaults. Explicit Allow and Deny remain exceptions even when they match the role. Reset removes all exceptions.' : 'Role defaults apply to assigned accounts, subject to their individual exceptions. Assigned counts include active and inactive accounts from User Management.'}</p></div></div></div>
      {savedUser?.conversionStatus === 'REQUIRED' && <p role="alert">Account conversion requires operator verification before editing.</p>}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3"><div className="flex items-center gap-2"><ShieldCheck aria-hidden="true" className="size-5 text-blue-700" /><h4 className="text-sm font-semibold text-slate-900">Permissions</h4></div><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-blue-800">{user ? `${draft.length} individual exceptions` : `${selectedPermissionCount(draft, editor.catalog)} permissions selected`}</span></div>
        <div className="space-y-4 p-4">
          <div className="flex flex-wrap items-end gap-3"><label className="min-w-44 flex-1 text-xs font-semibold text-slate-600" htmlFor="policy-module-search">Search modules<div className="relative mt-1.5"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 size-4 text-slate-400" /><input id="policy-module-search" aria-label="Search permission modules" placeholder="Search by module name" className={`h-10 w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm font-normal placeholder:text-slate-400 ${focus}`} value={filter} onChange={event => setFilter(event.target.value)} /></div></label>
            <label className="w-full text-xs font-semibold text-slate-600 sm:w-52" htmlFor="policy-scope-filter">Permission scope<div className="relative mt-1.5"><select id="policy-scope-filter" className={`block h-10 w-full appearance-none rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-10 text-sm font-normal ${focus}`} value={scope} onChange={event => setScope(event.target.value as ScopeFilter)}><option value="ALL">All modules</option>{Object.entries(SCOPE_LABELS).map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-3 size-4 text-slate-500" /></div></label>
            {(filter || scope !== 'ALL') && <button type="button" className={`${button} bg-white text-slate-700 hover:bg-slate-50`} onClick={() => { setFilter(''); setScope('ALL'); }}>Clear module filters</button>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs text-slate-500"><p role="status">{groups.length} {groups.length === 1 ? 'module' : 'modules'} shown<span className="sm:hidden"> · Expand a module to review its actions.</span><span className="hidden sm:inline"> · Scroll horizontally for more actions.</span></p><p className="text-pretty">{user ? 'Setting = selected exception · Role = default · Allowed / Denied = saved access. ' : 'Setting = role default. '}Lock = role restriction · N/A = action not defined.</p></div>
          <PolicyMatrix catalog={editor.catalog} groups={groups} values={values} roleDefaults={savedUser?.roleDefaults ?? []} savedUser={savedUser} ceilings={new Map(ceiling?.catalog.map(entry => [entry.key, entry.canAllow === true]))} disabled={disabled} individual={!!user} protectedKey={entry => protectedPolicyKey(role, entry)} onChange={change} />
        </div>
      </div>
      {editing && <div aria-live="polite" className="rounded-xl border border-slate-200 bg-white p-4 text-sm"><strong>Draft change preview ({changes.length})</strong><p className="mt-1 text-slate-500">This lists requested policy changes, not effective access. The server computes effective access after saving.</p><PolicyChanges changes={changes} />{reset && <p>Reset all individual exceptions to Inherit.</p>}</div>}
      {dirty && dependencyErrors.length > 0 && <div role="alert" className="text-sm text-red-700"><p>Resolve these Read/Write dependencies before saving. Additional server restrictions may apply.</p>{dependencyErrors.map(message => <p key={message}>{message}</p>)}</div>}
      {conflict && <div role="alert" className="border border-amber-500 rounded p-3 space-y-2"><p>The policy or account changed. Your draft is preserved. Refresh and review the latest server policy before saving again.</p><button className={button} disabled={busy} onClick={refresh}>Refresh for conflict review</button>{latest && <>
        <p>Changes on server since this editor opened:</p><PolicyChanges changes={policyChanges(editor.permissions, latest.permissions)} />
        {'snapshot' in latest && <>
          <p>Latest account revision: {latest.authorizationRevision}; latest role policy revision: {latest.rolePolicyRevision}. Saved role: {latest.role}; conversion: {latest.conversionStatus}.</p>
          <p>Role defaults changed:</p><PolicyChanges changes={policyChanges(savedUser?.roleDefaults ?? [], latest.roleDefaults)} />
          <details><summary className={focus}>Review latest server effective decisions</summary>{Object.values(latest.snapshot.decisions).map(d => <p className="break-words" key={d.key}>{permissionLabel(d.key)}: {d.allowed ? 'Allowed' : 'Denied'} · {label(d.source)} · {d.reasons.map(label).join(', ')}</p>)}</details>
        </>}
        {'revision' in latest && <p>Latest role policy revision: {latest.revision}</p>}
        <label className="block"><input className={focus} type="checkbox" checked={reviewed} onChange={e => { setReviewed(e.target.checked); if (e.target.checked) setEditor(latest); }} /> I reviewed the refreshed policy and my preserved draft.</label></>}</div>}
      {editing && <div className="flex flex-wrap gap-2"><button className={`${button} bg-blue-700 font-semibold text-white`} disabled={disabled || !dirty || dependencyErrors.length > 0 || conflict && !reviewed} onClick={save}>Save permissions</button><button className={`${button} bg-white`} disabled={busy || !dirty} onClick={() => { setDraft(editor.permissions); setReset(false); setNotice('Draft discarded.'); }}>Cancel changes</button>{user && <button className={`${button} bg-white`} disabled={disabled} onClick={() => { if (window.confirm('Reset all individual exceptions to role defaults? Review the preview before saving.')) { setDraft([]); setReset(true); setReviewed(false); } }}>Reset exceptions</button>}</div>}
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
  const returnFocus = useRef<string | null>(null);
  useEffect(() => {
    if (target || !returnFocus.current) return;
    const trigger = document.getElementById(returnFocus.current);
    if (trigger) trigger.focus(); else heading.current?.focus();
    returnFocus.current = null;
  }, [target]);
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
    returnFocus.current = trigger.id; setTarget({ role, viewOnly });
  };
  const close = () => {
    setTarget(null); setReload(value => value + 1);
    if (!returnFocus.current) returnFocus.current = 'roles-permissions-heading';
  };
  return <div className="min-w-0 space-y-5">
    {target?.user && activeMode !== 'V1' ? <PermissionsPanel key={target.user.id} user={target.user} onClose={close} /> : target ? <PolicyEditor key={target.user?.id ?? target.role} {...target} users={users} usersAvailable={usersAvailable} onClose={close} /> : <>
      <header><p className="mb-2 text-xs font-medium text-slate-500">Admin Panel <span aria-hidden="true" className="mx-1 text-slate-300">/</span> Access management</p><h2 id="roles-permissions-heading" ref={heading} tabIndex={-1} className="text-balance text-2xl font-bold text-slate-900 focus:outline-none">Roles &amp; Permissions</h2><p className="mt-1.5 text-pretty text-sm text-slate-500">Manage built-in role permissions and review individual account exceptions.</p></header>
      <section aria-label="Role directory" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label htmlFor="role-search" className="min-w-44 flex-1 text-xs font-semibold text-slate-600">Search roles<div className="relative mt-1.5"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 size-4 text-slate-400" /><input id="role-search" placeholder="Search by role name" className={`h-10 w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm font-normal placeholder:text-slate-400 ${focus}`} value={search} onChange={event => setSearch(event.target.value)} /></div></label>
          <label htmlFor="role-assignment-filter" className="min-w-52 text-xs font-semibold text-slate-600">Account assignments<div className="relative mt-1.5"><select id="role-assignment-filter" value={assignment} onChange={event => setAssignment(event.target.value as AssignmentFilter)} className={`block h-10 w-full appearance-none rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-10 text-sm font-normal ${focus}`}><option value="ALL">All roles</option><option value="ASSIGNED">With assigned accounts</option><option value="UNASSIGNED">Without assigned accounts</option></select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-3 size-4 text-slate-500" /></div></label>
          <button type="button" className={`h-10 rounded-lg px-3 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:text-slate-400 disabled:hover:bg-transparent ${focus}`} onClick={() => { setSearch(''); setAssignment('ALL'); }} disabled={!search && assignment === 'ALL'}>Clear filters</button>
        </div>
        <p role="status" className="mt-3 text-xs text-slate-500">{shown.length} of {BUILTIN_ROLES.length} roles shown{loading ? ' · Loading policy counts…' : ''}</p>
      </div>
      {failure && <PolicyLoadFailure error={failure} busy={loading} onRetry={() => setReload(value => value + 1)} />}
      {(usersLoading || usersError) && <div role="status" className="rounded-lg bg-slate-100 p-3 text-sm text-slate-600">{usersLoading ? 'Loading account assignments…' : 'Account counts are unavailable. Role policies can still be viewed.'}{usersError && onRetryUsers && <button type="button" className={`ml-2 min-h-11 underline ${focus}`} onClick={onRetryUsers}>Reload account counts</button>}</div>}
      <div aria-label="Built-in roles">
        <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_10rem_10rem_11rem] items-center gap-4 border-b border-slate-200 bg-slate-50 px-5 py-2.5 text-xs font-semibold text-slate-500 xl:grid"><span>Role</span><span>Permissions</span><span>Account assignments</span><span className="text-right">Actions</span></div>
        {shown.map(role => {
          const policy = policies[role], assigned = count(role);
          return <article key={role} aria-labelledby={`role-${role}`} className="grid items-center gap-x-4 gap-y-3 border-b border-slate-100 px-4 py-3.5 last:border-b-0 hover:bg-slate-50/70 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-5 xl:grid-cols-[minmax(0,1fr)_10rem_10rem_11rem]">
            <div className="flex min-w-0 items-center gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><ShieldCheck aria-hidden="true" className="size-5" /></div><div className="min-w-0"><h3 id={`role-${role}`} className="text-sm font-semibold text-slate-900">{policyLabel(role)}</h3><span className="mt-1 block text-xs text-slate-500">Built-in role</span></div></div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 sm:col-start-1 xl:contents"><p className="text-xs text-slate-600"><span className="tabular-nums">{policy ? `${selectedPermissionCount(policy.permissions, policy.catalog)} permissions selected` : loading ? 'Loading permissions…' : 'Permission count unavailable'}</span></p>
            <p className="inline-flex items-center gap-1.5 text-xs text-slate-600"><Users aria-hidden="true" className="size-4 text-slate-400" /><span className="tabular-nums">{assigned === null ? 'Account count unavailable' : `${assigned} assigned account${assigned === 1 ? '' : 's'}`}</span></p></div>
            <div className="flex gap-2 sm:col-start-2 sm:row-start-1 sm:row-end-3 xl:col-auto xl:row-auto xl:justify-end"><button type="button" id={`view-role-${role}`} aria-label={`View ${policyLabel(role)} permissions`} className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50 ${focus}`} onClick={event => open(role, true, event.currentTarget)}><Eye aria-hidden="true" className="size-4" /><span>View</span></button><button type="button" id={`edit-role-${role}`} aria-label={`Edit ${policyLabel(role)} permissions`} disabled={!policy || policy.activeMode !== 'V1'} title={policy?.activeMode === 'LEGACY' ? 'This environment is in read-only candidate mode' : !policy ? 'Load the role policy before editing' : undefined} className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-blue-700 bg-blue-700 px-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50 ${focus}`} onClick={event => open(role, false, event.currentTarget)}><Pencil aria-hidden="true" className="size-4" /><span>Edit</span></button></div>
          </article>;
        })}
        {!shown.length && <div role="status" className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No roles match these filters. Clear the search or account assignment filter.</div>}
      </div>
      </section>
      <section aria-labelledby="account-exceptions-heading" className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between lg:gap-8 lg:px-5"><div className="flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><SlidersHorizontal aria-hidden="true" className="size-5" /></div><div><h3 id="account-exceptions-heading" className="text-sm font-semibold text-slate-900">Individual account exceptions</h3><p className="mt-1 text-pretty text-xs leading-5 text-slate-500">Review inherited defaults and explicit Allow or Deny exceptions.</p></div></div><label htmlFor="policy-individual-account" className="block w-full shrink-0 text-xs font-semibold text-slate-600 lg:w-96">Account<div className="relative mt-1.5"><select id="policy-individual-account" aria-label="Individual account" disabled={!usersAvailable} className={`block h-10 w-full appearance-none rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-10 text-sm font-normal disabled:bg-slate-50 disabled:text-slate-400 ${focus}`} value="" onChange={event => { const user = users.find(candidate => candidate.id === event.target.value); if (user) { returnFocus.current = event.currentTarget.id; setTarget({ role: user.role, user, viewOnly: true }); } }}><option value="">Choose an account</option>{users.map(user => <option key={user.id} value={user.id}>{user.name} ({policyLabel(user.role)})</option>)}</select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-3 size-4 text-slate-500" /></div></label></section>
    </>}
  </div>;
}
