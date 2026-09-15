import { useState, useMemo, useEffect } from 'react';
import { LayoutGrid, Plus } from 'lucide-react';
import { DeliveryRecord, DeliveryCategory, UserRole } from '../types';
import { ApiCompany } from '../api';
import RecordCreateForm from './RecordCreateForm';
import AllOpsExportMenu from './AllOpsExportMenu';
import { StatusHistoryCounts } from '../utils/export';
import { DateSortMode, sortRecordsByDate } from '../utils/allOpsExport';

interface MainViewProps {
  records: DeliveryRecord[];
  currentUserRole: UserRole;
  currentUserName: string;
  onNavigate: (screen: string, item_id?: string) => void;
  companies: ApiCompany[];
  onCreateRecord: (data: Omit<DeliveryRecord, 'id' | 'created_by' | 'created_at' | 'modified_by' | 'modified_at' | 'email_notification_sent'>) => void;
  effectiveScreens: Set<string>;
}

type FilterKey = 'all' | 'Scheduled' | 'Delivered' | 'On-Hold' | 'Rescheduled' | 'Pending' | 'draft';

const CATEGORY_TO_SCREEN: Record<string, string> = {
  'Deliveries':            'deliveries',
  'RMA':                   'rma',
  'Accounting Collection': 'accounting_collection',
  'Procurement Pick-up':   'procurement_pickup',
  'Sales Orders':          'sales_orders',
};

const STATUS_BADGE: Record<string, string> = {
  'Delivered':   'bg-emerald-50 text-emerald-700 border-emerald-200',
  'On-Hold':     'bg-red-50 text-red-700 border-red-200',
  'Rescheduled': 'bg-purple-50 text-purple-700 border-purple-200',
  'Pending':     'bg-amber-50 text-amber-700 border-amber-200',
  'Scheduled':   'bg-blue-50 text-blue-700 border-blue-200',
};

const FILTER_BUTTONS: { key: FilterKey; label: string }[] = [
  { key: 'all',         label: 'View All Items' },
  { key: 'Scheduled',   label: 'View Scheduled Items' },
  { key: 'Delivered',   label: 'View Delivered Items' },
  { key: 'On-Hold',     label: 'View On-Hold Items' },
  { key: 'Rescheduled', label: 'View Rescheduled Items' },
  { key: 'Pending',     label: 'View Pending Items' },
  { key: 'draft',       label: 'Delivery For Approval' },
];

function fmtCreatedAt(ts: string): string {
  return new Date(ts).toLocaleString('en-PH', {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function MainView({ records, currentUserRole, currentUserName, onNavigate, companies, onCreateRecord, effectiveScreens }: MainViewProps) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createCategory, setCreateCategory] = useState<DeliveryCategory | null>(null);
  const [statusHistoryCounts, setStatusHistoryCounts] = useState<StatusHistoryCounts | undefined>(undefined);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortMode, setSortMode] = useState<DateSortMode>('nearest');

  useEffect(() => {
    const params = new URLSearchParams();
    if (activeFilter !== 'all' && activeFilter !== 'draft') params.set('status', activeFilter);

    fetch(`/api/records/status-history-counts?${params}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => setStatusHistoryCounts(data ?? undefined))
      .catch(() => setStatusHistoryCounts(undefined));
  }, [activeFilter]);

  const availableCategories = useMemo<DeliveryCategory[]>(
    () => (Object.entries(CATEGORY_TO_SCREEN)
      .filter(([, screen]) => effectiveScreens.has(screen))
      .map(([cat]) => cat as DeliveryCategory)
      .filter(cat => !(currentUserRole === 'Logistics' && cat === 'RMA'))),
    [effectiveScreens, currentUserRole]
  );

  const sorted = useMemo(
    () => [...records].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [records]
  );

  const filtered = useMemo(() => {
    switch (activeFilter) {
      case 'all':   return sorted;
      case 'draft': return sorted.filter(r => r.is_draft === 'Yes');
      default:      return sorted.filter(r => r.status === activeFilter);
    }
  }, [sorted, activeFilter]);

  const displayRecords = useMemo(() => {
    let result = filtered;
    if (dateFrom) result = result.filter(r => r.delivery_date && r.delivery_date >= dateFrom);
    if (dateTo)   result = result.filter(r => r.delivery_date && r.delivery_date <= dateTo);
    return (dateFrom || dateTo) ? result : sortRecordsByDate(result, sortMode);
  }, [filtered, dateFrom, dateTo, sortMode]);

  const handleRowClick = (record: DeliveryRecord) => {
    const screen = CATEGORY_TO_SCREEN[record.category];
    if (screen) onNavigate(screen, record.id);
  };

  const handleOpenCreate = () => {
    if (availableCategories.length === 0) return;
    setCreateCategory(availableCategories[0]);
    setShowCreateForm(true);
  };

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-black text-slate-900 leading-tight">Main</h1>
          <p className="text-[11px] text-slate-400">All delivery records across every module, newest first.</p>
        </div>
        <AllOpsExportMenu
          records={displayRecords}
          meta={{ reportName: 'All Operations', generatedByName: currentUserName, generatedByRole: currentUserRole }}
          activeFilterLabel={activeFilter !== 'all'
            ? activeFilter === 'draft' ? 'Draft Records' : activeFilter + ' Records'
            : undefined}
          statusHistoryCounts={statusHistoryCounts}
        />
      </div>

      {/* Filter shortcut buttons + New Delivery */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* New Delivery — separate, not part of the active filter group */}
        <button
          onClick={handleOpenCreate}
          disabled={availableCategories.length === 0}
          title={availableCategories.length === 0 ? 'No order types available for your account' : 'Create a new delivery record'}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all border-2 bg-[#0078C1] text-white border-transparent hover:bg-[#1F3864] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="w-3.5 h-3.5" />
          New Delivery
        </button>

        {FILTER_BUTTONS.map(({ key, label }) => {
          const isActive = activeFilter === key;
          return (
            <button
              key={key}
              onClick={() => setActiveFilter(key)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all border-2 ${
                isActive
                  ? 'bg-[#1F3864] text-white border-white/30 ring-2 ring-white/40 ring-offset-1 ring-offset-[#1F3864]'
                  : 'bg-[#0078C1] text-white border-transparent hover:bg-[#1F3864]'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Date range + sort filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="date"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]"
          title="Delivery Date From"
        />
        <input
          type="date"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]"
          title="Delivery Date To"
        />
        <select
          value={sortMode}
          onChange={e => setSortMode(e.target.value as DateSortMode)}
          disabled={!!(dateFrom || dateTo)}
          title={(dateFrom || dateTo) ? 'Sort order is N/A while a date range filter is active' : undefined}
          className={`px-3 py-2 border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1] ${(dateFrom || dateTo) ? 'border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed' : 'border-slate-300 bg-white cursor-pointer'}`}
        >
          {(dateFrom || dateTo) && <option value={sortMode}>Sort: N/A</option>}
          <option value="nearest">Nearest to Present</option>
          <option value="oldest">Oldest First</option>
          <option value="furthest">Furthest Future First</option>
        </select>
        {(dateFrom || dateTo || sortMode !== 'nearest') && (
          <button
            onClick={() => { setDateFrom(''); setDateTo(''); setSortMode('nearest'); }}
            className="px-3 py-2 text-xs font-bold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Record count */}
      <p className="text-xs text-slate-500">
        Showing <span className="font-bold text-slate-700">{displayRecords.length}</span> of{' '}
        <span className="font-bold text-slate-700">{records.length}</span> records
      </p>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {displayRecords.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <LayoutGrid className="w-10 h-10 text-slate-200" />
            <p className="text-sm text-slate-400">No records match this filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full table-auto text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left">
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap">Date Created</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Company</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Reference</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap">Category</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Area</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap">Account Manager</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap">Delivery Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayRecords.map(record => (
                  <tr
                    key={record.id}
                    onClick={() => handleRowClick(record)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors group"
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500 font-mono text-[10px]">
                      {fmtCreatedAt(record.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-slate-800 group-hover:text-[#0078C1] transition-colors line-clamp-1">
                        {record.company_name}
                      </span>
                      <span className="block text-[10px] text-slate-400 font-mono">{record.id}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{record.reference || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                        {record.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${STATUS_BADGE[record.status] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                        {record.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{record.area || '—'}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{record.account_manager || '—'}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{record.delivery_date || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create record modal */}
      {showCreateForm && createCategory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreateForm(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
            <div className="px-6 pt-5 pb-0 flex items-center justify-between">
              <h2 className="text-sm font-black text-slate-900">New Delivery</h2>
              <button
                onClick={() => setShowCreateForm(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors"
              >
                ×
              </button>
            </div>
            <div className="p-6">
              <RecordCreateForm
                category={createCategory}
                categoryLocked={false}
                availableCategories={availableCategories}
                onCategoryChange={(cat) => setCreateCategory(cat)}
                companies={companies}
                onSubmit={onCreateRecord}
                onCancel={() => setShowCreateForm(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
