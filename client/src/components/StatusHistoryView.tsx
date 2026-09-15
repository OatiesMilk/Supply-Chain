import { useState } from 'react';
import { History, Loader2, AlertTriangle, Play } from 'lucide-react';
import { api, ApiError } from '../api';

type HistoryRow = { date: string; category: string; status: string; count: number };

const STATUS_OPTIONS = ['All', 'Scheduled', 'Delivered', 'On-Hold', 'Rescheduled', 'Pending'];
const CATEGORY_OPTIONS = ['All', 'Deliveries', 'RMA', 'Accounting Collection', 'Procurement Pick-up', 'Sales Orders'];

function defaultFromDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().split('T')[0];
}

function defaultToDate(): string {
  return new Date().toISOString().split('T')[0];
}

export default function StatusHistoryView() {
  const [from, setFrom] = useState(defaultFromDate());
  const [to, setTo] = useState(defaultToDate());
  const [status, setStatus] = useState('All');
  const [category, setCategory] = useState('All');

  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ranWithCategory, setRanWithCategory] = useState(false);
  const [dataSource, setDataSource] = useState<'snapshot' | 'live' | null>(null);

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    setDataSource(null);
    try {
      const result = await api.getDailyStatusHistory({
        from,
        to,
        status: status !== 'All' ? status : undefined,
        category: category !== 'All' ? category : undefined
      });
      setRows(result.rows);
      setDataSource(result.source ?? null);
      setRanWithCategory(category !== 'All');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load status history.');
      setRows(null);
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]';

  return (
    <div className="space-y-6" id="status-history-view">
      <div className="max-w-2xl">
        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
          <History className="w-4 h-4 text-[#1F3864]" /> Status History
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Daily record-status counts, saved once per day by the end-of-day snapshot job — a fast lookup, not a live recomputation.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-wrap gap-3 items-end max-w-3xl">
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Date From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Date To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)} className={`${inputCls} w-40`}>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)} className={`${inputCls} w-48`}>
            {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button
          onClick={handleRun}
          disabled={loading || !from || !to}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#1F3864] hover:bg-[#0078C1] text-white text-xs font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          {loading ? 'Running…' : 'Run'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 max-w-3xl">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <p className="text-xs font-bold">{error}</p>
        </div>
      )}

      {/* Results */}
      {rows !== null && dataSource === 'live' && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 text-[11px] rounded-lg px-3 py-2 max-w-3xl flex items-center gap-2">
          ⚡ Live data — no daily snapshot exists yet for this range. Snapshots are saved at 6 PM daily.
        </div>
      )}

      {rows !== null && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden max-w-3xl">
          {rows.length === 0 ? (
            <div className="text-center py-16 text-slate-400 px-6">
              <History className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p className="text-xs font-bold text-slate-500">No snapshot data yet for this range.</p>
              <p className="text-[11px] mt-1">
                The daily snapshot job only starts recording from today onward — it does not reconstruct history retroactively.
              </p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-2.5 font-black text-slate-500 uppercase tracking-wider text-[10px]">Date</th>
                  {ranWithCategory && (
                    <th className="text-left px-4 py-2.5 font-black text-slate-500 uppercase tracking-wider text-[10px]">Category</th>
                  )}
                  <th className="text-left px-4 py-2.5 font-black text-slate-500 uppercase tracking-wider text-[10px]">Status</th>
                  <th className="text-right px-4 py-2.5 font-black text-slate-500 uppercase tracking-wider text-[10px]">Count</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono text-slate-700">{r.date}</td>
                    {ranWithCategory && <td className="px-4 py-2.5 text-slate-700">{r.category}</td>}
                    <td className="px-4 py-2.5 text-slate-700 font-semibold">{r.status}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-slate-900 tabular-nums">{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
