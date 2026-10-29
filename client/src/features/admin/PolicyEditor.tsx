import React, { useEffect, useRef, useState } from 'react';
import { api, ApiError, type ApiUserAdmin } from '@/api';
import { useAuthStore } from '@/store/authStore';
import type { PolicyRow, RolePermissionEditor, UserPermissionEditor, PolicyCatalogEntry } from '@/types/permissionEditor';

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

export function PolicyEditor({ role, user, users = [], onClose }: { role: string; user?: ApiUserAdmin; users?: ApiUserAdmin[]; onClose: () => void }) {
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
    read().then(next => { if (live) { setEditor(next); setDraft(next.permissions); } }).catch(e => { if (live) setError(e.message); }).finally(() => { if (live) setBusy(false); });
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
    if (!editor || busy || !dirty || editor.activeMode !== 'V1' || conflict && !reviewed
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
  const values = policyMap(draft);
  const savedUser = editor && 'snapshot' in editor ? editor : null;
  const dependencyErrors = editor ? dependencyIssues(editor.catalog, draft, savedUser?.roleDefaults) : [];
  const visibleCatalog = editor?.catalog.filter(p => `${p.scope} ${p.module} ${p.action}`.toLowerCase().includes(filter.toLowerCase())) ?? [];
  const grouped = new Map<string, PolicyCatalogEntry[]>();
  for (const p of visibleCatalog) {
    const group = p.scope === 'SCREEN' && ['driver', 'driver_board', 'driver_manager', 'driver_dashboard'].includes(p.module) ? 'Driver views, board and manager — separate policies' : `${label(p.scope)} permissions`;
    grouped.set(group, [...(grouped.get(group) ?? []), p]);
  }
  const disabled = busy || editor?.activeMode !== 'V1' || savedUser?.conversionStatus === 'REQUIRED';
  return <section ref={root} aria-label={`${user ? user.name : label(role)} permission editor`} className="rounded-xl border bg-white p-4 space-y-4 min-w-0">
    <div className="flex flex-wrap justify-between gap-2"><h3 className="font-bold">{user ? `${user.name} — individual exceptions` : `${label(role)} — role defaults`}</h3><button className={button} onClick={close} disabled={busy}>Close editor</button></div>
    {busy && <p role="status">Loading policy…</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {editor && <>
      <p className="text-sm">Mode: <strong>{editor.activeMode}</strong>. {editor.activeMode === 'LEGACY' ? 'Candidate V1 policy only. Current legacy permissions remain active; editing is unavailable until coordinated activation after #247 and migration review.' : 'Changes take effect after saving.'}</p>
      {savedUser?.conversionStatus === 'REQUIRED' && <p role="alert">Account conversion requires operator verification before editing.</p>}
      <p className="text-sm">Read is required for Write. Specific actions also require Write and the relevant management module. Shared lookup Read does not grant Write. Role restrictions, assignment, ownership, transport and record-state rules still apply. The server validates all dependencies.</p>
      {user ? <p className="text-sm">Inherit follows current role defaults. Explicit Allow and Deny remain exceptions even when they match the role. Reset removes all exceptions.</p> : <p className="text-sm">Changes apply to all accounts in this role, subject to individual exceptions. Accounts currently loaded in User Management: {users.filter(u => u.role === role).map(u => u.name).join(', ') || 'none loaded'}. This is not a complete affected-account count.</p>}
      <label className="block text-sm">Filter permissions<input className={`block border rounded p-2 w-full ${focus}`} value={filter} onChange={e => setFilter(e.target.value)} /></label>
      <div className="max-h-[32rem] overflow-auto space-y-2">
        {[...grouped].map(([group, entries]) => <fieldset className="space-y-2" key={group}><legend className="font-semibold py-2">{group}</legend>{entries.map(p => {
          const restriction = ceiling?.catalog.find(c => c.key === p.key)?.canAllow !== true;
          const locked = protectedPolicyKey(role, p);
          const decision = savedUser?.snapshot.decisions[p.key];
          return <div key={p.key} className="border rounded p-3 flex flex-wrap items-start gap-3 justify-between">
            <div className="min-w-0 flex-1"><label htmlFor={`policy-${p.key}`} className="font-semibold text-sm break-words">{p.scope.toLowerCase()} / {label(p.module)} / {label(p.action)}</label>
              {locked && <p className="text-xs">Protected Admin management — locked Allow.</p>}
              {restriction && <p className="text-xs">Allow unavailable: server role restriction. Deny remains valid.</p>}
              {decision && <p className="text-xs">Saved server result: {decision.allowed ? 'Allowed' : 'Denied'} · {label(decision.source)} · role {decision.roleEffect ?? 'none'} · override {decision.overrideEffect ?? 'Inherit'} · {decision.reasons.map(label).join(', ')}</p>}
              {savedUser && <p className="text-xs">Current role default: {policyMap(savedUser.roleDefaults)[p.key] ?? 'DENY'}</p>}
            </div>
            <select id={`policy-${p.key}`} aria-label={p.key} className={`border rounded p-2 text-sm ${focus}`} value={values[p.key] ?? (user ? 'INHERIT' : 'DENY')} disabled={disabled || locked} onChange={e => change(p.key, e.target.value)}>
              {user && <option value="INHERIT">Inherit</option>}<option value="ALLOW" disabled={restriction}>Allow</option><option value="DENY">Deny</option>
            </select>
          </div>;
        })}</fieldset>)}
      </div>
      <div aria-live="polite" className="border rounded p-3 text-sm"><strong>Draft change preview ({changes.length})</strong><p>This lists requested policy changes, not effective access. The server computes effective access after saving.</p>{changes.map(c => <p key={c.key} className="break-words">{c.key}: {c.before} → {c.after}</p>)}{reset && <p>Reset all individual exceptions to Inherit.</p>}</div>
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
      <div className="flex flex-wrap gap-2"><button className={button} disabled={disabled || !dirty || dependencyErrors.length > 0 || conflict && !reviewed} onClick={save}>Save permissions</button><button className={button} disabled={busy || !dirty} onClick={() => { setDraft(editor.permissions); setReset(false); setNotice('Draft discarded.'); }}>Cancel changes</button>{user && <button className={button} disabled={disabled} onClick={() => { if (window.confirm('Reset all individual exceptions to role defaults? Review the preview before saving.')) { setDraft([]); setReset(true); setReviewed(false); } }}>Reset exceptions</button>}</div>
    </>}
  </section>;
}

export default function RolesPermissions({ users }: { users: ApiUserAdmin[] }) {
  const [target, setTarget] = useState<{ role: string; user?: ApiUserAdmin } | null>(null);
  return <div className="space-y-4"><h2 className="font-bold">Roles &amp; Permissions</h2><p className="text-sm">Manage the five built-in roles and individual exceptions. Close the current editor before choosing another target.</p>{target ? <PolicyEditor key={target.user?.id ?? target.role} {...target} users={users} onClose={() => setTarget(null)} /> : <><div className="flex flex-wrap gap-2">{BUILTIN_ROLES.map(role => <button className={button} key={role} onClick={() => setTarget({ role })}>{label(role)}</button>)}</div><label className="block">Individual account<select aria-label="Individual account" className="block border rounded p-2 max-w-full" value="" onChange={e => { const user = users.find(u => u.id === e.target.value); if (user) setTarget({ role: user.role, user }); }}><option value="">Choose a loaded account</option>{users.map(u => <option key={u.id} value={u.id}>{u.name} ({label(u.role)})</option>)}</select></label></>}</div>;
}
