import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft, ChevronLeft, ChevronRight,
  ClipboardList, History, UserPlus, MessagesSquare, FolderOpen,
  FileText, Shield, Settings, MessageSquare, Paperclip,
  Loader2, AlertTriangle, Send, Check, Truck,
  RotateCcw, PackageSearch, ShoppingCart, ListChecks, Download,
  ScrollText, Link2, X as XCircle
} from 'lucide-react';
import { DeliveryRecord, DeliveryCategory, UserRole, DeliveryStatus, OutputActionConfig, OutputActionTrigger } from '../types';
import { api, ApiAuditEntry, ApiComment, ApiCompany, ApiRemarkLog } from '../api';
import { printSingleManifest, ManifestDocumentationData } from './DeliveryManifest';
import { DRIVERS, DRIVER_ASSISTANTS, DELIVERY_STATUSES, AREAS, AREA_HIERARCHY, VEHICLES, PRIORITIES, ITEM_TYPES, ACCOUNT_MANAGERS, DRIVER_COVERAGE_AREAS, getSubregion, getNearbyAreas } from '../data';
import ComboboxField from './ComboboxField';
import { Pencil, X as XIcon, Save } from 'lucide-react';
import { getOutputTrigger, runOutputActions } from '../outputActions';
import StatusStepper from './StatusStepper';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTs(ts: string): string {
  return new Date(ts).toLocaleString('en-PH', {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

const STATUS_COLOR: Record<string, string> = {
  'Delivered':   'bg-emerald-50 text-emerald-700 border-emerald-200',
  'On-Hold':     'bg-red-50 text-red-700 border-red-200',
  'Rescheduled': 'bg-purple-50 text-purple-700 border-purple-200',
  'Pending':     'bg-amber-50 text-amber-700 border-amber-200',
  'Scheduled':   'bg-blue-50 text-blue-700 border-blue-200',
};

const PRIORITY_COLOR: Record<string, string> = {
  '1 - Low':      'bg-slate-100 text-slate-700 border-slate-200',
  '2 - Moderate': 'bg-amber-50 text-amber-700 border-amber-200',
  '3 - High':     'bg-red-50 text-red-700 border-red-200',
};

const CATEGORY_ICON: Record<DeliveryCategory, typeof Truck> = {
  'Deliveries':          Truck,
  'RMA':                 RotateCcw,
  'Procurement Pick-up': PackageSearch,
  'Sales Orders':        ShoppingCart,
  'Accounting Collection': ListChecks,
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface DeliveryRecordWorkspaceProps {
  record: DeliveryRecord;
  allRecordIds: string[];
  allRecords?: DeliveryRecord[];
  currentUserRole: UserRole;
  currentUserName: string;
  companies: ApiCompany[];
  onBack: () => void;
  onNavigateToRecord: (id: string) => void;
  onUpdateRecord: (id: string, updates: Partial<DeliveryRecord>) => void;
  outputActionConfigs: Record<OutputActionTrigger, OutputActionConfig>;
  forceReadOnly?: boolean;
}

// ─── Tab definitions ──────────────────────────────────────────────────────────

type TabId = 'general' | 'actions' | 'comments' | 'audit' | 'documents' | 'remarks';

interface TabDef {
  id: TabId;
  label: string;
  icon: typeof FileText;
  roles: UserRole[];
}

const ALL_TABS: TabDef[] = [
  { id: 'general',   label: 'General',        icon: ClipboardList,  roles: ['Sales Coordinator', 'Logistics', 'Admin'] },
  { id: 'actions',   label: 'Assign',          icon: UserPlus,       roles: ['Logistics', 'Admin'] },
  { id: 'comments',  label: 'Comments',        icon: MessagesSquare, roles: ['Sales Coordinator', 'Logistics', 'Admin'] },
  { id: 'remarks',   label: 'Remarks',         icon: ScrollText,     roles: ['Sales Coordinator', 'Logistics', 'Admin'] },
  { id: 'audit',     label: 'Audit Trail',     icon: History,        roles: ['Sales Coordinator', 'Logistics', 'Admin'] },
  { id: 'documents', label: 'Documents',       icon: FolderOpen,     roles: ['Sales Coordinator', 'Logistics', 'Admin'] },
];

// ─── Scaffold empty-state tab ─────────────────────────────────────────────────

function ScaffoldTab({ icon: Icon, label, detail }: { icon: typeof FileText; label: string; detail?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
        <Icon className="w-8 h-8 text-slate-300" />
      </div>
      <div>
        <h3 className="text-base font-bold text-slate-700">{label}</h3>
        <p className="text-sm text-slate-400 mt-1 max-w-sm">
          {detail ?? `This section is under development. ${label} data will appear here once the module is connected.`}
        </p>
      </div>
    </div>
  );
}

// ─── General Tab ─────────────────────────────────────────────────────────────

type EditDraft = {
  priority: string; reference: string; area: string; vehicle: string;
  account_manager: string; delivery_date: string; date_time: string;
  item_type: string; is_draft: string; remarks: string; item_description: string;
  address: string;
};

function GeneralTab({
  record,
  currentUserRole,
  currentUserName,
  onUpdateRecord,
}: {
  record: DeliveryRecord;
  currentUserRole: UserRole;
  currentUserName: string;
  onUpdateRecord: (id: string, updates: Partial<DeliveryRecord>) => void;
}) {
  const CategoryIcon = CATEGORY_ICON[record.category] ?? FileText;

  // SC can edit all fields while the record is still Scheduled; Logistics can always edit Area + Address
  const canEditFull = currentUserRole === 'Sales Coordinator' && record.status === 'Scheduled';
  const canEditAreaAddress = currentUserRole === 'Logistics';
  const canEdit = canEditFull || canEditAreaAddress;

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [remarksError, setRemarksError] = useState(false);
  const [draft, setDraft] = useState<EditDraft>({
    priority: record.priority,
    reference: record.reference,
    area: record.area,
    vehicle: record.vehicle || '(None)',
    account_manager: record.account_manager,
    delivery_date: record.delivery_date,
    date_time: record.date_time ?? '',
    item_type: record.item_type,
    is_draft: record.is_draft,
    remarks: record.remarks || '',
    item_description: record.item_description || '',
    address: record.address ?? '',
  });

  // Re-sync draft when a different record is opened
  useEffect(() => {
    setEditing(false);
    setDraft({
      priority: record.priority,
      reference: record.reference,
      area: record.area,
      vehicle: record.vehicle || '(None)',
      account_manager: record.account_manager,
      delivery_date: record.delivery_date,
      date_time: record.date_time ?? '',
      item_type: record.item_type,
      is_draft: record.is_draft,
      remarks: record.remarks || '',
      item_description: record.item_description || '',
      address: record.address ?? '',
    });
  }, [record.id]);

  const set = (k: keyof EditDraft, v: string) => setDraft(p => ({ ...p, [k]: v }));

  const handleStartEdit = () => {
    // Logistics enters a fresh change note rather than seeing/overwriting existing remarks
    if (canEditAreaAddress && !canEditFull) {
      setDraft(d => ({ ...d, remarks: '' }));
    }
    setEditing(true);
  };

  const handleSave = async () => {
    if (!draft.remarks.trim()) {
      setRemarksError(true);
      return;
    }
    setRemarksError(false);
    setSaving(true);
    const updates = canEditFull
      ? { ...draft }
      : { area: draft.area, address: draft.address, remarks: draft.remarks };
    await onUpdateRecord(record.id, {
      ...updates,
      modified_by: `${currentUserName} (${currentUserRole})`,
      modified_at: new Date().toISOString(),
    });
    setSaving(false);
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft({
      priority: record.priority,
      reference: record.reference,
      area: record.area,
      vehicle: record.vehicle || '(None)',
      account_manager: record.account_manager,
      delivery_date: record.delivery_date,
      date_time: record.date_time ?? '',
      item_type: record.item_type,
      is_draft: record.is_draft,
      remarks: record.remarks || '',
      item_description: record.item_description || '',
      address: record.address ?? '',
    });
    setRemarksError(false);
    setEditing(false);
  };

  const inputCls = 'w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]';
  const labelCls = 'text-[10px] text-slate-400 uppercase tracking-widest font-bold';

  return (
    <div className="space-y-5">
      {/* Header card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <span className="font-mono font-black text-lg text-slate-900">{record.id}</span>
          <span className="px-2.5 py-1 rounded-md font-black text-[10px] uppercase tracking-wider border bg-blue-100 text-blue-800 border-blue-200 flex items-center gap-1">
            <CategoryIcon className="w-3 h-3" /> {record.category}
          </span>
          <span className={`px-2.5 py-1 rounded-full border text-[10px] font-semibold tracking-wide ${STATUS_COLOR[record.status] ?? 'bg-slate-50 text-slate-700 border-slate-200'}`}>
            {record.status}
          </span>
          {!editing && (
            <span className={`px-2.5 py-1 rounded-full border text-[10px] font-semibold ${PRIORITY_COLOR[record.priority] ?? 'bg-slate-100 text-slate-700 border-slate-200'}`}>
              Priority: {record.priority}
            </span>
          )}
        </div>
        <p className="text-sm font-bold text-slate-700">{record.company_name}</p>
      </div>

      {/* Status stepper */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Status Progression</p>
        <StatusStepper status={record.status} />
      </div>

      {/* Fields grid / edit form */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Record Details</h4>
          {canEdit && !editing && (
            <button
              onClick={handleStartEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-[#0078C1] hover:bg-blue-50 border border-blue-200 rounded-lg transition-colors cursor-pointer"
            >
              <Pencil className="w-3 h-3" /> {canEditAreaAddress && !canEditFull ? 'Edit Area / Address' : 'Edit'}
            </button>
          )}
          {editing && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCancel}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                <XIcon className="w-3 h-3" /> Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-white bg-[#0078C1] hover:bg-[#1F3864] rounded-lg transition-colors cursor-pointer disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>

        {!editing ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-xs">
              {[
                { label: 'Reference (SAP)', value: record.reference },
                { label: 'Area',            value: record.area },
                { label: 'Address',         value: record.address || '—' },
                { label: 'Vehicle',         value: record.vehicle || '—' },
                { label: 'Driver',            value: record.driver || 'Unassigned' },
                { label: 'Driver Assistants', value: (record.driver_assistants ?? []).join(', ') || '—' },
                { label: 'Time In',           value: record.time_in || '—' },
                { label: 'Time Out',          value: record.time_out || '—' },
                { label: 'Received By',       value: record.received_by || '—' },
                { label: 'Account Manager',   value: record.account_manager },
                { label: 'Delivery Date',   value: record.delivery_date },
                { label: 'Date & Time',     value: record.date_time ? formatTs(record.date_time) : '—' },
                { label: 'Item Type',       value: record.item_type },
                { label: 'Draft',           value: record.is_draft },
              ].map(row => (
                <div key={row.label} className="flex flex-col gap-0.5">
                  <span className={labelCls}>{row.label}</span>
                  <span className="font-semibold text-slate-800">{row.value}</span>
                </div>
              ))}
            </div>
            {record.remarks && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className={`${labelCls} mb-1.5`}>Remarks</p>
                <p className="text-sm text-slate-700 leading-relaxed">{record.remarks}</p>
              </div>
            )}
            {record.item_description && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className={`${labelCls} mb-1.5`}>Item Description</p>
                <p className="text-sm text-slate-700 leading-relaxed">{record.item_description}</p>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {canEditFull && (
                <>
                  <div className="space-y-1">
                    <label className={labelCls}>Priority</label>
                    <select value={draft.priority} onChange={e => set('priority', e.target.value)} className={inputCls}>
                      {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className={labelCls}>Reference (SAP)</label>
                    <input type="text" value={draft.reference} onChange={e => set('reference', e.target.value)} className={inputCls} />
                  </div>
                </>
              )}
              <div className="space-y-1">
                <ComboboxField
                  label="Area"
                  optional
                  options={AREAS}
                  optionGroups={AREA_HIERARCHY.flatMap(r =>
                    r.subregions.map(s => ({ label: `${r.region} · ${s.name}`, options: s.areas }))
                  )}
                  value={draft.area}
                  onChange={v => set('area', v)}
                  placeholder="Type to search or scroll to browse..."
                />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Address <span className="text-[10px] font-normal text-slate-400 normal-case tracking-normal">(optional)</span></label>
                <input type="text" value={draft.address} onChange={e => set('address', e.target.value)} className={inputCls} placeholder="Street, building, floor, or additional location detail" />
              </div>
              {canEditFull && (
                <>
                  <div className="space-y-1">
                    <label className={labelCls}>Vehicle</label>
                    <select value={draft.vehicle} onChange={e => set('vehicle', e.target.value)} className={inputCls}>
                      {VEHICLES.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className={labelCls}>Account Manager</label>
                    <select value={draft.account_manager} onChange={e => set('account_manager', e.target.value)} className={inputCls}>
                      <option value="">— Select —</option>
                      {ACCOUNT_MANAGERS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className={labelCls}>Item Type</label>
                    <select value={draft.item_type} onChange={e => set('item_type', e.target.value)} className={inputCls}>
                      {ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className={labelCls}>Delivery Date</label>
                    <input type="date" value={draft.delivery_date} onChange={e => set('delivery_date', e.target.value)} className={inputCls} />
                  </div>
                  <div className="space-y-1">
                    <label className={labelCls}>Date &amp; Time</label>
                    <input type="datetime-local" value={draft.date_time} onChange={e => set('date_time', e.target.value)} className={inputCls} />
                  </div>
                  <div className="space-y-1">
                    <label className={labelCls}>Draft</label>
                    <select value={draft.is_draft} onChange={e => set('is_draft', e.target.value)} className={inputCls}>
                      <option value="No">No</option>
                      <option value="Yes">Yes</option>
                    </select>
                  </div>
                </>
              )}
            </div>
            <div className="space-y-1">
              <label className={labelCls}>
                {canEditFull ? 'Remarks' : 'Change Note'} <span className="text-red-500">*</span>
              </label>
              <textarea
                value={draft.remarks}
                onChange={e => { set('remarks', e.target.value); if (remarksError && e.target.value.trim()) setRemarksError(false); }}
                rows={3}
                placeholder={canEditFull ? '' : 'Explain why you are updating the area or address…'}
                className={`w-full px-2.5 py-1.5 border rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1] ${remarksError ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}
              />
              {remarksError && <p className="text-[11px] text-red-600 font-semibold">Remarks are required to save changes.</p>}
            </div>
            {canEditFull && (
              <div className="space-y-1">
                <label className={labelCls}>Item Description</label>
                <textarea value={draft.item_description} onChange={e => set('item_description', e.target.value)} rows={3} className={inputCls} />
              </div>
            )}

            {/* Always-locked fields */}
            <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
              {[
                { label: 'Driver',            value: record.driver || 'Unassigned' },
                { label: 'Driver Assistants', value: (record.driver_assistants ?? []).join(', ') || '—' },
                { label: 'Time In',           value: record.time_in || '—' },
                { label: 'Time Out',          value: record.time_out || '—' },
                { label: 'Received By',       value: record.received_by || '—' },
              ].map(row => (
                <div key={row.label} className="flex flex-col gap-0.5">
                  <span className={labelCls}>{row.label} <span className="text-slate-300 normal-case tracking-normal font-normal">(Logistics only)</span></span>
                  <span className="font-semibold text-slate-400 italic">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!editing && record.attachments.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className={`${labelCls} mb-1.5`}>Attachments</p>
            <div className="space-y-1">
              {record.attachments.map((a, i) => (
                <div key={i} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded px-2 py-1">
                  <FileText className="w-3 h-3 text-[#1F3864]" />
                  <span className="font-mono text-[10px] text-slate-700">{a}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {canEdit && !editing && (
          <p className="mt-4 text-[10px] text-slate-400 border-t border-slate-100 pt-3">
            This record can be edited while its status is <span className="font-bold text-blue-600">Scheduled</span>. Once Logistics advances the status, it locks.
          </p>
        )}
      </div>

      {/* Linked Collection */}
      <LinkedCollectionCard
        record={record}
        currentUserRole={currentUserRole}
        onUpdateRecord={onUpdateRecord}
      />

      {/* Audit footer */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { label: 'Created By',  value: record.created_by },
          { label: 'Created At',  value: formatTs(record.created_at) },
          { label: 'Modified By', value: record.modified_by },
          { label: 'Updated At',  value: formatTs(record.modified_at) },
        ].map(row => (
          <div key={row.label} className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-0.5">{row.label}</p>
            <p className="text-sm font-semibold text-slate-800">{row.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Linked Collection Card ───────────────────────────────────────────────────

function LinkedCollectionCard({
  record,
  currentUserRole,
  onUpdateRecord,
}: {
  record: DeliveryRecord;
  currentUserRole: UserRole;
  onUpdateRecord: (id: string, updates: Partial<DeliveryRecord>) => void;
}) {
  const canLink = (currentUserRole === 'Logistics' || currentUserRole === 'Admin');
  const [linkInput, setLinkInput]   = useState('');
  const [linkRemarks, setLinkRemarks] = useState('');
  const [linking, setLinking]       = useState(false);
  const [linkError, setLinkError]   = useState<string | null>(null);

  const handleLink = async (collectionId: string | null) => {
    if (!linkRemarks.trim() && collectionId !== null) {
      setLinkError('A brief remark is required when linking a collection.');
      return;
    }
    setLinking(true);
    setLinkError(null);
    try {
      await onUpdateRecord(record.id, {
        linked_collection_id: collectionId,
        remarks: linkRemarks.trim() || 'Unlinked collection',
      } as any);
      setLinkInput('');
      setLinkRemarks('');
    } catch (e: any) {
      setLinkError(e.message ?? 'Failed to update linked collection');
    } finally {
      setLinking(false);
    }
  };

  const lc = record.linked_collection;
  const labelCls = 'text-[10px] text-slate-400 uppercase tracking-widest font-bold';

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Link2 className="w-3.5 h-3.5 text-[#0078C1]" />
        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Linked Collection</h4>
      </div>

      {lc ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-xs">
            <div className="flex flex-col gap-0.5">
              <span className={labelCls}>Collection ID</span>
              <span className="font-mono font-bold text-slate-800">{lc.id}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className={labelCls}>Reference</span>
              <span className="font-semibold text-slate-800">{lc.reference || '—'}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className={labelCls}>Company</span>
              <span className="font-semibold text-slate-800">{lc.company_name}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className={labelCls}>Status</span>
              <span className="font-semibold text-slate-800">
                {lc.status}
                {lc.collection_verified && (
                  <span className="ml-2 text-[10px] text-emerald-600 font-bold">✓ Verified</span>
                )}
              </span>
            </div>
          </div>
          {canLink && (
            <button
              onClick={() => handleLink(null)}
              disabled={linking}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              {linking ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
              Unlink
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {canLink ? (
            <>
              <div className="space-y-1.5 text-xs">
                <label className={labelCls}>Collection Record ID</label>
                <input
                  type="text"
                  value={linkInput}
                  onChange={e => { setLinkInput(e.target.value); setLinkError(null); }}
                  placeholder="e.g. REC-12345"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]"
                />
              </div>
              <div className="space-y-1.5 text-xs">
                <label className={labelCls}>Reason <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={linkRemarks}
                  onChange={e => { setLinkRemarks(e.target.value); setLinkError(null); }}
                  placeholder="Brief reason for linking…"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]"
                />
              </div>
              {linkError && <p className="text-[11px] text-red-600 font-semibold">{linkError}</p>}
              <button
                onClick={() => handleLink(linkInput.trim() || null)}
                disabled={linking || !linkInput.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-white bg-[#0078C1] hover:bg-[#1F3864] rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                {linking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                {linking ? 'Linking…' : 'Link Collection'}
              </button>
            </>
          ) : (
            <p className="text-xs text-slate-400 italic">No linked Accounting Collection record.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Remarks Tab ──────────────────────────────────────────────────────────────

const CONTEXT_COLOR: Record<string, string> = {
  CREATION:      'bg-emerald-100 text-emerald-700 border-emerald-200',
  GENERAL_EDIT:  'bg-blue-100 text-blue-700 border-blue-200',
  DRIVER_UPDATE: 'bg-violet-100 text-violet-700 border-violet-200',
  STATUS_CHANGE: 'bg-amber-100 text-amber-700 border-amber-200',
};

const CONTEXT_LABEL: Record<string, string> = {
  CREATION:      'Created',
  GENERAL_EDIT:  'General Edit',
  DRIVER_UPDATE: 'Driver/Delivery',
  STATUS_CHANGE: 'Status Change',
};

function RemarksTab({ recordId }: { recordId: string }) {
  const [remarks, setRemarks]   = useState<ApiRemarkLog[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.getRecordRemarks(recordId)
      .then(setRemarks)
      .catch(e => setError(e.message ?? 'Failed to load remarks.'))
      .finally(() => setLoading(false));
  }, [recordId]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-[#0078C1]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-red-600 text-sm">
        <AlertTriangle className="w-4 h-4" /> {error}
      </div>
    );
  }

  return (
    <div className="py-4 px-2 space-y-4">
      <div className="flex items-center gap-2 px-1">
        <ScrollText className="w-3.5 h-3.5 text-[#0078C1]" />
        <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider">
          Remarks History
        </h4>
        {remarks.length > 0 && (
          <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            {remarks.length}
          </span>
        )}
        <span className="text-[10px] text-slate-400 ml-auto">Read-only · most recent first</span>
      </div>

      {remarks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
          <ScrollText className="w-8 h-8 text-slate-200" />
          <p className="text-sm text-slate-400">No remarks have been recorded yet for this record.</p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-6 top-0 bottom-0 w-px bg-slate-200" />
          <div className="space-y-4">
            {remarks.map(r => (
              <div key={r.id} className="flex items-start gap-4 pl-2">
                <div className="relative z-10 w-9 h-9 rounded-full bg-[#1F3864] flex items-center justify-center shrink-0 border-2 border-white shadow-sm">
                  <ScrollText className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 bg-white border border-slate-200 rounded-xl p-4 shadow-sm min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wider ${CONTEXT_COLOR[r.context] ?? 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                      {CONTEXT_LABEL[r.context] ?? r.context}
                    </span>
                    <span className="text-xs font-semibold text-slate-700">{r.author}</span>
                    <span className="text-[11px] text-slate-400 ml-auto">{formatTs(r.created_at)}</span>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{r.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Actions Tab ──────────────────────────────────────────────────────────────

function ActionsTab({
  record,
  allRecords,
  currentUserRole,
  currentUserName,
  onUpdateRecord,
  outputActionConfigs,
}: {
  record: DeliveryRecord;
  allRecords: DeliveryRecord[];
  currentUserRole: UserRole;
  currentUserName: string;
  onUpdateRecord: (id: string, updates: Partial<DeliveryRecord>) => void;
  outputActionConfigs: Record<OutputActionTrigger, OutputActionConfig>;
}) {
  const [applying, setApplying] = useState(false);
  const [statusRemarks, setStatusRemarks] = useState('');
  const [remarksError, setRemarksError] = useState(false);

  const [selectedDriver, setSelectedDriver] = useState(record.driver);
  const [assistants, setAssistants] = useState<string[]>(record.driver_assistants ?? []);
  const [timeIn, setTimeIn] = useState(record.time_in ?? '');
  const [timeOut, setTimeOut] = useState(record.time_out ?? '');
  const [receivedBy, setReceivedBy] = useState(record.received_by ?? '');
  const [savingFields, setSavingFields] = useState(false);
  const [driverFieldsRemarks, setDriverFieldsRemarks] = useState('');
  const [driverFieldsRemarksError, setDriverFieldsRemarksError] = useState(false);

  // Sync assistants / completion fields when navigating to a different record
  useEffect(() => {
    setSelectedDriver(record.driver);
    setAssistants(record.driver_assistants ?? []);
    setTimeIn(record.time_in ?? '');
    setTimeOut(record.time_out ?? '');
    setReceivedBy(record.received_by ?? '');
    setDriverFieldsRemarks('');
    setDriverFieldsRemarksError(false);
  }, [record.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStatusChange = async (newStatus: DeliveryStatus) => {
    if (!statusRemarks.trim()) {
      setRemarksError(true);
      return;
    }
    setRemarksError(false);
    setApplying(true);
    const now = new Date().toISOString();
    const updates: Partial<DeliveryRecord> & { status_remarks?: string } = {
      status: newStatus,
      status_remarks: statusRemarks.trim(),
      modified_by: `${currentUserName} (${currentUserRole})`,
      modified_at: now,
    };

    const trigger = getOutputTrigger(record.category, newStatus);
    if (trigger) {
      const result = await runOutputActions(trigger, outputActionConfigs[trigger], {
        amName: record.account_manager, at: now, recordId: record.id, api,
      });
      updates.output_actions_log = [...result.newEntries, ...(record.output_actions_log ?? [])];
      updates.email_notification_sent = result.emailSent;
    }

    onUpdateRecord(record.id, updates);
    setStatusRemarks('');
    setApplying(false);
  };

  const addAssistant = () => setAssistants(prev => [...prev, '']);
  const updateAssistant = (i: number, val: string) =>
    setAssistants(prev => prev.map((a, idx) => (idx === i ? val : a)));
  const removeAssistant = (i: number) =>
    setAssistants(prev => prev.filter((_, idx) => idx !== i));

  const driverFieldsChanged =
    selectedDriver !== (record.driver ?? '') ||
    JSON.stringify(assistants.filter(a => a.trim())) !== JSON.stringify(record.driver_assistants ?? []) ||
    (timeIn || '') !== (record.time_in ?? '') ||
    (timeOut || '') !== (record.time_out ?? '') ||
    (receivedBy || '') !== (record.received_by ?? '');

  const handleSaveDriverFields = async () => {
    if (driverFieldsChanged && !driverFieldsRemarks.trim()) {
      setDriverFieldsRemarksError(true);
      return;
    }
    setSavingFields(true);
    await onUpdateRecord(record.id, {
      driver: selectedDriver,
      driver_assistants: assistants.filter(a => a.trim()),
      time_in: timeIn || null,
      time_out: timeOut || null,
      received_by: receivedBy || null,
      ...(driverFieldsRemarks.trim() ? { remarks: driverFieldsRemarks.trim() } : {}),
      modified_by: `${currentUserName} (${currentUserRole})`,
      modified_at: new Date().toISOString(),
    } as any);
    setSavingFields(false);
    setDriverFieldsRemarks('');
  };

  const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]';

  return (
    <div className="space-y-6">
      {/* Status update */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status Update</h4>
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-700">
            Status Change Remarks <span className="text-red-500">*</span>
          </label>
          <textarea
            value={statusRemarks}
            onChange={e => { setStatusRemarks(e.target.value); if (remarksError && e.target.value.trim()) setRemarksError(false); }}
            rows={2}
            placeholder="Reason for this status change (required)…"
            className={`w-full px-3 py-2 border rounded-lg text-xs resize-none focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1] ${remarksError ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}
          />
          {remarksError && <p className="text-[11px] text-red-600 font-semibold">Status change remarks are required before applying a new status.</p>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {([...DELIVERY_STATUSES] as DeliveryStatus[]).map(s => (
            <button
              key={s}
              onClick={() => handleStatusChange(s)}
              disabled={applying || record.status === s}
              className={`py-2.5 px-3 rounded-lg border text-xs font-bold transition-all ${
                record.status === s
                  ? 'bg-[#1F3864] text-white border-[#1F3864] cursor-default'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-[#0078C1] hover:text-[#0078C1] cursor-pointer disabled:opacity-50'
              }`}
            >
              {applying && record.status !== s ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" />
              ) : s}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-400">
          Current status: <span className="font-bold text-slate-600">{record.status}</span>
        </p>
      </div>

      {/* Driver assignment + completion fields */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Driver &amp; Delivery Details</h4>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Driver</label>
            {(() => {
              const recordSubregion = getSubregion(record.area);
              const nearbyAreas = getNearbyAreas(record.area);

              const coveringDrivers = DRIVERS.filter(d =>
                recordSubregion !== null && (DRIVER_COVERAGE_AREAS[d] ?? []).includes(recordSubregion)
              );
              const otherDrivers = DRIVERS.filter(d => !coveringDrivers.includes(d));

              // Same-day driver hint: other records in the same subregion, assigned today
              const today = new Date().toISOString().slice(0, 10);
              const subregionAreas = record.area ? [record.area, ...nearbyAreas] : [];
              const sameDayHintMap: Record<string, number> = {};
              if (recordSubregion) {
                allRecords.forEach(r => {
                  if (r.id !== record.id && r.driver && r.delivery_date === today && subregionAreas.includes(r.area)) {
                    sameDayHintMap[r.driver] = (sameDayHintMap[r.driver] ?? 0) + 1;
                  }
                });
              }
              const sameDayHints = Object.entries(sameDayHintMap);

              return (
                <>
                  <select
                    value={selectedDriver}
                    onChange={e => setSelectedDriver(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1] ${
                      !selectedDriver ? 'border-amber-400 bg-amber-50' : 'border-slate-300'
                    }`}
                  >
                    <option value="">-- Unassigned --</option>
                    {coveringDrivers.length > 0 && (
                      <optgroup label={`Covers ${recordSubregion ?? record.area}`}>
                        {coveringDrivers.map(d => <option key={d} value={d}>{d}</option>)}
                      </optgroup>
                    )}
                    <optgroup label={coveringDrivers.length > 0 ? 'Other Drivers' : 'All Drivers'}>
                      {otherDrivers.map(d => <option key={d} value={d}>{d}</option>)}
                    </optgroup>
                  </select>
                  {coveringDrivers.length > 0 && (
                    <p className="text-[10px] text-emerald-600 font-semibold">
                      {coveringDrivers.length} driver{coveringDrivers.length !== 1 ? 's' : ''} normally cover{coveringDrivers.length === 1 ? 's' : ''} the {recordSubregion} area — shown first.
                    </p>
                  )}
                  {coveringDrivers.length === 0 && (
                    <p className="text-[10px] text-slate-400">
                      No driver is mapped to {recordSubregion ?? record.area} yet — showing all drivers.
                    </p>
                  )}
                  {recordSubregion && nearbyAreas.length > 0 && (
                    <p className="text-[10px] text-slate-400 italic">
                      Part of <span className="font-semibold not-italic text-slate-500">{recordSubregion}</span> — nearby: {nearbyAreas.join(', ')}
                    </p>
                  )}
                  {sameDayHints.length > 0 && (
                    <div className="mt-1.5 bg-blue-50 border border-blue-100 rounded-lg px-2.5 py-2 space-y-0.5">
                      {sameDayHints.map(([driver, count]) => (
                        <p key={driver} className="text-[10px] text-blue-700 font-semibold flex items-center gap-1">
                          <Shield className="w-3 h-3 text-blue-400 shrink-0" />
                          {driver} — {count} record{count !== 1 ? 's' : ''} nearby today
                        </p>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">Driver Assistants</label>
              <button
                onClick={addAssistant}
                className="text-[10px] font-bold text-[#0078C1] hover:underline cursor-pointer"
              >+ Add</button>
            </div>
            {assistants.length === 0 && (
              <p className="text-[11px] text-slate-400 italic">No assistants assigned.</p>
            )}
            {assistants.map((a, i) => (
              <div key={i} className="flex gap-2">
                <select
                  value={a}
                  onChange={e => updateAssistant(i, e.target.value)}
                  className={inputCls}
                >
                  <option value="">-- Select --</option>
                  {DRIVER_ASSISTANTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <button
                  onClick={() => removeAssistant(i)}
                  className="px-2 py-1 text-slate-400 hover:text-red-500 border border-slate-200 rounded-lg hover:border-red-200 transition-colors text-xs cursor-pointer"
                  title="Remove"
                >✕</button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Time In</label>
              <input
                type="time"
                value={timeIn}
                onChange={e => setTimeIn(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Time Out</label>
              <input
                type="time"
                value={timeOut}
                onChange={e => setTimeOut(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Received By</label>
              <input
                type="text"
                value={receivedBy}
                onChange={e => setReceivedBy(e.target.value)}
                placeholder="Name of person who received the delivery"
                className={inputCls}
              />
            </div>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            <label className="text-xs font-bold text-slate-700">
              Driver &amp; Delivery Remarks{' '}
              {driverFieldsChanged
                ? <span className="text-red-500">*</span>
                : <span className="text-slate-400 font-normal">(optional — no changes detected)</span>
              }
            </label>
            <textarea
              value={driverFieldsRemarks}
              onChange={e => { setDriverFieldsRemarks(e.target.value); if (driverFieldsRemarksError && e.target.value.trim()) setDriverFieldsRemarksError(false); }}
              rows={2}
              placeholder={driverFieldsChanged ? 'Reason for this driver/vehicle/delivery detail change (required)…' : 'Optional note for this save…'}
              className={`w-full px-3 py-2 border rounded-lg text-xs resize-none focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1] ${driverFieldsRemarksError ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}
            />
            {driverFieldsRemarksError && <p className="text-[11px] text-red-600 font-semibold">Driver & delivery remarks are required when making changes to these fields.</p>}
          </div>

          <button
            onClick={handleSaveDriverFields}
            disabled={savingFields}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#0078C1] hover:bg-[#1F3864] rounded-lg transition-colors cursor-pointer disabled:opacity-60"
          >
            {savingFields ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {savingFields ? 'Saving…' : 'Save Driver & Delivery Details'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Comments Tab ─────────────────────────────────────────────────────────────

function CommentsTab({ recordId }: { recordId: string }) {
  const [comments, setComments] = useState<ApiComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentBody, setCommentBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setLoading(true);
    api.getRecordComments(recordId)
      .then(setComments)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [recordId]);

  const handleSubmit = async () => {
    const body = commentBody.trim();
    if (!body || submitting) return;
    setSubmitting(true);
    try {
      const created = await api.createRecordComment(recordId, body);
      setComments(prev => [...prev, created]);
      setCommentBody('');
    } catch {
      // silently fail — user can retry
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-[#0078C1]" />
      </div>
    );
  }

  return (
    <div className="space-y-4 py-2">
      <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2 px-1">
        <MessageSquare className="w-3.5 h-3.5 text-[#0078C1]" />
        Notes & Comments
        {comments.length > 0 && (
          <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            {comments.length}
          </span>
        )}
      </h4>

      {comments.length > 0 && (
        <div className="space-y-3">
          {comments.map(c => (
            <div key={c.id} className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-[#1F3864] flex items-center justify-center text-white text-[9px] font-black shrink-0">
                {c.author.split(' ').map((p: string) => p[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold text-slate-700">{c.author}</span>
                  <span className="text-[10px] text-slate-400 font-mono">{formatTs(c.created_at)}</span>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{c.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {comments.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
          <MessageSquare className="w-8 h-8 text-slate-200" />
          <p className="text-sm text-slate-400">No comments yet. Add the first note below.</p>
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={commentBody}
          onChange={e => setCommentBody(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit();
          }}
          placeholder="Add a note or comment… (Ctrl+Enter to send)"
          rows={2}
          className="flex-1 text-xs border border-slate-300 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1] placeholder:text-slate-400"
        />
        <button
          onClick={handleSubmit}
          disabled={!commentBody.trim() || submitting}
          className="p-2.5 bg-[#0078C1] text-white rounded-lg hover:bg-[#005fa3] disabled:opacity-40 transition-colors cursor-pointer shrink-0"
          title="Send comment (Ctrl+Enter)"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

// ─── Audit diff helpers ───────────────────────────────────────────────────────
// entry.previous_value / entry.new_value are full record snapshots (see
// server writeAuditLog calls), so a "diff" means comparing the two objects
// key by key rather than parsing a pre-computed delta.

const AUDIT_FIELD_LABELS: Record<string, string> = {
  status: 'Status',
  driver: 'Driver',
  delivery_date: 'Delivery Date',
  vehicle: 'Vehicle',
  driver_assistants: 'Driver Assistants',
  time_in: 'Time In',
  time_out: 'Time Out',
  received_by: 'Received By',
  remarks: 'Remarks',
  priority: 'Priority',
  area: 'Area',
  company_name: 'Company',
  collection_verified: 'Collection Verified',
  account_manager: 'Account Manager',
  reference: 'Reference',
};

// Beyond the explicitly-listed skip fields, also drop the audit meta-fields
// (created_by/modified_by/modified_at) since they duplicate what the entry's
// own header already shows (changed_by + timestamp), and the output-actions
// log/email flag, which aren't simple user-editable fields.
const AUDIT_SKIP_FIELDS = new Set([
  'id', 'company_id', 'customer_id', 'created_by_id',
  'created_at', 'updated_at', 'created_by', 'modified_by', 'modified_at',
  'document_attachment', 'attachments', 'output_actions_log', 'email_notification_sent',
]);

function shouldSkipAuditField(key: string): boolean {
  return AUDIT_SKIP_FIELDS.has(key) || key.endsWith('_id') || key.toLowerCase().includes('cmrx');
}

function auditFieldLabel(key: string): string {
  if (AUDIT_FIELD_LABELS[key]) return AUDIT_FIELD_LABELS[key];
  return key.split('_').map(w => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
}

function isEmptyAuditValue(v: unknown): boolean {
  return v === null || v === undefined || v === '' || v === false;
}

function formatAuditValue(v: unknown): string {
  return isEmptyAuditValue(v) ? '—' : String(v);
}

interface AuditDiffRow {
  label: string;
  oldVal: unknown;
  newVal: unknown;
  hasOld: boolean;
}

function diffAuditEntry(oldVal: unknown, newVal: unknown): AuditDiffRow[] {
  if (!newVal || typeof newVal !== 'object') return [];
  const newObj = newVal as Record<string, unknown>;
  const oldObj = (oldVal && typeof oldVal === 'object') ? oldVal as Record<string, unknown> : null;
  const rows: AuditDiffRow[] = [];

  if (oldObj) {
    const keys = Array.from(new Set([...Object.keys(newObj), ...Object.keys(oldObj)]));
    for (const key of keys) {
      if (shouldSkipAuditField(key)) continue;
      const ov = oldObj[key];
      const nv = newObj[key];
      if (JSON.stringify(ov) === JSON.stringify(nv)) continue;
      rows.push({ label: auditFieldLabel(key), oldVal: ov, newVal: nv, hasOld: true });
    }
  } else {
    for (const key of Object.keys(newObj)) {
      if (shouldSkipAuditField(key)) continue;
      const nv = newObj[key];
      if (isEmptyAuditValue(nv)) continue;
      rows.push({ label: auditFieldLabel(key), oldVal: undefined, newVal: nv, hasOld: false });
    }
  }
  return rows;
}

// ─── Audit Trail Tab ──────────────────────────────────────────────────────────

function AuditTrailTab({ recordId }: { recordId: string }) {
  const [entries, setEntries] = useState<ApiAuditEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.getRecordAudit(recordId)
      .then(setEntries)
      .catch(e => setError(e.message ?? 'Failed to load audit trail.'))
      .finally(() => setLoading(false));
  }, [recordId]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-[#0078C1]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-red-600 text-sm">
        <AlertTriangle className="w-4 h-4" /> {error}
      </div>
    );
  }

  const actionColor: Record<string, string> = {
    CREATE: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    UPDATE: 'bg-blue-100 text-blue-700 border-blue-200',
    DELETE: 'bg-red-100 text-red-700 border-red-200',
  };
  const dotColor: Record<string, string> = {
    CREATE: 'bg-emerald-500',
    UPDATE: 'bg-blue-500',
    DELETE: 'bg-red-500',
  };

  return (
    <div className="py-4 px-2 space-y-4">
      {(!entries || entries.length === 0) ? (
        <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
          <Shield className="w-10 h-10 text-slate-200" />
          <p className="text-sm text-slate-400">No audit events recorded yet for this record.</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-400 px-2">
            {entries.length} audit event{entries.length !== 1 ? 's' : ''} — most recent first
          </p>
          <div className="relative">
            <div className="absolute left-6 top-0 bottom-0 w-px bg-slate-200" />
            <div className="space-y-4">
              {entries.map(entry => (
                <div key={entry.id} className="flex items-start gap-4 pl-2">
                  <div className={`relative z-10 w-9 h-9 rounded-full flex items-center justify-center shrink-0 border-2 border-white shadow-sm ${dotColor[entry.action] ?? 'bg-slate-400'}`}>
                    <Shield className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 bg-white border border-slate-200 rounded-xl p-4 shadow-sm min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wider ${actionColor[entry.action] ?? 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                        {entry.action}
                      </span>
                      <span className="text-xs font-semibold text-slate-700">{entry.changed_by}</span>
                      <span className="text-[11px] text-slate-400 ml-auto">{formatTs(entry.timestamp)}</span>
                    </div>
                    {entry.action === 'CREATE' ? (
                      <p className="text-xs text-slate-700 font-medium mt-2">Record created</p>
                    ) : entry.action === 'DELETE' ? (
                      <p className="text-xs text-slate-700 font-medium mt-2">Record deleted</p>
                    ) : (() => {
                      const rows = diffAuditEntry(entry.previous_value, entry.new_value);
                      if (rows.length === 0) {
                        return (
                          <p className="text-xs text-slate-400 italic mt-2">
                            System update — no user-visible fields changed.
                          </p>
                        );
                      }
                      return (
                        <div className="mt-2 space-y-1.5">
                          {rows.map((row, idx) => (
                            <div key={idx} className="flex items-center flex-wrap gap-0.5">
                              <span className="text-xs text-slate-500 w-32 shrink-0">{row.label}</span>
                              {row.hasOld ? (
                                <>
                                  <span className="text-xs text-slate-400 line-through">{formatAuditValue(row.oldVal)}</span>
                                  <span className="text-slate-300 mx-1">→</span>
                                  <span className="text-xs text-slate-700 font-medium">{formatAuditValue(row.newVal)}</span>
                                </>
                              ) : (
                                <span className="text-xs text-slate-700 font-medium">{formatAuditValue(row.newVal)}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Documents Tab ────────────────────────────────────────────────────────────

type UploadedFile = {
  name: string;
  size: number;
  type: string;
  url: string; // object URL for preview
  uploadedAt: string;
};

function DocumentsTab({ record }: { record: DeliveryRecord }) {
  const [files, setFiles] = useState<UploadedFile[]>(() =>
    // Pre-populate from record.attachments (string filenames from existing data)
    record.attachments.map(name => ({
      name,
      size: 0,
      type: '',
      url: '',
      uploadedAt: record.created_at,
    }))
  );
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync when record changes (e.g. prev/next navigation)
  useEffect(() => {
    setFiles(record.attachments.map(name => ({
      name, size: 0, type: '', url: '', uploadedAt: record.created_at,
    })));
  }, [record.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const newFiles: UploadedFile[] = Array.from(incoming).map(f => ({
      name: f.name,
      size: f.size,
      type: f.type,
      url: URL.createObjectURL(f),
      uploadedAt: new Date().toISOString(),
    }));
    setFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (idx: number) => {
    setFiles(prev => {
      const next = [...prev];
      if (next[idx].url) URL.revokeObjectURL(next[idx].url);
      next.splice(idx, 1);
      return next;
    });
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const fileIcon = (type: string, name: string) => {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    if (type.startsWith('image/')) return '🖼️';
    if (type === 'application/pdf' || ext === 'pdf') return '📄';
    if (['xlsx', 'xls', 'csv'].includes(ext)) return '📊';
    if (['docx', 'doc'].includes(ext)) return '📝';
    return '📎';
  };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all ${
          dragging
            ? 'border-[#0078C1] bg-blue-50'
            : 'border-slate-300 hover:border-[#0078C1] hover:bg-slate-50'
        }`}
      >
        <Paperclip className={`w-8 h-8 transition-colors ${dragging ? 'text-[#0078C1]' : 'text-slate-300'}`} />
        <div className="text-center">
          <p className="text-sm font-bold text-slate-700">Drop files here or click to upload</p>
          <p className="text-xs text-slate-400 mt-0.5">PDF, Word, Excel, images — any format</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={e => addFiles(e.target.files)}
        />
      </div>

      {/* File list */}
      {files.length > 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {files.length} file{files.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 group">
                <span className="text-xl shrink-0">{fileIcon(f.type, f.name)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-800 truncate">{f.name}</p>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                    {f.size ? formatSize(f.size) + ' · ' : ''}{formatTs(f.uploadedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {f.url && (
                    <a
                      href={f.url}
                      download={f.name}
                      className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-[#0078C1] transition-colors"
                      title="Download"
                      onClick={e => e.stopPropagation()}
                    >
                      <FileText className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <button
                    onClick={() => removeFile(i)}
                    className="p-1.5 hover:bg-red-50 rounded text-slate-300 hover:text-red-500 transition-colors"
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-6 text-slate-400 text-xs">
          No documents attached yet. Upload files above.
        </div>
      )}

      <p className="text-[10px] text-slate-400 text-center">
        Files are stored locally in this session. Backend file storage integration pending.
      </p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DeliveryRecordWorkspace({
  record,
  allRecordIds,
  allRecords = [],
  currentUserRole,
  currentUserName,
  companies,
  onBack,
  onNavigateToRecord,
  onUpdateRecord,
  outputActionConfigs,
  forceReadOnly = false,
}: DeliveryRecordWorkspaceProps) {
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError]     = useState<string | null>(null);

  const handleDownloadPdf = async () => {
    setPdfLoading(true);
    setPdfError(null);
    try {
      const [auditEntries, remarks, comments] = await Promise.all([
        api.getRecordAudit(record.id),
        api.getRecordRemarks(record.id),
        api.getRecordComments(record.id),
      ]);
      const docData: ManifestDocumentationData = { auditEntries, remarks, comments };
      await printSingleManifest(record, companies, docData);
    } catch (err: any) {
      setPdfError(err.message ?? 'Failed to generate PDF. Please try again.');
    } finally {
      setPdfLoading(false);
    }
  };

  // Determine visible tabs per role; forceReadOnly hides the Assign tab
  const visibleTabs = ALL_TABS.filter(t =>
    t.roles.includes(currentUserRole) && !(forceReadOnly && t.id === 'actions')
  );
  const [activeTab, setActiveTab] = useState<TabId>(visibleTabs[0]?.id ?? 'general');

  // Reset to first tab when navigating to a different record
  useEffect(() => {
    setActiveTab(visibleTabs[0]?.id ?? 'general');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.id]);

  const currentIndex = allRecordIds.indexOf(record.id);
  const prevId = currentIndex > 0 ? allRecordIds[currentIndex - 1] : null;
  const nextId = currentIndex < allRecordIds.length - 1 ? allRecordIds[currentIndex + 1] : null;

  const moduleName = record.category;

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <GeneralTab
            record={record}
            currentUserRole={currentUserRole}
            currentUserName={currentUserName}
            onUpdateRecord={onUpdateRecord}
          />
        );

      case 'actions':
        return (
          <ActionsTab
            record={record}
            allRecords={allRecords}
            currentUserRole={currentUserRole}
            currentUserName={currentUserName}
            onUpdateRecord={onUpdateRecord}
            outputActionConfigs={outputActionConfigs}
          />
        );

      case 'comments':
        return <CommentsTab recordId={record.id} />;

      case 'remarks':
        return <RemarksTab recordId={record.id} />;

      case 'audit':
        return <AuditTrailTab recordId={record.id} />;

      case 'documents':
        return <DocumentsTab record={record} />;

      default:
        return null;
    }
  };

  return (
    <div className="space-y-4" id={`delivery-record-workspace-${record.id}`}>
      {/* Navigation bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-[#0078C1] hover:text-[#1F3864] text-xs font-semibold transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            {moduleName}
          </button>
          <span className="text-slate-300">/</span>
          <span className="font-mono font-black text-slate-700 text-sm truncate">{record.id}</span>
          <span className="text-slate-400 text-xs truncate hidden sm:inline">— {record.company_name}</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => prevId && onNavigateToRecord(prevId)}
            disabled={!prevId}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-semibold text-slate-600"
            title="Previous Record"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Prev
          </button>
          <span className="text-[11px] text-slate-400 px-1 hidden sm:inline">
            {currentIndex + 1} / {allRecordIds.length}
          </span>
          <button
            onClick={() => nextId && onNavigateToRecord(nextId)}
            disabled={!nextId}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-semibold text-slate-600"
            title="Next Record"
          >
            Next
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          {(['Sales Coordinator', 'Logistics', 'Admin'] as UserRole[]).includes(currentUserRole) && (
            <div className="relative">
              <button
                onClick={handleDownloadPdf}
                disabled={pdfLoading}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors font-semibold text-slate-600 disabled:opacity-60"
                title="Download delivery manifest with documentation trail (PDF)"
              >
                {pdfLoading
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Download className="w-3.5 h-3.5" />}
                {pdfLoading ? 'Generating…' : 'Download PDF'}
              </button>
              {pdfError && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[11px] text-red-700 font-semibold shadow-md whitespace-nowrap max-w-xs">
                  <AlertTriangle className="w-3 h-3 inline mr-1" />
                  {pdfError}
                  <button
                    onClick={() => setPdfError(null)}
                    className="ml-2 text-red-400 hover:text-red-600 font-bold cursor-pointer"
                  >✕</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tab Navigation + Content */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 overflow-x-auto">
          <div className="flex items-stretch min-w-max">
            {visibleTabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-5 py-4 text-sm whitespace-nowrap border-b-[3px] transition-all ${
                    isActive
                      ? 'border-[#1F3864] text-[#1F3864] bg-blue-50/70 font-semibold'
                      : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100 font-medium'
                  }`}
                >
                  <Icon className="w-[18px] h-[18px] shrink-0" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-5">
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
}
