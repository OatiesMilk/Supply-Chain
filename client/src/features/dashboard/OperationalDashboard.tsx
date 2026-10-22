import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDashboardOverview, getDashboardRecords, getDashboardUsers, type DashboardSelection } from '@/api/dashboardOverview';
import { DASHBOARD_QUERY_KEY } from '@/api/queries/useDashboardQuery';

const labels: Record<string, string> = { DELIVERY: 'Deliveries', RMA: 'RMA', ACCOUNTING_COLLECTION: 'Accounting Collection', PROCUREMENT_PICKUP: 'Procurement Pick-up', SALES_ORDERS: 'Sales Orders' };
const reasons: Record<string, string> = { overdue: 'Overdue delivery', 'unassigned-today': 'Unassigned today', verification: 'Awaiting verification' };
const panel = 'rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm';
const button = 'rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50';
const time = (value: string) => new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' });

export default function OperationalDashboard({ onNavigate, driver = false }: { onNavigate?: (screen: string, id?: string) => void; driver?: boolean }) {
  const [scope, setScope] = useState<DashboardSelection>({ period: 'all' });
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [selection, setSelection] = useState<{ title: string; filter: DashboardSelection; users?: boolean } | null>(null);
  const [page, setPage] = useState(1);
  const dialog = useRef<HTMLDialogElement>(null);
  const query = useQuery({ queryKey: [...DASHBOARD_QUERY_KEY, 'overview', scope], queryFn: () => getDashboardOverview(scope) });
  const records = useQuery({ queryKey: [...DASHBOARD_QUERY_KEY, 'records', selection?.filter, page], queryFn: () => getDashboardRecords(selection!.filter, page), enabled: !!selection && !selection.users });
  const users = useQuery({ queryKey: [...DASHBOARD_QUERY_KEY, 'users', page], queryFn: () => getDashboardUsers(page), enabled: !!selection?.users });
  useEffect(() => { if (selection) dialog.current?.showModal(); else dialog.current?.close(); }, [selection]);
  const openList = (title: string, filter: DashboardSelection, users = false) => { setPage(1); setSelection({ title, filter, users }); };
  const data = query.data;
  const listQuery = selection?.users ? users : records;
  const navigate = (screen: string | null, id: string) => { if (screen && onNavigate) { setSelection(null); onNavigate(screen, id); } };
  const maxStatus = Math.max(1, ...(data?.status.map(s => s.total) || []));
  return <section className="space-y-5 text-slate-900" aria-label={driver ? 'My run summary' : 'Operational dashboard'}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-xl font-bold">{driver ? 'My runs' : 'Operations overview'}</h1><p className="text-xs text-slate-600">Asia/Manila · KPI scopes are fixed; cards may overlap.</p></div>
      <button className={button} disabled={query.isFetching} onClick={() => void query.refetch()}>{query.isFetching ? 'Refreshing…' : 'Refresh dashboard'}</button>
    </div>
    {query.isPending && <p role="status">Loading dashboard…</p>}
    {query.isError && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-amber-900">{data ? 'Dashboard is stale. Refresh failed; showing the last successful result.' : 'Dashboard could not load.'} {query.error.message}</p>}
    {data && <>
      <p className="text-xs text-slate-500">Last successful update: {time(data.updatedAt)} PHT</p>
      <div id="dashboard-kpis" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {data.cards.map(c => <button key={c.metric} className={`${panel} text-left hover:border-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600`} onClick={() => openList(c.label, { metric: c.metric })}>
          <span className="block text-sm font-semibold">{c.label}</span><strong className="my-2 block text-3xl">{c.count}</strong><span className="block text-xs text-slate-600">{c.scope}</span>
        </button>)}
        {data.administration && <button className={`${panel} text-left hover:border-blue-500`} onClick={() => openList('Active Users', {}, true)}><span className="block text-sm font-semibold">Active Users</span><strong className="my-2 block text-3xl">{data.administration.activeUsers}</strong><span className="text-xs text-slate-600">Active accounts • all roles</span></button>}
      </div>
      {!driver && (data.role === 'ADMIN' || data.role === 'SALES_COORDINATOR') && <section className={panel} aria-labelledby="open-records-heading">
        <h2 id="open-records-heading" className="text-lg font-bold">{data.role === 'ADMIN' ? 'Open Records by Status' : 'Open delivery workload by status'}</h2>
        {data.role === 'ADMIN' && <div className="my-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">Module<select aria-label="Chart module" className="ml-2 rounded border p-2" value={scope.module || ''} onChange={e => setScope({ ...scope, module: e.target.value || undefined })}><option value="">All permitted modules</option>{data.modules.map(m => <option key={m} value={m}>{labels[m]}</option>)}</select></label>
          <label className="text-sm">Scheduled dates<select aria-label="Chart scheduled dates" className="ml-2 rounded border p-2" value={scope.period} onChange={e => { const period = e.target.value; setScope({ module: scope.module, period, ...(period === 'custom' ? { from: data.today, to: data.today } : {}) }); setCustom({ from: data.today, to: data.today }); }}><option value="all">All dates</option><option value="today">Today</option><option value="week">This week</option><option value="custom">Custom</option></select></label>
          {scope.period === 'custom' && <form className="flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); if (custom.from && custom.to && custom.from <= custom.to) setScope({ ...scope, ...custom }); }}>
            <label className="text-sm">From<input aria-label="Chart from date" type="date" required value={custom.from} max={custom.to || undefined} className="block rounded border p-2" onChange={e => setCustom({ ...custom, from: e.target.value })} /></label>
            <label className="text-sm">To<input aria-label="Chart to date" type="date" required value={custom.to} min={custom.from || undefined} className="block rounded border p-2" onChange={e => setCustom({ ...custom, to: e.target.value })} /></label><button className={button}>Apply dates</button>
          </form>}
        </div>}
        <p className="mb-3 text-xs text-slate-600">Open, non-draft records. Overdue is a subset of Delivery records only. Weeks run Monday–Sunday.</p>
        <div className="space-y-3" aria-label="Horizontal stacked status chart">
          {data.status.map(s => <div key={s.status} className="grid grid-cols-[7rem_1fr] items-center gap-2">
            <span className="text-sm">{s.status}</span><div className="flex min-h-9 items-center gap-2">
              <div className="flex h-7 min-w-1 overflow-hidden rounded" style={{ width: `${s.total / maxStatus * 75}%` }}>
                {s.total > s.overdue && <button className="bg-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-black" aria-label={`${s.status}: open total ${s.total}`} style={{ width: `${(s.total - s.overdue) / s.total * 100}%` }} onClick={() => openList(`${s.status} records`, { ...(data.role === 'ADMIN' ? scope : { module: 'DELIVERY' }), metric: 'open', status: s.status })} />}
                {s.overdue > 0 && <button className="bg-rose-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-black" aria-label={`${s.status}: overdue segment ${s.overdue}`} style={{ width: `${s.overdue / s.total * 100}%`, backgroundImage: 'repeating-linear-gradient(45deg,transparent,transparent 4px,#ffffff55 4px,#ffffff55 6px)' }} onClick={() => openList(`${s.status}: overdue deliveries`, { ...(data.role === 'ADMIN' ? scope : { module: 'DELIVERY' }), metric: 'open', status: s.status, overdue: true })} />}
              </div>
              <button className="shrink-0 rounded px-1 text-sm font-bold underline focus-visible:outline" aria-label={`${s.status}: ${s.total} total records`} onClick={() => openList(`${s.status} records`, { ...(data.role === 'ADMIN' ? scope : { module: 'DELIVERY' }), metric: 'open', status: s.status })}>{s.total}</button>
            </div>
          </div>)}
        </div>
        <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><caption className="mb-2 text-left text-xs">Text equivalent. Select a total or an overdue subset to open matching records.</caption><thead><tr><th>Status</th><th>Total</th><th>Overdue deliveries</th></tr></thead><tbody>{data.status.map(s => <tr key={s.status} className="border-t"><th className="py-2 font-normal">{s.status}</th><td><button className="underline" onClick={() => openList(`${s.status} records`, { ...(data.role === 'ADMIN' ? scope : { module: 'DELIVERY' }), metric: 'open', status: s.status })}>{s.total}</button></td><td><button className="underline" aria-label={`${s.status}: ${s.overdue} overdue deliveries`} onClick={() => openList(`${s.status}: overdue deliveries`, { ...(data.role === 'ADMIN' ? scope : { module: 'DELIVERY' }), metric: 'open', status: s.status, overdue: true })}>{s.overdue}</button></td></tr>)}</tbody></table></div>
        {data.status.every(s => s.total === 0) && <p className="mt-3" role="status">No open records in this scope.</p>}
        <button className="mt-4 text-sm underline" onClick={() => openList('Missing / invalid scheduled dates', { metric: 'open', module: data.role === 'ADMIN' ? scope.module : 'DELIVERY', missing: true })}>Missing / invalid scheduled dates: {data.missingDates}</button><p className="text-xs text-slate-600">Included in All dates; excluded from Today, This week and Custom ranges.</p>
      </section>}
      {data.role === 'LOGISTICS' && <section className={panel}><h2 className="text-lg font-bold">Daily deliveries due and completed</h2><p className="mb-4 text-xs text-slate-600">This Monday–Sunday, Manila. Due uses the current scheduled date; completed uses the actual completion timestamp. These are different populations, not an on-time rate.</p><div className="space-y-3">{data.daily.map(d => <div key={d.day}><p className="text-xs font-semibold">{d.day}</p>{(['due', 'completed'] as const).map(kind => <button key={kind} className="my-1 flex w-full items-center gap-2 text-left text-sm" onClick={() => openList(`${d.day} ${kind}`, { metric: kind, day: d.day })}><span className="w-24 shrink-0">{kind === 'due' ? 'Due' : 'Completed'}: {d[kind]}</span><span aria-hidden="true" className={`h-4 rounded ${kind === 'due' ? 'bg-blue-600' : 'bg-emerald-600'}`} style={{ width: `${d[kind] / Math.max(1, ...data.daily.flatMap(v => [v.due, v.completed])) * 65}%` }} /></button>)}</div>)}</div></section>}
      {data.role === 'TASS' && <section className={panel}><h2 className="text-lg font-bold">Collections awaiting verification by age</h2><p className="mb-4 text-xs text-slate-600">Calendar days since completion in Manila. Missing, invalid or future completion timestamps have Unknown age.</p>{data.ages.map(a => <button key={a.age} className="my-3 flex w-full items-center gap-3 text-left text-sm" onClick={() => openList(`${a.age} days awaiting verification`, { metric: 'verification', age: a.age })}><span className="w-28 shrink-0">{a.age === 'Unknown' ? 'Unknown age' : `${a.age} days`}: {a.count}</span><span aria-hidden="true" className="h-5 rounded bg-amber-500" style={{ width: `${a.count / Math.max(1, ...data.ages.map(v => v.count)) * 65}%` }} /></button>)}</section>}
      {data.role === 'ADMIN' && <section className={panel}><h2 className="text-lg font-bold">Needs Attention</h2><p className="mb-3 text-xs text-slate-600">Each record appears once. Waiting age is based on the date shown.</p>{data.attention.length === 0 ? <p>No records need attention.</p> : <div className="max-h-96 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>Reference / Company</th><th>Driver</th><th>Reason</th><th>Waiting age</th></tr></thead><tbody>{data.attention.map(r => <tr key={r.id} className="border-t align-top"><td className="p-2"><button className="font-semibold underline" onClick={() => openList(r.reference, { id: r.id })}>{r.reference}</button><p>{r.company}</p>{r.screen && onNavigate && <button className="text-xs underline" onClick={() => navigate(r.screen, r.id)}>Open record</button>}</td><td className="p-2">{r.driver}{r.assignment === 'no-login' && <p className="text-xs">Profile has no linked login</p>}</td><td className="p-2">{r.reasons.map(v => reasons[v]).join('; ')}</td><td className="p-2">{r.waitingDays === null ? 'Unknown' : `${r.waitingDays} days`}<p className="text-xs">Since {r.ageBasis}</p></td></tr>)}</tbody></table></div>}</section>}
      {data.administration && <section className={panel}><h2 className="text-lg font-bold">Administration summary</h2><p className="my-3 text-sm">Audit Events Today: <strong>{data.administration.auditEventsToday}</strong> · Records Created This Week: <strong>{data.administration.recordsThisWeek}</strong></p><p className="text-xs text-slate-600">Permitted operational records; Monday–Sunday. Audit total also includes administrative events.</p><h3 className="mt-5 font-semibold">Recent record activity</h3>{data.administration.recentAudit.length === 0 && <p className="text-sm">No recent activity.</p>}<ul className="divide-y">{data.administration.recentAudit.map(a => <li key={a.id} className="py-2 text-sm">{a.actor} · {a.action} · {a.reference}<span className="block text-xs text-slate-500">{time(a.timestamp)}</span></li>)}</ul></section>}
    </>}
    <dialog ref={dialog} onCancel={() => setSelection(null)} onClose={() => setSelection(null)} aria-labelledby="dashboard-list-title" className="max-h-[90dvh] w-[min(96vw,70rem)] rounded-xl p-4 text-slate-900 shadow-xl backdrop:bg-black/40">
      {selection && <><div className="mb-4 flex items-center justify-between gap-3"><h2 id="dashboard-list-title" className="text-lg font-bold">{selection.title}</h2><button autoFocus className={button} onClick={() => setSelection(null)}>Close</button></div>
        <p className="text-xs text-slate-600">Matching permitted records. Counts reflect the current dataset.</p>
        {listQuery.isPending && <p role="status">Loading matching list…</p>}
        {listQuery.isError && <p role="alert">{listQuery.data ? 'List is stale. ' : ''}Could not load matching list. <button className="underline" onClick={() => void listQuery.refetch()}>Retry</button></p>}
        {listQuery.data && <><p className="my-3 font-semibold">{listQuery.data.total} total</p>{listQuery.data.total === 0 && <p>No matching records.</p>}
          {selection.users ? <ul>{users.data?.users.map(u => <li key={u.id} className="border-t py-2">{u.name} · {u.role}</li>)}</ul> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Reference</th><th>Company</th><th>Status / Module</th><th>Scheduled</th><th>Driver</th></tr></thead><tbody>{records.data?.records.map(r => <tr key={r.id} className="border-t"><td className="p-2">{r.screen && onNavigate ? <button className="underline" onClick={() => navigate(r.screen, r.id)}>{r.reference}</button> : r.reference}</td><td className="p-2">{r.company}</td><td className="p-2">{r.status}<p className="text-xs">{labels[r.category]}</p></td><td className="p-2">{r.scheduledDate || 'Unknown'}</td><td className="p-2">{r.driver}{r.assignment === 'no-login' && <p className="text-xs">No linked login</p>}</td></tr>)}</tbody></table></div>}
          <div className="mt-4 flex items-center justify-between gap-2"><button className={button} disabled={page === 1 || listQuery.isFetching} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {Math.max(1, Math.ceil(listQuery.data.total / listQuery.data.pageSize))}</span><button className={button} disabled={page * listQuery.data.pageSize >= listQuery.data.total || listQuery.isFetching} onClick={() => setPage(page + 1)}>Next</button></div>
        </>}
      </>}
    </dialog>
  </section>;
}
