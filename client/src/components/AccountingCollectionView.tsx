import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Plus, Search, X, Check, FileText, UploadCloud,
  Loader2, Wand2, SlidersHorizontal
} from 'lucide-react';
import ExportMenu from './ExportMenu';
import AccountManagerCombobox from './AccountManagerCombobox';
import { DELIVERY_COLUMNS, AC_EXTRA_COLUMNS, PDF_AC_COLUMNS, fmtDate, fmtDatetime, fmtStatus, StatusHistoryCounts } from '../utils/export';
import { computeAllOpsSummary } from '../utils/allOpsExport';
import { DeliveryRecord, DeliveryCategory, UserRole, DeliveryStatus } from '../types';
import { AREAS, PRIORITIES, ITEM_TYPES, DELIVERY_STATUSES, ACCOUNT_MANAGERS, acStatusLabel } from '../data';
import { ApiCompany } from '../api';
import AccountingCollectionWorkspace from './AccountingCollectionWorkspace';

interface AccountingCollectionViewProps {
  records: DeliveryRecord[];
  companies: ApiCompany[];
  currentUserRole: UserRole;
  currentUserName: string;
  onCreateRecord: (
    data: Omit<DeliveryRecord, 'id' | 'created_by' | 'created_at' | 'modified_by' | 'modified_at' | 'email_notification_sent'>
  ) => void;
  onUpdateRecord: (id: string, updates: Partial<DeliveryRecord>) => void;
  onVerifyCollection: (id: string) => Promise<void>;
  selectedRecordIdFromDashboard?: string | null;
  clearSelectedRecordId?: () => void;
}

const CATEGORY: DeliveryCategory = 'Accounting Collection';

interface RecordFormState {
  company_name: string;
  company_id: string;
  priority: string;
  reference: string;
  remarks: string;
  status: string;
  area: string;
  account_manager: string;
  delivery_date: string;
  item_type: string;
  is_draft: string;
  date_time: string;
  item_description: string;
  attachments: string[];
  amount: string; // string for controlled input, parsed to number on submit
}

const buildEmptyForm = (): RecordFormState => ({
  company_name: '',
  company_id: '',
  priority: '2 - Moderate',
  reference: '',
  remarks: '',
  status: 'Scheduled',
  area: 'Carmona',
  account_manager: '',
  delivery_date: new Date().toISOString().split('T')[0],
  item_type: 'Small Item',
  is_draft: 'No',
  date_time: new Date().toISOString().slice(0, 16),
  item_description: '',
  attachments: [],
  amount: '',
});

const AC_AF_ITEMS = [
  'Collection of billing statement + PDC',
  'Collection of official receipt acknowledgement',
  'Collection of overdue balance settlement',
  'PDC and eBilling acknowledgement collection',
  'Collection of signed billing statement for quarterly invoice',
  'Collection of post-dated checks for invoice cycle',
];

const AC_AF_REMARKS = [
  'Collect PDC only — no cash payments.',
  'Obtain acknowledgement receipt from AP department.',
  'Coordinate with accounts payable officer on-site.',
  '',
];

const acAfPick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
const acAfRandInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const acAfFutureDate = (minDays = 1, maxDays = 10) => {
  const d = new Date();
  d.setDate(d.getDate() + acAfRandInt(minDays, maxDays));
  return d.toISOString().split('T')[0];
};

const statusColor = (status: DeliveryStatus) => {
  switch (status) {
    case 'Delivered':   return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'On-Hold':     return 'bg-red-50 text-red-700 border-red-200';
    case 'Rescheduled': return 'bg-purple-50 text-purple-700 border-purple-200';
    case 'Pending':     return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'Scheduled':
    default:            return 'bg-blue-50 text-blue-700 border-blue-200';
  }
};

export default function AccountingCollectionView({
  records,
  companies,
  currentUserRole,
  currentUserName,
  onCreateRecord,
  onUpdateRecord,
  onVerifyCollection,
  selectedRecordIdFromDashboard,
  clearSelectedRecordId
}: AccountingCollectionViewProps) {
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [dateSort, setDateSort] = useState<'default' | 'nearest' | 'oldest' | 'furthest'>('default');
  const [amFilter, setAmFilter] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [form, setForm] = useState<RecordFormState>(buildEmptyForm());
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [attachmentNames, setAttachmentNames] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Deep-link: jump to a record from dashboard
  useEffect(() => {
    if (selectedRecordIdFromDashboard) {
      setSelectedRecordId(selectedRecordIdFromDashboard);
      setShowForm(false);
      clearSelectedRecordId?.();
    }
  }, [selectedRecordIdFromDashboard]); // eslint-disable-line react-hooks/exhaustive-deps

  const [statusHistoryCounts, setStatusHistoryCounts] = useState<StatusHistoryCounts | undefined>(undefined);

  useEffect(() => {
    const params = new URLSearchParams({ category: 'ACCOUNTING_COLLECTION' });
    if (statusFilter !== 'All') params.set('status', statusFilter);

    fetch(`/api/records/status-history-counts?${params}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => setStatusHistoryCounts(data ?? undefined))
      .catch(() => setStatusHistoryCounts(undefined));
  }, [statusFilter]);

  const canEdit = currentUserRole === 'Sales Coordinator' || currentUserRole === 'Logistics';

  const amOptions = useMemo(
    () => [...new Set(records.map(r => r.account_manager).filter(Boolean))].sort(),
    [records]
  );

  const updateField = <K extends keyof RecordFormState>(key: K, value: RecordFormState[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const handleAutoFill = () => {
    if (companies.length === 0) return;
    const company = acAfPick(companies);
    const deliveryDate = acAfFutureDate(1, 10);
    setForm({
      company_name: company.name,
      company_id: company.id,
      priority: acAfPick(PRIORITIES),
      reference: `SAP-COLL-${acAfRandInt(10000, 99999)}`,
      remarks: acAfPick(AC_AF_REMARKS),
      status: 'Scheduled',
      area: acAfPick(AREAS),
      account_manager: acAfPick(ACCOUNT_MANAGERS),
      delivery_date: deliveryDate,
      item_type: acAfPick(ITEM_TYPES),
      is_draft: 'No',
      date_time: `${deliveryDate}T${String(acAfRandInt(8, 11)).padStart(2, '0')}:00`,
      item_description: acAfPick(AC_AF_ITEMS),
      attachments: [],
      amount: String(acAfRandInt(500, 15000) * 10),
    });
    setFormErrors({});
  };

  const handleCompanySelect = (name: string) => {
    const company = companies.find(c => c.name === name);
    setForm(prev => ({ ...prev, company_name: name, company_id: company?.id ?? '' }));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachmentNames(prev => [...prev, ...Array.from(e.target.files!).map((f: File) => f.name)]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!form.company_name.trim()) errors.company_name = 'Company Name is required';
    if (!form.reference.trim()) errors.reference = 'Reference (SAP number) is required';
    if (!form.account_manager.trim()) errors.account_manager = 'Account Manager is required';
    if (!form.delivery_date) errors.delivery_date = 'Delivery Date is required';
    if (!form.area.trim()) errors.area = 'Area is required';
    if (!form.amount.trim() || isNaN(parseFloat(form.amount))) errors.amount = 'Amount to Collect is required';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});

    onCreateRecord({
      ...form,
      driver: '',
      driver_assistants: [],
      // Vehicle isn't a user-facing field for Accounting Collection (it's a
      // billing/collection run, not a shipment) — but the shared DeliveryRecord
      // schema requires it, so submit a fixed default rather than exposing it.
      vehicle: '(None)',
      category: CATEGORY,
      customer_id: form.company_id,
      priority: form.priority as DeliveryRecord['priority'],
      status: form.status as DeliveryStatus,
      item_type: form.item_type as DeliveryRecord['item_type'],
      is_draft: form.is_draft as DeliveryRecord['is_draft'],
      attachments: attachmentNames,
      output_actions_log: [],
      collection_verified: false,
      collection_verified_by: null,
      collection_verified_at: null,
      amount: parseFloat(form.amount.replace(/,/g, '')) || null,
    });

    setForm(buildEmptyForm());
    setAttachmentNames([]);
    setShowForm(false);
  };

  // Filter records
  const filtered = records.filter(r => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || (
      r.id.toLowerCase().includes(q) ||
      r.company_name.toLowerCase().includes(q) ||
      r.reference.toLowerCase().includes(q) ||
      r.account_manager.toLowerCase().includes(q)
    );
    const matchesStatus = statusFilter === 'All' || r.status === statusFilter;
    const matchesAM = !amFilter || r.account_manager.toLowerCase().includes(amFilter.toLowerCase());
    return matchesSearch && matchesStatus && matchesAM;
  });

  // Date sort
  const _now = Date.now();
  const sortedFiltered = dateSort === 'default' ? filtered : [...filtered].sort((a, b) => {
    const da = a.delivery_date ? new Date(a.delivery_date + 'T12:00:00').getTime() : null;
    const db = b.delivery_date ? new Date(b.delivery_date + 'T12:00:00').getTime() : null;
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    if (dateSort === 'nearest')  return Math.abs(da - _now) - Math.abs(db - _now);
    if (dateSort === 'oldest')   return da - db;
    if (dateSort === 'furthest') return db - da;
    return 0;
  });

  // If a record is selected, render full-page workspace
  if (selectedRecordId) {
    const record = records.find(r => r.id === selectedRecordId);
    if (record) {
      return (
        <AccountingCollectionWorkspace
          record={record}
          allRecordIds={sortedFiltered.map(r => r.id)}
          currentUserRole={currentUserRole}
          currentUserName={currentUserName}
          onBack={() => setSelectedRecordId(null)}
          onVerifyCollection={onVerifyCollection}
          onNavigateToRecord={setSelectedRecordId}
          onUpdateRecord={onUpdateRecord}
        />
      );
    }
  }

  // ── Export rows ──────────────────────────────────────────────────────────────
  const exportRows = sortedFiltered.map(r => ({
    id: r.id,
    company_name: r.company_name,
    reference: r.reference,
    category: r.category,
    priority: r.priority,
    area: r.area,
    delivery_date_fmt: fmtDate(r.delivery_date),
    driver: r.driver || '',
    driver_assistants: r.driver_assistants?.join(', ') || '',
    account_manager: r.account_manager,
    vehicle: r.vehicle || '',
    item_type: r.item_type || '',
    status_fmt: fmtStatus(r.status),
    remarks: r.remarks || '',
    created_by: r.created_by,
    created_at_fmt: fmtDatetime(r.created_at),
    collection_verified_fmt: r.collection_verified ? 'Yes' : 'No',
    collection_verified_by: r.collection_verified_by || '',
    collection_verified_at_fmt: fmtDatetime(r.collection_verified_at),
    amount_fmt: r.amount != null ? `₱${r.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '',
  }));

  const exportSummary = computeAllOpsSummary(
    sortedFiltered,
    dateSort === 'default' ? 'nearest' : dateSort
  );

  // Same approach as the Procurement Pick-up / Deliveries / RMA / Sales Orders
  // table (DeliveryRecordsView.tsx): a plain w-full table-fixed with a
  // <colgroup> of percentage-width <col>s summing to 100%. No px widths, no
  // spacer column — the browser distributes 100% of the container across the
  // columns directly, so the table always fills edge-to-edge with no dead
  // space, at any viewport size.
  // Date and Amount are both narrower than their content needs, which leaves
  // visible empty space *inside* each cell (Date is left-aligned and short,
  // so it trails whitespace before the cell boundary; Amount is right-
  // aligned, so it leads with whitespace after the cell boundary) — the two
  // gaps stack visually into what reads as one big gap between the columns,
  // even though there's no actual dead space between them. Tightened both
  // columns to fit their content closely; the freed width goes to Company.
  // Collection column removed for all roles — it always rendered empty/dash
  // values here (real verification happens via the TASS Dashboard's
  // "Unverified Collections" table with its inline Verify action, and via
  // the record workspace's Verification tab). This registry is a shared,
  // action-free browse view across Sales Coordinator/TASS/Admin, so one
  // column set now covers everyone.
  const colPct = { id: 10, company: 28, reference: 18, priority: 10, status: 12, date: 10, amount: 12 };

  return (
    <div className="space-y-6" id="accounting-collection-view">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Accounting Collection</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Track billing statement and payment collection runs. Click any row to open the full record workspace.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(currentUserRole === 'TASS' || currentUserRole === 'Admin') && (
            <ExportMenu
              rows={exportRows}
              columns={[...DELIVERY_COLUMNS, ...AC_EXTRA_COLUMNS]}
              pdfColumns={PDF_AC_COLUMNS}
              sheetName="Accounting Collection"
              filename="accounting-collection"
              pdfTitle="Accounting Collection records"
              showPdf={true}
              meta={{
                reportName: 'Accounting Collection Export',
                generatedByName: currentUserName,
                generatedByRole: currentUserRole,
              }}
              summary={exportSummary}
              statusHistoryCounts={statusHistoryCounts}
            />
          )}
          {canEdit && (
            <button
              onClick={() => { setShowForm(true); setSelectedRecordId(null); }}
              className="bg-[#1F3864] hover:bg-blue-900 text-white text-[12px] font-bold px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-all shadow-xs cursor-pointer self-start"
            >
              <Plus className="w-4 h-4" /> New Record
            </button>
          )}
        </div>
      </div>

      {/* CREATE FORM */}
      {showForm && canEdit && (
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 sm:p-7 space-y-6">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#0078C1]" /> Create New Accounting Collection Record
              </h3>
              <p className="text-[11.5px] text-slate-500 font-medium">Fields marked with * are required.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAutoFill}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-lg transition-colors cursor-pointer"
              >
                <Wand2 className="w-3.5 h-3.5" /> Auto Fill
              </button>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Company Name */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Company Name <span className="text-red-500">*</span></label>
                <select
                  value={form.company_name}
                  onChange={e => handleCompanySelect(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none bg-white ${formErrors.company_name ? 'border-red-500' : 'border-slate-300'}`}
                >
                  <option value="">-- Select registered merchant / company --</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
                {formErrors.company_name && <p className="text-red-500 text-[10px] font-semibold">{formErrors.company_name}</p>}
              </div>

              {/* Priority */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Priority</label>
                <select value={form.priority} onChange={e => updateField('priority', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white">
                  {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              {/* Reference */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Reference (SAP Number) <span className="text-red-500">*</span></label>
                <input type="text" value={form.reference} onChange={e => updateField('reference', e.target.value)}
                  placeholder="e.g., SAP-88231"
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none ${formErrors.reference ? 'border-red-500' : 'border-slate-300'}`} />
                {formErrors.reference && <p className="text-red-500 text-[10px] font-semibold">{formErrors.reference}</p>}
              </div>

              {/* Amount to Collect */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Amount to Collect <span className="text-red-500">*</span></label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold select-none">₱</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.amount}
                    onChange={e => updateField('amount', e.target.value)}
                    placeholder="25000.00"
                    className={`w-full pl-7 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 ${formErrors.amount ? 'border-red-500' : 'border-slate-300'}`}
                  />
                </div>
                {formErrors.amount && <p className="text-red-500 text-[10px] font-semibold">{formErrors.amount}</p>}
              </div>

              {/* Remarks */}
              <div className="space-y-1.5 md:row-span-2">
                <label className="font-bold text-slate-700">Remarks</label>
                <textarea value={form.remarks} onChange={e => updateField('remarks', e.target.value)} rows={4}
                  placeholder="Special instructions or notes..." className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Status</label>
                <select value={form.status} onChange={e => updateField('status', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white">
                  {DELIVERY_STATUSES.map(s => <option key={s} value={s}>{acStatusLabel(s)}</option>)}
                </select>
              </div>

              {/* Area */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Area <span className="text-red-500">*</span></label>
                <select value={form.area} onChange={e => updateField('area', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white">
                  {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                {formErrors.area && <p className="text-red-500 text-[10px] font-semibold">{formErrors.area}</p>}
              </div>

              {/* Account Manager */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Account Manager <span className="text-red-500">*</span></label>
                <select value={form.account_manager} onChange={e => updateField('account_manager', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg bg-white ${formErrors.account_manager ? 'border-red-500' : 'border-slate-300'}`}>
                  <option value="">-- Select account manager --</option>
                  {ACCOUNT_MANAGERS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                {formErrors.account_manager && <p className="text-red-500 text-[10px] font-semibold">{formErrors.account_manager}</p>}
              </div>

              {/* Delivery Date */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Delivery Date <span className="text-red-500">*</span></label>
                <input type="date" value={form.delivery_date} onChange={e => updateField('delivery_date', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg ${formErrors.delivery_date ? 'border-red-500' : 'border-slate-300'}`} />
                {formErrors.delivery_date && <p className="text-red-500 text-[10px] font-semibold">{formErrors.delivery_date}</p>}
              </div>

              {/* Item Type */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Item Type</label>
                <select value={form.item_type} onChange={e => updateField('item_type', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white">
                  {ITEM_TYPES.map(it => <option key={it} value={it}>{it}</option>)}
                </select>
              </div>

              {/* Draft */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Draft</label>
                <select value={form.is_draft} onChange={e => updateField('is_draft', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white">
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                </select>
              </div>

              {/* Date and Time */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Date and Time</label>
                <input type="datetime-local" value={form.date_time} onChange={e => updateField('date_time', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
              </div>

              {/* Item Description */}
              <div className="space-y-1.5 md:col-span-2">
                <label className="font-bold text-slate-700">Item Description</label>
                <textarea value={form.item_description} onChange={e => updateField('item_description', e.target.value)} rows={3}
                  placeholder="Cargo details, quantities, or bundle breakdown..." className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
              </div>

              {/* Attachments */}
              <div className="space-y-1.5 md:col-span-2">
                <label className="font-bold text-slate-700">Document Attachments</label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 rounded-xl p-5 text-center flex flex-col items-center justify-center gap-2 cursor-pointer bg-slate-50/50 hover:bg-slate-50 transition-all"
                >
                  <UploadCloud className="w-8 h-8 text-slate-400" />
                  <p className="font-bold text-slate-600">Click to upload (mock, no file is actually stored)</p>
                  <p className="text-[10px] text-slate-400">PDF, JPG, PNG, DOC up to 10MB</p>
                  <input type="file" ref={fileInputRef} onChange={handleFileSelect} multiple className="hidden" />
                </div>
                {attachmentNames.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {attachmentNames.map((name, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded px-2 py-1">
                        <FileText className="w-3.5 h-3.5 text-[#1F3864]" />
                        <span className="font-mono text-[10px] text-slate-700">{name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors text-[11px] uppercase">
                Cancel
              </button>
              <button type="submit" className="px-6 py-2.5 bg-[#0078C1] hover:bg-[#1F3864] text-white font-bold rounded-lg transition-colors text-[11px] uppercase flex items-center gap-1.5">
                <Check className="w-4 h-4" /> Save Record
              </button>
            </div>
          </form>
        </div>
      )}

      {/* List */}
      {!showForm && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          {/* Toolbar */}
          <div className="p-4 border-b border-slate-200 space-y-0">
            {/* ── Primary toolbar bar ── */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              {/* LEFT: category label + status chips */}
              <div className="flex items-center gap-0 min-w-0 flex-wrap">
                <span className="text-xs font-black text-slate-800 uppercase tracking-wider mr-3 shrink-0">Accounting Collection</span>
                <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3 flex-wrap">
                  {['All', 'Scheduled', 'Pending', 'Delivered', 'On-Hold', 'Rescheduled'].map(s => (
                    <button
                      key={s}
                      onClick={() => setStatusFilter(s)}
                      className={`px-3 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
                        statusFilter === s
                          ? 'bg-[#1F3864] text-white border-[#1F3864]'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      {s === 'All' ? 'All' : acStatusLabel(s)}
                    </button>
                  ))}
                </div>
              </div>

              {/* RIGHT: search + filter toggle + record count */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="relative w-56">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search by ID, company, reference..."
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#0078C1]"
                  />
                </div>
                <button
                  onClick={() => setShowAdvancedFilters(v => !v)}
                  className={`relative p-2 rounded-lg border transition-all cursor-pointer ${showAdvancedFilters ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'}`}
                  title="Toggle advanced filters"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  {(!!amFilter || dateSort !== 'default') && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-500 rounded-full border-2 border-white" />
                  )}
                </button>
                <span className="text-[11px] font-bold text-slate-400 tabular-nums shrink-0">{sortedFiltered.length}</span>
              </div>
            </div>

            {/* ── Collapsible Advanced Filters ── */}
            {showAdvancedFilters && (
              <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-end gap-3">
                {/* Account Manager */}
                <AccountManagerCombobox
                  value={amFilter}
                  onChange={setAmFilter}
                  options={amOptions}
                  placeholder="Account Manager"
                  inputClassName="text-[11px] font-semibold border border-slate-200 rounded-lg px-2 py-1.5 w-40 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#0078C1] placeholder:text-slate-400"
                />

                {/* Date sort */}
                <select
                  value={dateSort}
                  onChange={e => setDateSort(e.target.value as typeof dateSort)}
                  className="text-[11px] font-semibold border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#0078C1]"
                >
                  <option value="default">Sort: Default</option>
                  <option value="nearest">Sort: Nearest to Present</option>
                  <option value="oldest">Sort: Oldest First</option>
                  <option value="furthest">Sort: Furthest Future First</option>
                </select>

                {/* Clear all */}
                {(searchQuery || statusFilter !== 'All' || amFilter || dateSort !== 'default') && (
                  <button
                    onClick={() => { setSearchQuery(''); setStatusFilter('All'); setAmFilter(''); setDateSort('default'); }}
                    className="px-3 py-1.5 text-[#1F3864] hover:underline font-bold text-[10px] uppercase cursor-pointer"
                  >
                    Clear All
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-left border-collapse text-sm">
              <colgroup>
                <col style={{ width: `${colPct.id}%` }} />
                <col style={{ width: `${colPct.company}%` }} />
                <col style={{ width: `${colPct.reference}%` }} />
                <col style={{ width: `${colPct.priority}%` }} />
                <col style={{ width: `${colPct.status}%` }} />
                <col style={{ width: `${colPct.date}%` }} />
                <col style={{ width: `${colPct.amount}%` }} />
              </colgroup>
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-xs font-black text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Record ID</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="pl-4 pr-6 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedFiltered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-3.5 text-center text-slate-400">
                      No matching records found.
                    </td>
                  </tr>
                ) : sortedFiltered.map(rec => (
                  <tr
                    key={rec.id}
                    onClick={() => setSelectedRecordId(rec.id)}
                    className="hover:bg-blue-50/40 cursor-pointer transition-all"
                  >
                    <td className="px-4 py-3.5 font-bold text-slate-400 truncate">{rec.id}</td>
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-sm text-slate-900 truncate" title={rec.company_name}>{rec.company_name}</div>
                      <div className="text-xs text-gray-400 mt-0.5 truncate" title={rec.reference}>{rec.reference}</div>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-slate-600 truncate" title={rec.reference}>{rec.reference}</td>
                    <td className="px-4 py-3.5 truncate text-slate-600" title={rec.priority}>{rec.priority}</td>
                    <td className="px-4 py-3.5 text-center">
                      <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold inline-block ${statusColor(rec.status)}`}>
                        {acStatusLabel(rec.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-slate-500">{rec.delivery_date}</td>
                    <td className="pl-4 pr-6 py-3.5 text-right font-bold text-slate-900 tabular-nums">
                      {rec.amount != null
                        ? <span>₱{rec.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                        : <span className="text-slate-300 italic text-[10px]">—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary footer */}
          {sortedFiltered.length > 0 && (() => {
            const total = sortedFiltered.reduce((sum, r) => sum + (r.amount ?? 0), 0);
            return (
              <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">
                  Total Accounting Collection records: {records.length}
                </span>
                <span className="text-xs font-black text-slate-700 tabular-nums">
                  Total:{' '}
                  <span className="text-emerald-700">
                    ₱{total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-slate-400 font-normal ml-1">across {sortedFiltered.length} record{sortedFiltered.length !== 1 ? 's' : ''}</span>
                </span>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
