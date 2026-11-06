import React, { useSyncExternalStore } from 'react';
import { Check, ChevronDown, LockKeyhole, X } from 'lucide-react';
import type { PolicyCatalogEntry, PolicyRow, UserPermissionEditor } from '@/types/permissionEditor';
import type { PolicyModuleGroup } from './policyPresentation';
import { actionLabel, DRIVER_SCREEN_MODULES, permissionLabel, policyLabel, SCOPE_LABELS } from './policyPresentation';

const compactQuery = '(max-width: 639px)';
function subscribeToLayout(onChange: () => void) {
  const media = window.matchMedia?.(compactQuery);
  media?.addEventListener('change', onChange);
  return () => media?.removeEventListener('change', onChange);
}
const compactLayout = () => window.matchMedia?.(compactQuery).matches ?? false;

export default function PolicyMatrix({ catalog, groups, values, roleDefaults, savedUser, ceilings, disabled, individual, protectedKey, onChange }: {
  catalog: PolicyCatalogEntry[]; groups: PolicyModuleGroup[]; values: Record<string, string>; roleDefaults: PolicyRow[];
  savedUser: UserPermissionEditor | null; ceilings: Map<string, boolean>; disabled: boolean; individual: boolean;
  protectedKey: (entry: PolicyCatalogEntry) => boolean; onChange: (key: string, value: string) => void;
}) {
  const compact = useSyncExternalStore(subscribeToLayout, compactLayout, () => false);
  const visibleActions = new Set(groups.flatMap(group => group.entries.map(entry => entry.action)));
  const actions = [...new Set(catalog.filter(entry => visibleActions.has(entry.action)).map(entry => entry.action))];
  const defaults = Object.fromEntries(roleDefaults.map(row => [row.permissionKey, row.effect]));
  if (!groups.length) return <div role="status" className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm text-slate-600">No modules match these filters. Clear the search or choose another scope.</div>;
  const control = (entry: PolicyCatalogEntry) => {
    const restricted = ceilings.get(entry.key) !== true;
    const locked = protectedKey(entry);
    const decision = savedUser?.snapshot.decisions[entry.key];
    const helperId = `policy-help-${entry.key}`;
    const setting = values[entry.key] ?? (individual ? 'INHERIT' : 'DENY');
    const settingStyle = setting === 'ALLOW' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : setting === 'DENY' ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-slate-300 bg-slate-50 text-slate-800';
    return <>
      <label htmlFor={`policy-${entry.key}`} className={compact ? 'mb-2 block text-sm font-semibold text-slate-800' : 'sr-only'}>{compact ? actionLabel(entry.action) : permissionLabel(entry.key)}</label>
      <div className="relative">
        <select id={`policy-${entry.key}`} aria-label={permissionLabel(entry.key)} aria-describedby={helperId}
          className={`h-10 w-full min-w-0 appearance-none rounded-lg border py-2 pl-3 pr-9 text-sm font-semibold disabled:cursor-default focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${settingStyle}`}
          value={setting} disabled={disabled || locked} onChange={event => onChange(entry.key, event.target.value)}>
          {individual && <option value="INHERIT" className="bg-slate-50 text-slate-800">Inherit</option>}<option value="ALLOW" className="bg-emerald-50 text-emerald-900 disabled:bg-slate-100 disabled:text-slate-400" disabled={restricted}>Allow</option><option value="DENY" className="bg-rose-50 text-rose-900">Deny</option>
        </select>
        {locked ? <span title="Protected Admin" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"><LockKeyhole aria-hidden="true" className="size-3.5" /></span> : <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />}
      </div>
      <div id={helperId} className="mt-1.5 space-y-1 text-xs leading-5 text-slate-500">
        <div className="flex flex-wrap items-center justify-between gap-x-2">{individual && <span>Role: <span className="font-medium text-slate-700">{defaults[entry.key] === 'ALLOW' ? 'Allow' : 'Deny'}</span></span>}{locked ? <span className="text-slate-500">Protected Admin</span> : restricted ? <span title="Allow restricted by role" className="inline-flex items-center gap-1 text-slate-500"><LockKeyhole aria-hidden="true" className="size-3" /><span className="sr-only">Allow restricted by role. </span>Role limited</span> : null}</div>
        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        {decision && <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium leading-4 ${decision.allowed ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}><span className="sr-only">Saved result: </span>{decision.allowed ? <Check aria-hidden="true" className="size-3" /> : <X aria-hidden="true" className="size-3" />}{decision.allowed ? 'Allowed' : 'Denied'}</span>}
      <details className="group w-full min-w-0 text-xs text-slate-500 open:text-slate-600">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded text-xs leading-5 hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700 [&::-webkit-details-marker]:hidden"><span><span className="sr-only">Technical </span>details</span><ChevronDown aria-hidden="true" className="size-3.5 shrink-0 group-open:rotate-180" /></summary>
        <code className="mt-1 block break-all">{entry.key}</code>
        {decision && <p className="mt-1 break-words">{decision.source.replaceAll('_', ' ').toLowerCase()} · {decision.reasons.map(reason => reason.replaceAll('_', ' ').toLowerCase()).join(', ')}</p>}
      </details>
        </div>
      </div>
    </>;
  };
  if (compact) return <div role="region" aria-label="Permission modules" className="space-y-3">
    {groups.map(group => <details key={`${group.scope}:${group.module}`} open={groups.length <= 2 ? true : undefined} className="min-w-0 rounded-xl border border-slate-200 bg-white">
      <summary className="min-h-11 cursor-pointer rounded-xl px-4 py-3 text-sm text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700">
        <span className="font-semibold">{policyLabel(group.module)}</span>
        <span className="mt-1 block text-xs text-slate-500">{SCOPE_LABELS[group.scope]} · {group.entries.length} {group.entries.length === 1 ? 'action' : 'actions'}</span>
      </summary>
      <div className="space-y-4 border-t border-slate-100 p-4">{group.entries.map(entry => <div key={entry.key}>{control(entry)}</div>)}</div>
    </details>)}
  </div>;
  return <div role="region" aria-label="Permission matrix" tabIndex={0} className="relative max-h-[34rem] overflow-auto rounded-xl border border-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
    <table className="w-full border-separate border-spacing-0 text-left text-sm">
      <caption className="sr-only">Module permissions. Only actions available in the filtered modules are shown. N/A means that action is not defined for the module.</caption>
      <thead><tr>
        <th scope="col" className="sticky left-0 top-0 z-30 min-w-44 border-b border-r border-slate-200 bg-slate-50 px-4 py-3 font-semibold text-slate-800 sm:min-w-56">Module</th>
        {actions.map(action => <th key={action} scope="col" className="sticky top-0 z-20 min-w-40 border-b border-r border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-700 last:border-r-0">{actionLabel(action)}</th>)}
      </tr></thead>
      <tbody>{groups.map((group, index) => <React.Fragment key={`${group.scope}:${group.module}`}>
        {(index === 0 || groups[index - 1].scope !== group.scope) && <tr className="bg-slate-50">
          <th scope="colgroup" colSpan={actions.length + 1} className="border-b border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600">{SCOPE_LABELS[group.scope]}</th>
        </tr>}
        {group.scope === 'SCREEN' && DRIVER_SCREEN_MODULES.has(group.module)
          && (index === 0 || groups[index - 1].scope !== 'SCREEN' || !DRIVER_SCREEN_MODULES.has(groups[index - 1].module)) && <tr className="bg-blue-50/60">
          <td colSpan={actions.length + 1} className="border-b border-blue-100 px-4 py-2 text-xs text-slate-600"><span className="font-semibold text-slate-800">Driver screens</span><span className="ml-2">View, manager, board and dashboard remain separate policies.</span></td>
        </tr>}
        <tr>
          <th scope="row" className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-4 py-3 align-top font-semibold text-slate-900">
            <span className="block">{policyLabel(group.module)}</span><span className="mt-1 block text-xs font-normal text-slate-500">{SCOPE_LABELS[group.scope]}</span>
          </th>
          {actions.map(action => {
            const entry = group.entries.find(candidate => candidate.action === action);
            if (!entry) return <td key={action} className="border-b border-r border-slate-200 bg-slate-50/70 px-3 py-3 text-center align-top text-slate-500 last:border-r-0"><span aria-label={`${policyLabel(group.module)}: ${actionLabel(action)} is not defined`} className="inline-flex h-10 items-center text-xs">N/A</span></td>;
            return <td key={action} className="border-b border-r border-slate-200 bg-white px-3 py-2.5 align-top last:border-r-0">
              {control(entry)}
            </td>;
          })}
        </tr>
      </React.Fragment>)}</tbody>
    </table>
  </div>;
}
