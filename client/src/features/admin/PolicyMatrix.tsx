import React from 'react';
import { LockKeyhole } from 'lucide-react';
import type { PolicyCatalogEntry, PolicyRow, UserPermissionEditor } from '@/types/permissionEditor';
import type { PolicyModuleGroup } from './policyPresentation';
import { actionLabel, DRIVER_SCREEN_MODULES, policyLabel, SCOPE_LABELS } from './policyPresentation';

export default function PolicyMatrix({ catalog, groups, values, roleDefaults, savedUser, ceilings, disabled, individual, protectedKey, onChange }: {
  catalog: PolicyCatalogEntry[]; groups: PolicyModuleGroup[]; values: Record<string, string>; roleDefaults: PolicyRow[];
  savedUser: UserPermissionEditor | null; ceilings: Map<string, boolean>; disabled: boolean; individual: boolean;
  protectedKey: (entry: PolicyCatalogEntry) => boolean; onChange: (key: string, value: string) => void;
}) {
  const actions = [...new Set(catalog.map(entry => entry.action))];
  const defaults = Object.fromEntries(roleDefaults.map(row => [row.permissionKey, row.effect]));
  if (!groups.length) return <div role="status" className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm text-slate-600">No modules match these filters. Clear the search or choose another scope.</div>;
  return <div role="region" aria-label="Permission matrix" tabIndex={0} className="max-h-[34rem] overflow-auto rounded-xl border border-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
    <table className="w-full border-separate border-spacing-0 text-left text-sm">
      <caption className="sr-only">Server-defined module permissions. Each column is a catalog action. A dash means that action is not defined for the module.</caption>
      <thead><tr>
        <th scope="col" className="sticky left-0 top-0 z-30 min-w-44 border-b border-r border-slate-200 bg-slate-100 px-4 py-3 font-semibold text-slate-800 sm:min-w-56">Module</th>
        {actions.map(action => <th key={action} scope="col" className="sticky top-0 z-20 min-w-32 border-b border-slate-200 bg-slate-100 px-3 py-3 font-semibold text-slate-700">{actionLabel(action)}</th>)}
      </tr></thead>
      <tbody>{groups.map((group, index) => <React.Fragment key={`${group.scope}:${group.module}`}>
        {(index === 0 || groups[index - 1].scope !== group.scope) && <tr className="bg-slate-50">
          <th scope="colgroup" colSpan={actions.length + 1} className="border-b border-slate-200 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-600">{SCOPE_LABELS[group.scope]}</th>
        </tr>}
        {group.scope === 'SCREEN' && DRIVER_SCREEN_MODULES.has(group.module)
          && (index === 0 || groups[index - 1].scope !== 'SCREEN' || !DRIVER_SCREEN_MODULES.has(groups[index - 1].module)) && <tr className="bg-blue-50/60">
          <td colSpan={actions.length + 1} className="border-b border-blue-100 px-4 py-2 text-xs text-slate-600"><span className="font-semibold text-slate-800">Driver screens</span><span className="ml-2">View, manager, board and dashboard remain separate policies.</span></td>
        </tr>}
        <tr>
          <th scope="row" className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-4 py-4 align-top font-semibold text-slate-900">
            <span className="block">{policyLabel(group.module)}</span><span className="mt-1 block text-[11px] font-normal text-slate-500">{group.scope.toLowerCase()} · {group.module}</span>
          </th>
          {actions.map(action => {
            const entry = group.entries.find(candidate => candidate.action === action);
            if (!entry) return <td key={action} className="border-b border-slate-100 bg-slate-50/50 px-3 py-4 text-center align-top text-slate-300"><span aria-label={`${policyLabel(group.module)}: ${actionLabel(action)} is not defined`}>—</span></td>;
            const restricted = ceilings.get(entry.key) !== true;
            const locked = protectedKey(entry);
            const decision = savedUser?.snapshot.decisions[entry.key];
            const helperId = `policy-help-${entry.key}`;
            return <td key={action} className="border-b border-slate-100 bg-white px-3 py-3 align-top">
              <label htmlFor={`policy-${entry.key}`} className="sr-only">{group.scope.toLowerCase()} / {policyLabel(group.module)} / {actionLabel(action)}</label>
              <select id={`policy-${entry.key}`} aria-label={entry.key} aria-describedby={helperId}
                className="min-h-11 w-full min-w-24 rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-semibold text-slate-800 disabled:bg-slate-50 disabled:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                value={values[entry.key] ?? (individual ? 'INHERIT' : 'DENY')} disabled={disabled || locked} onChange={event => onChange(entry.key, event.target.value)}>
                {individual && <option value="INHERIT">Inherit</option>}<option value="ALLOW" disabled={restricted}>Allow</option><option value="DENY">Deny</option>
              </select>
              <div id={helperId} className="mt-2 space-y-1 text-[10px] leading-relaxed text-slate-500">
                {locked ? <span className="flex items-center gap-1"><LockKeyhole aria-hidden="true" className="h-3 w-3 shrink-0" />Protected Admin</span> : restricted ? <span>Allow restricted by role</span> : null}
                {individual && <span className="block">Role: {defaults[entry.key] === 'ALLOW' ? 'Allow' : 'Deny'}</span>}
                {decision && <span className="block" title={`${decision.source} · ${decision.reasons.join(', ')}`}>Saved result: {decision.allowed ? 'Allowed' : 'Denied'}<span className="sr-only">; source {decision.source}; {decision.reasons.join(', ')}</span></span>}
              </div>
            </td>;
          })}
        </tr>
      </React.Fragment>)}</tbody>
    </table>
  </div>;
}
