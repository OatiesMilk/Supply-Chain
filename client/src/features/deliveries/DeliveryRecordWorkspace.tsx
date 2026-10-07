import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft, ChevronLeft, ChevronRight,
  ClipboardList, History, UserPlus, MessagesSquare, FolderOpen,
  FileText, Shield, Settings, MessageSquare, Paperclip,
  Loader2, AlertTriangle, Send, Check, Truck,
  RotateCcw, PackageSearch, ShoppingCart, ListChecks, Download,
  ScrollText, Link2, X as XCircle
} from 'lucide-react';
import { DeliveryRecord, DeliveryCategory, UserRole, DeliveryStatus, OutputActionConfig, OutputActionTrigger, PriorityLevel, ItemType } from '@/types';
import { api, ApiAuditEntry, ApiComment, ApiCompany, ApiRemarkLog } from '@/api';
import { printSingleManifest, ManifestDocumentationData } from '@/features/deliveries/DeliveryManifest';
import { DRIVERS, DRIVER_ASSISTANTS, DELIVERY_STATUSES, AREAS, AREA_HIERARCHY, VEHICLES, PRIORITIES, ITEM_TYPES, ACCOUNT_MANAGERS, DRIVER_COVERAGE_AREAS, getSubregion, getNearbyAreas } from '@/data';
import ComboboxField from '@/components/ComboboxField';
import { Pencil, X as XIcon, Save, Plus } from 'lucide-react';
import { getOutputTrigger, runOutputActions } from '@/outputActions';
import StatusStepper from '@/components/StatusStepper';
import { POD_ATTACHMENT_ACCEPT, validatePodAttachments } from '@/utils/attachmentValidation';
import PodUploader from '@/components/PodUploader';
import { usePodAttachments } from '@/api/queries/usePodAttachments';
import { completionError } from '@/utils/podRequirement';
import { DocumentSize, DEFAULT_DOCUMENT_SIZE } from '@/utils/documentSize';
import DocumentSizeSelect from '@/components/DocumentSizeSelect';
import { CompanyHistoryButton } from '@/components/CompanyHistoryPanel';
import { useUIStore } from '@/store/uiStore';
import WorkspaceTabs from './WorkspaceTabs';
import { WorkspaceDraftProvider, useWorkspaceDraft, useWorkspaceNavigation } from './WorkspaceDrafts';

import { useRecordTimeInMutation } from '@/api/queries/useRecordsQuery';
import { selectableStatuses, canRecordTimeIn, isDraftRecord, manilaToday, manilaDateTimeInput, manilaInputToIso } from '@/utils/recordLifecycle';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTs(ts: string): string {
  return new Date(ts).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

const STATUS_COLOR: Record<string, string> = {
  'Draft': 'bg-slate-100 text-slate-700 border-slate-300',
  'In Transit': 'bg-cyan-50 text-cyan-700 border-cyan-200',
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
  onUpdateRecord: (id: string, updates: Partial<DeliveryRecord>) => Promise<void>;
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
  { id: 'general',   label: 'Overview',        icon: ClipboardList,  roles: ['Sales Coordinator', 'Logistics', 'Admin'] },
  { id: 'actions',   label: 'Dispatch & Logistics', icon: UserPlus, roles: ['Logistics', 'Admin'] },
  { id: 'comments',  label: 'Comments',        icon: MessagesSquare, roles: ['Sales Coordinator', 'Logistics', 'Admin'] },
  { id: 'remarks',   label: 'Remarks History', icon: ScrollText,     roles: ['Sales Coordinator', 'Logistics', 'Admin'] },
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
  priority: PriorityLevel; reference: string; area: string; vehicle: string;
  account_manager: string; delivery_date: string;
  item_type: ItemType; is_draft: 'Yes' | 'No'; remarks: string; item_description: string; line_items: { sku: string, quantity: number }[];
  address: string;
};

function GeneralTab({
  record,
  currentUserRole,
  currentUserName,
  onUpdateRecord,
  readOnly = false,
}: {
  record: DeliveryRecord;
  currentUserRole: UserRole;
  currentUserName: string;
  onUpdateRecord: (id: string, updates: Partial<DeliveryRecord>) => Promise<void>;
  readOnly?: boolean;
}) {
  // SC can edit all fields while the record is still Scheduled; Logistics can always edit Area + Address
  const canEditFull = !readOnly && (currentUserRole === 'Sales Coordinator' || currentUserRole === 'Admin') && (record.status === 'Scheduled' || isDraftRecord(record));
  const canManageDraft = !readOnly && (currentUserRole === 'Sales Coordinator' || currentUserRole === 'Admin') && !record.time_in;
  const [lifecycleRemarks, setLifecycleRemarks] = useState('');
  const canEditAreaAddress = !readOnly && currentUserRole === 'Logistics';
  const canEdit = canEditFull || canEditAreaAddress;

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [remarksError, setRemarksError] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft>({
    priority: record.priority,
    reference: record.reference,
    area: record.area,
    vehicle: record.vehicle || '(None)',
    account_manager: record.account_manager,
    delivery_date: record.delivery_date,
    
    item_type: record.item_type,
    is_draft: record.is_draft,
    remarks: record.remarks || '',
    item_description: record.item_description || '',
    address: record.address ?? '',
    line_items: record.line_items || [],
  });
  useWorkspaceDraft('general', editing || !!lifecycleRemarks, saving);

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
      
      item_type: record.item_type,
      is_draft: record.is_draft,
      remarks: record.remarks || '',
      item_description: record.item_description || '',
      address: record.address ?? '',
    line_items: record.line_items || [],
    });
  }, [record.id]);

  const set = <K extends keyof EditDraft>(k: K, v: EditDraft[K]) => setDraft(p => ({ ...p, [k]: v }));

  const handleStartEdit = () => {
    setSaveError(null);
    setRemarksError(false);
    // A bulk priority change can update this record while the workspace stays open.
    setDraft(d => ({ ...d, priority: record.priority }));
    // Keep the saved note in read mode; every edit starts with a fresh reason.
    setDraft(d => ({ ...d, remarks: '' }));
    setEditing(true);
  };

  const handleSave = async () => {
    if (!draft.remarks.trim()) {
      setRemarksError(true);
      return;
    }
    setRemarksError(false);
    setSaveError(null);
    setSaving(true);
    const updates = canEditFull
      ? { priority: draft.priority, reference: draft.reference, area: draft.area, vehicle: draft.vehicle, account_manager: draft.account_manager, delivery_date: draft.delivery_date, item_type: draft.item_type, remarks: draft.remarks, item_description: draft.item_description, line_items: draft.line_items, address: draft.address }
      : { area: draft.area, address: draft.address, remarks: draft.remarks };
    try {
      await onUpdateRecord(record.id, {
        ...updates,
        modified_by: `${currentUserName} (${currentUserRole})`,
        modified_at: new Date().toISOString(),
      });
      setEditing(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save the record. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDraft({
      priority: record.priority,
      reference: record.reference,
      area: record.area,
      vehicle: record.vehicle || '(None)',
      account_manager: record.account_manager,
      delivery_date: record.delivery_date,
      
      item_type: record.item_type,
      is_draft: record.is_draft,
      remarks: record.remarks || '',
      item_description: record.item_description || '',
      address: record.address ?? '',
    line_items: record.line_items || [],
    });
    setRemarksError(false);
    setEditing(false);
  };

  const inputCls = 'w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]';
  const labelCls = 'text-[10px] text-slate-400 uppercase tracking-widest font-bold';

  return (
    <div className="space-y-5">
      {/* Status stepper */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Status Progression</p>
        <StatusStepper status={record.status} />
      </div>

      {canManageDraft && selectableStatuses(record, currentUserRole).some(status => status === 'Draft' || status === 'Scheduled') && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <label htmlFor="submission-change-remarks" className="block text-xs font-bold text-slate-700">Remarks — reason for change (required)</label>
          <p id="submission-change-remarks-help" className="text-xs text-slate-600">Explain why you are submitting or returning this record to Draft. The reason is saved with your name in Remarks History.</p>
          <textarea id="submission-change-remarks" aria-describedby="submission-change-remarks-help" required value={lifecycleRemarks} onChange={e => setLifecycleRemarks(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs" placeholder="Reason for submitting or returning to draft" />
          {selectableStatuses(record, currentUserRole).filter(status => isDraftRecord(record) ? status === 'Scheduled' : status === 'Draft').map(status => (
            <button key={status} type="button" disabled={saving || !lifecycleRemarks.trim()} className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
              onClick={async () => { setSaving(true); setSaveError(null); try { await onUpdateRecord(record.id, { status, remarks: lifecycleRemarks.trim() }); setLifecycleRemarks(''); } catch (error) { setSaveError(error instanceof Error ? error.message : 'Could not change submission status.'); } finally { setSaving(false); } }}>
              {isDraftRecord(record) ? 'Submit' : 'Return to Draft'}
            </button>
          ))}
          <p className="text-xs text-slate-500">Drafts retain existing assignments and stay hidden from drivers until submitted.</p>
          {saveError && <p role="alert" className="text-xs text-red-700">{saveError}</p>}
        </div>
      )}

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
                { label: 'Created At',      value: record.created_at ? formatTs(record.created_at) : '—' },
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
            {record.line_items && record.line_items.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className={`${labelCls} mb-1.5`}>Line Items</p>
                <ul className="list-disc list-inside text-sm text-slate-700 leading-relaxed">
                  {record.line_items.map((li, idx) => (
                    <li key={idx}>
                      <span className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded mr-1">x{li.quantity}</span>
                      {li.sku}
                    </li>
                  ))}
                </ul>
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
                    <select value={draft.priority} onChange={e => set('priority', e.target.value as PriorityLevel)} className={inputCls}>
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
                    <select value={draft.item_type} onChange={e => set('item_type', e.target.value as ItemType)} className={inputCls}>
                      {ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className={labelCls}>Delivery Date</label>
                    <input type="date" value={draft.delivery_date} onChange={e => set('delivery_date', e.target.value)} className={inputCls} />
                  </div>
                  <div className="space-y-1">
                    <label className={labelCls}>Date &amp; Time</label>
                    
                  </div>

                </>
              )}
            </div>
            <div className="space-y-1">
              <label htmlFor="overview-change-remarks" className={labelCls}>
                Remarks — reason for change <span className="text-red-500">*</span>
              </label>
              <p id="overview-change-remarks-help" className="text-xs text-slate-600">Explain why you are making this change. The reason is saved with your name in Remarks History.</p>
              <textarea
                id="overview-change-remarks"
                aria-describedby="overview-change-remarks-help"
                required
                value={draft.remarks}
                onChange={e => { set('remarks', e.target.value); if (remarksError && e.target.value.trim()) setRemarksError(false); }}
                rows={3}
                placeholder={canEditFull ? '' : 'Explain why you are updating the area or address…'}
                className={`w-full px-2.5 py-1.5 border rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1] ${remarksError ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}
              />
              {remarksError && <p className="text-[11px] text-red-600 font-semibold">Remarks are required to save changes.</p>}
              {saveError && <p role="alert" className="text-[11px] text-red-600 font-semibold">{saveError}</p>}
            </div>
            {canEditFull && (
              <div className="space-y-1 mt-4 pt-4 border-t border-slate-100">
                <div className="flex justify-between items-center mb-1.5">
                  <label className={labelCls}>Line Items</label>
                  <button
                    type="button"
                    onClick={() => set('line_items', [...(draft.line_items || []), { sku: '', quantity: 1 }])}
                    className="flex items-center gap-1 text-[11px] font-bold text-[#0078C1] hover:text-[#1F3864] cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Item
                  </button>
                </div>
                {(draft.line_items || []).map((item, index) => (
                  <div key={index} className="flex items-center gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="SKU or Description"
                      value={item.sku}
                      onChange={(e) => {
                        const newItems = [...(draft.line_items || [])];
                        newItems[index].sku = e.target.value;
                        set('line_items', newItems);
                      }}
                      className={inputCls}
                    />
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => {
                        const newItems = [...(draft.line_items || [])];
                        newItems[index].quantity = parseInt(e.target.value) || 1;
                        set('line_items', newItems);
                      }}
                      className={`${inputCls} w-20`}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const newItems = (draft.line_items || []).filter((_, i) => i !== index);
                        set('line_items', newItems);
                      }}
                      className="p-1 text-slate-400 hover:text-red-500 cursor-pointer shrink-0"
                    >
                      <XIcon className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {(!draft.line_items || draft.line_items.length === 0) && (
                  <p className="text-[11px] text-slate-400 italic">No line items added.</p>
                )}
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

        {editing && (
          <div className="flex gap-2 justify-end pt-4 border-t border-slate-100 mt-6">
            <button
              onClick={handleCancel}
              disabled={saving}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors text-[11px] uppercase cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2.5 bg-[#0078C1] hover:bg-[#1F3864] text-white font-bold rounded-lg transition-colors text-[11px] uppercase flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>

      {/* Linked Collection */}
      <LinkedCollectionCard
        record={record}
        currentUserRole={currentUserRole}
        onUpdateRecord={onUpdateRecord}
        readOnly={readOnly}
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
  readOnly = false,
}: {
  record: DeliveryRecord;
  currentUserRole: UserRole;
  onUpdateRecord: (id: string, updates: Partial<DeliveryRecord>) => Promise<void>;
  readOnly?: boolean;
}) {
  const canLink = !readOnly && (currentUserRole === 'Logistics' || currentUserRole === 'Admin');
  const [linkInput, setLinkInput]   = useState('');
  const [linkRemarks, setLinkRemarks] = useState('');
  const [linking, setLinking]       = useState(false);
  const [linkError, setLinkError]   = useState<string | null>(null);
  useWorkspaceDraft('linked-collection', !!(linkInput || linkRemarks), linking);

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
                <label htmlFor="collection-link-remarks" className={labelCls}>Remarks — reason for change <span className="text-red-500">*</span></label>
                <p id="collection-link-remarks-help" className="text-xs text-slate-600">Explain why you are linking this collection. This is the change reason, not a discussion comment.</p>
                <input
                  id="collection-link-remarks"
                  aria-describedby="collection-link-remarks-help"
                  required
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
  onUpdateRecord: (id: string, updates: Partial<DeliveryRecord>) => Promise<void>;
  outputActionConfigs: Record<OutputActionTrigger, OutputActionConfig>;
}) {
  const [saving, setSaving] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<DeliveryStatus>(record.status);

  const [actionRemarks, setActionRemarks] = useState('');
  const [actionRemarksError, setActionRemarksError] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const { readiness: podReadiness } = usePodAttachments(record.id);
  const timeInMutation = useRecordTimeInMutation();

  const [selectedDriver, setSelectedDriver] = useState(record.driver);
  const [assistants, setAssistants] = useState<string[]>(record.driver_assistants ?? []);
  const [timeIn, setTimeIn] = useState(manilaDateTimeInput(record.time_in));
  const [timeOut, setTimeOut] = useState(manilaDateTimeInput(record.time_out));
  const [receivedBy, setReceivedBy] = useState(record.received_by ?? '');

  const draftRecord = isDraftRecord(record);
  const statusOptions = selectableStatuses(record, currentUserRole);

  const statusChanged = selectedStatus !== record.status;
  const photoError = statusChanged ? completionError(record, selectedStatus, receivedBy, podReadiness) : null;
  const driverFieldsChanged =
    selectedDriver !== (record.driver ?? '') ||
    JSON.stringify(assistants.filter(a => a.trim())) !== JSON.stringify(record.driver_assistants ?? []) ||
    timeIn !== manilaDateTimeInput(record.time_in) ||
    timeOut !== manilaDateTimeInput(record.time_out) ||
    (receivedBy || '') !== (record.received_by ?? '');

  const hasChanges = statusChanged || driverFieldsChanged;

  // Sync state when navigating to a different record
  useEffect(() => {
    setSelectedDriver(record.driver);
    setAssistants(record.driver_assistants ?? []);
    setTimeIn(manilaDateTimeInput(record.time_in));
    setTimeOut(manilaDateTimeInput(record.time_out));
    setReceivedBy(record.received_by ?? '');
    setSelectedStatus(record.status);
    setActionRemarks('');
    setActionRemarksError(false);
    setSaveFeedback(null);
  }, [record.id, record.time_in, record.time_out, record.status]); // eslint-disable-line react-hooks/exhaustive-deps

  useWorkspaceDraft('dispatch', hasChanges || !!actionRemarks, saving || podReadiness.uploading);

  const handleSave = async () => {
    if (saving || photoError) return;

    if (!hasChanges && !actionRemarks.trim()) {
      setSaveFeedback({ message: 'No changes detected to save.', type: 'info' });
      return;
    }

    if (hasChanges && !actionRemarks.trim()) {
      setActionRemarksError(true);
      return;
    }

    setActionRemarksError(false);
    setSaveFeedback(null);
    setSaving(true);

    const now = new Date().toISOString();
    let detailsSaved = false;

    try {
      // The update hook routes status changes to PATCH /status and ordinary
      // dispatch fields to PUT /records/:id. Keep them as two ordered writes
      // behind this single button so neither set of changes is silently lost.
      if (driverFieldsChanged || (!statusChanged && actionRemarks.trim())) {
        const fieldUpdates: Partial<DeliveryRecord> = {
          remarks: actionRemarks.trim(),
          modified_by: `${currentUserName} (${currentUserRole})`,
          modified_at: now,
        };
        if (selectedDriver !== (record.driver ?? '')) fieldUpdates.driver = selectedDriver;
        if (JSON.stringify(assistants.filter(a => a.trim())) !== JSON.stringify(record.driver_assistants ?? [])) {
          fieldUpdates.driver_assistants = assistants.filter(a => a.trim());
        }
        if (timeIn !== manilaDateTimeInput(record.time_in)) fieldUpdates.time_in = timeIn ? manilaInputToIso(timeIn) : null;
        if (timeOut !== manilaDateTimeInput(record.time_out)) fieldUpdates.time_out = timeOut ? manilaInputToIso(timeOut) : null;
        if ((receivedBy || '') !== (record.received_by ?? '')) fieldUpdates.received_by = receivedBy;
        await onUpdateRecord(record.id, fieldUpdates);
        detailsSaved = true;
      }

      if (statusChanged) {
        const statusUpdates: Partial<DeliveryRecord> & { status_remarks?: string } = {
          status: selectedStatus,
          status_remarks: actionRemarks.trim(),
          modified_by: `${currentUserName} (${currentUserRole})`,
          modified_at: now,
          ...(selectedStatus === 'Delivered' ? { received_by: receivedBy.trim() } : {}),
        };
        await onUpdateRecord(record.id, statusUpdates);
      }

      setActionRemarks('');
      setSaveFeedback({ message: 'Dispatch & Logistics changes saved successfully.', type: 'success' });
      setTimeout(() => setSaveFeedback(null), 3000);

      if (statusChanged) {
        const trigger = getOutputTrigger(record.category, selectedStatus);
        if (trigger) {
          await runOutputActions(trigger, outputActionConfigs[trigger], {
            amName: record.account_manager, at: now, recordId: record.id, api,
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save the changes. Please try again.';
      setSaveFeedback({
        message: detailsSaved && statusChanged
          ? `Dispatch details were saved, but the status was not changed: ${message}`
          : message,
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]';

  return (
    <div className="space-y-6">
      {record.status !== 'Delivered' && <PodUploader key={record.id} recordId={record.id} required disabled={saving} />}
      {canRecordTimeIn(record) && (currentUserRole === 'Logistics' || currentUserRole === 'Admin') && <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-2">
        <p className="text-xs text-blue-900">Record Time In to start this run. Enter remarks below before starting.</p>
        <button type="button" disabled={saving || !actionRemarks.trim()} className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
          onClick={async () => { setSaving(true); setSaveFeedback(null); try { await timeInMutation.mutateAsync({ id: record.id, remarks: actionRemarks.trim() }); setActionRemarks(''); } catch (error) { setSaveFeedback({ message: error instanceof Error ? error.message : 'Could not record Time In.', type: 'error' }); } finally { setSaving(false); } }}>
          Record Time In
        </button>
      </div>}
      {/* Status update */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status Update</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {statusOptions.map(s => (
            <button
              type="button"
              key={s}
              onClick={() => { setSelectedStatus(s); setSaveFeedback(null); }}
              disabled={saving}
              aria-pressed={selectedStatus === s}
              className={`min-h-10 rounded-lg border px-3 py-2.5 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0078C1] disabled:opacity-50 ${
                selectedStatus === s
                  ? 'border-[#1F3864] bg-[#1F3864] text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-[#0078C1] hover:text-[#0078C1]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="text-xs text-slate-600">
            Current status: <span className="font-semibold text-slate-800">{record.status}</span>
            {selectedStatus !== record.status && <span className="ml-2 text-[#1F3864]">→ {selectedStatus} (unsaved)</span>}
          </p>
        </div>
        {photoError && <p role="alert" className="text-xs font-semibold text-red-700">{photoError}</p>}
      </div>

      {draftRecord && <p className="text-xs text-slate-600">Submit this draft before changing its assignment. Existing assignments are retained.</p>}
      {/* Driver assignment + completion fields */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Driver &amp; Delivery Details</h4>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Driver</label>
            {(() => {
              const recordSubregion = getSubregion(record.area);
              const nearbyAreas = getNearbyAreas(record.area);

              const coveringDrivers = DRIVERS.filter(d => {
                const coverage = DRIVER_COVERAGE_AREAS[d] ?? [];
                if (coverage.length === 0) return false;
                const matchesSubregion = recordSubregion ? coverage.includes(recordSubregion) : false;
                const matchesArea = record.area
                  ? coverage.some(a =>
                      record.area.toLowerCase().includes(a.toLowerCase()) ||
                      a.toLowerCase().includes(record.area.toLowerCase())
                    )
                  : false;
                return matchesSubregion || matchesArea;
              });
              const otherDrivers = DRIVERS.filter(d => !coveringDrivers.includes(d));

              const today = manilaToday();
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
                    disabled={draftRecord || saving}
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
                    <p className="text-[10px] text-[#0078C1] font-semibold mt-1 flex flex-col">
                      <span className="mb-0.5 border-b border-blue-100 pb-0.5 inline-block w-max">Also assigned to {recordSubregion ?? record.area} today:</span>
                      {sameDayHints.map(([d, count]) => (
                        <span key={d}>
                          • {d} <span className="opacity-75">({count} {count === 1 ? 'run' : 'runs'})</span>
                        </span>
                      ))}
                    </p>
                  )}
                </>
              );
            })()}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Driver Assistants</label>
            <div className="space-y-2">
              {assistants.map((assistant, index) => (
                <div key={index} className="flex items-center gap-2">
                  <select
                    value={assistant}
                    disabled={draftRecord || saving}
                    onChange={e => {
                      const newAssistants = [...assistants];
                      newAssistants[index] = e.target.value;
                      setAssistants(newAssistants);
                    }}
                    className={inputCls}
                  >
                    <option value="">-- Unassigned --</option>
                    {DRIVER_ASSISTANTS.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      const newAssistants = assistants.filter((_, i) => i !== index);
                      setAssistants(newAssistants);
                    }}
                    disabled={draftRecord || saving}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                disabled={draftRecord || saving}
                onClick={() => setAssistants([...assistants, ''])}
                className="flex items-center gap-1 text-[11px] font-semibold text-[#0078C1] hover:text-[#1F3864] disabled:opacity-50"
              >
                <Plus className="w-3 h-3" /> Add Assistant
              </button>
            </div>
          </div>

          <div className="space-y-1.5 border-t border-slate-100 pt-3">
            <label className="text-xs font-bold text-slate-700">Received By *</label>
            <input
              type="text"
              value={receivedBy}
              disabled={saving}
              onChange={e => setReceivedBy(e.target.value)}
              placeholder="Name of receiver (if any)"
              className={inputCls}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Time In (Manila)</label>
              <input
                type="datetime-local"
                value={timeIn}
                disabled={!record.time_in || saving}
                onChange={e => setTimeIn(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Time Out (Manila)</label>
              <input
                type="datetime-local"
                value={timeOut}
                disabled={!record.time_out || saving}
                onChange={e => setTimeOut(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
          <p className="text-xs text-slate-500">Time In starts the run; Time Out is saved automatically on completion. Existing timestamps can be corrected above with remarks, using Manila time.</p>
        </div>
      </div>

      {/* Unified Save Model */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700">
            Change Reason / Remarks
            {hasChanges
              ? <span className="text-red-500 ml-1">*</span>
              : <span className="text-slate-400 font-normal ml-1">(optional — no changes detected)</span>
            }
          </label>
          <textarea
            value={actionRemarks}
            onChange={e => { setActionRemarks(e.target.value); if (actionRemarksError && e.target.value.trim()) setActionRemarksError(false); }}
            rows={3}
            placeholder={hasChanges ? 'Reason for the changes above (required)…' : 'Optional note…'}
            className={`w-full px-3 py-2 border rounded-lg text-xs resize-none focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1] ${actionRemarksError ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}
          />
          {actionRemarksError && <p className="text-[11px] text-red-600 font-semibold">A reason is required when making changes to dispatch or status fields.</p>}
        </div>

        {saveFeedback && <p role="alert" className={`text-[11px] font-semibold ${saveFeedback.type === 'success' ? 'text-emerald-700' : saveFeedback.type === 'info' ? 'text-amber-700' : 'text-red-600'}`}>{saveFeedback.message}</p>}

        <div className="flex gap-2 justify-end pt-4 border-t border-slate-200 mt-6">
          <button
            onClick={() => {
              setSelectedStatus(record.status);
              setSelectedDriver(record.driver);
              setAssistants(record.driver_assistants ?? []);
              setTimeIn(manilaDateTimeInput(record.time_in));
              setTimeOut(manilaDateTimeInput(record.time_out));
              setReceivedBy(record.received_by ?? '');
              setActionRemarks('');
              setActionRemarksError(false);
              setSaveFeedback(null);
            }}
            disabled={saving || !hasChanges}
            className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg transition-colors text-[11px] uppercase cursor-pointer disabled:opacity-50"
          >
            Revert
          </button>
          <button
            onClick={handleSave}
            disabled={saving || (hasChanges && !actionRemarks.trim()) || !!photoError}
            className="px-6 py-2.5 bg-[#0078C1] hover:bg-[#1F3864] text-white font-bold rounded-lg transition-colors text-[11px] uppercase flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Comments Tab ─────────────────────────────────────────────────────────────

function CommentsTab({ recordId, readOnly = false }: { recordId: string; readOnly?: boolean }) {
  const [comments, setComments] = useState<ApiComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentBody, setCommentBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [sendError, setSendError] = useState('');
  const [retry, setRetry] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useWorkspaceDraft('comments', !!commentBody, submitting);

  useEffect(() => {
    setLoading(true);
    setLoadError('');
    api.getRecordComments(recordId)
      .then(setComments)
      .catch(() => setLoadError('Could not load comments. Please try again.'))
      .finally(() => setLoading(false));
  }, [recordId, retry]);

  const handleSubmit = async () => {
    const body = commentBody.trim();
    if (readOnly || !body || submitting) return;
    setSubmitting(true);
    setSendError('');
    try {
      const created = await api.createRecordComment(recordId, body);
      setComments(prev => [...prev, created]);
      setCommentBody('');
    } catch {
      setSendError('Could not send your comment. Your text is kept below; try again.');
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
        Comments
        {comments.length > 0 && (
          <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            {comments.length}
          </span>
        )}
      </h4>
      <p id="record-comment-help" className="text-sm text-slate-600">Optional discussion about this record. Comments do not replace the remarks required when making changes.</p>
      {loadError && <div role="alert" className="text-sm text-red-700">{loadError} <button type="button" onClick={() => setRetry(value => value + 1)} className="min-h-11 rounded px-3 font-semibold underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700">Retry loading comments</button></div>}
      {readOnly && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">RMA is view only for Logistics. You can read the discussion here.</p>}

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

      {!loadError && comments.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
          <MessageSquare className="w-8 h-8 text-slate-200" />
          <p className="text-sm text-slate-400">{readOnly ? 'No comments yet.' : 'No comments yet. Add the first comment below.'}</p>
        </div>
      )}

      {!readOnly && <div>
      <label htmlFor="record-comment-body" className="mb-1 block text-sm font-medium text-slate-700">Comment (optional)</label>
      <div className="flex items-end gap-2">
        <textarea
          id="record-comment-body"
          aria-describedby="record-comment-help"
          disabled={submitting}
          ref={inputRef}
          value={commentBody}
          onChange={e => setCommentBody(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit();
          }}
          placeholder="Add to the discussion… (Ctrl+Enter to send)"
          rows={2}
          className="min-w-0 flex-1 text-base border border-slate-300 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1] placeholder:text-slate-400"
        />
        <button
          type="button"
          aria-label="Send comment"
          onClick={handleSubmit}
          disabled={!commentBody.trim() || submitting}
          className="min-h-11 min-w-11 touch-manipulation p-2.5 bg-[#0078C1] text-white rounded-lg hover:bg-[#005fa3] disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 cursor-pointer shrink-0"
          title="Send comment (Ctrl+Enter)"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
      {sendError && <p role="alert" className="mt-2 text-sm text-red-700">{sendError}</p>}
      </div>}
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

function DocumentsTab({ record }: { record: DeliveryRecord }) {
  const { files, readiness, uploadFiles, removeFile: deleteFile } = usePodAttachments(record.id);
  const uploading = readiness.uploading;
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [removeRemarks, setRemoveRemarks] = useState('');
  const [removing, setRemoving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useWorkspaceDraft('documents', false, uploading || removing);

  useEffect(() => {
    setError(null);
  }, [record.id]);

  const addFiles = async (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0 || uploading || removing) return;
    const selectedFiles = Array.from(incoming);
    const validationError = validatePodAttachments(selectedFiles);
    if (validationError) {
      setError(validationError);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    setError(null);
    try {
      await uploadFiles(selectedFiles);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removeFile = async () => {
    if (!confirmRemoveId) return;
    setRemoving(true);
    setError(null);
    try {
      await deleteFile({ id: confirmRemoveId, remarks: removeRemarks });
      setConfirmRemoveId(null);
      setRemoveRemarks('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove attachment.');
    } finally {
      setRemoving(false);
    }
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
        onDrop={e => { e.preventDefault(); setDragging(false); if (!uploading) addFiles(e.dataTransfer.files); }}
        onClick={() => { if (!uploading) inputRef.current?.click(); }}
        aria-busy={uploading}
        className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all ${
          dragging
            ? 'border-[#0078C1] bg-blue-50'
            : uploading
              ? 'border-slate-200 bg-slate-50 cursor-wait'
              : 'border-slate-300 hover:border-[#0078C1] hover:bg-slate-50'
        }`}
      >
        <Paperclip className={`w-8 h-8 transition-colors ${dragging ? 'text-[#0078C1]' : 'text-slate-300'}`} />
        <div className="text-center">
          <p className="text-sm font-bold text-slate-700">{uploading ? 'Uploading…' : 'Drop files here or click to upload'}</p>
            <p className="text-xs text-slate-400 mt-0.5">PDF, JPG, PNG, or DOC — up to 10 MB each</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={POD_ATTACHMENT_ACCEPT}
          className="hidden"
          disabled={uploading}
          onChange={e => addFiles(e.target.files)}
        />
      </div>

      {readiness.loading && <p role="status" className="text-xs text-slate-600">Loading attachments…</p>}
      {readiness.loadFailed && <p role="alert" className="text-xs text-red-700">Could not load attachments.</p>}
      {/* File list */}
      {files.length > 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {files.length} file{files.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {files.map(f => (
              <div key={f.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 group">
                <span className="text-xl shrink-0">{fileIcon(f.mime_type, f.name)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-800 truncate">{f.name}</p>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                    {f.size ? formatSize(f.size) + ' · ' : ''}{formatTs(f.uploaded_at)}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <a
                      href={f.download_url}
                      download={f.name}
                      className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-[#0078C1] transition-colors"
                      title="Download"
                      onClick={e => e.stopPropagation()}
                    >
                      <FileText className="w-3.5 h-3.5" />
                    </a>
                  <button
                    disabled={uploading || removing}
                    onClick={() => setConfirmRemoveId(f.id)}
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

      {/* Removal Confirmation Modal */}
      {confirmRemoveId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-sm font-black text-slate-900">Remove Attachment</h3>
            <p className="text-xs text-slate-600">
              Are you sure you want to remove <span className="font-bold">{files.find(f => f.id === confirmRemoveId)?.name}</span>? This action cannot be undone and will be permanently recorded in the audit trail.
            </p>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-700">Remarks <span className="text-red-500">*</span></label>
              <textarea
                value={removeRemarks}
                onChange={e => setRemoveRemarks(e.target.value)}
                rows={2}
                placeholder="Reason for removal..."
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-[#0078C1] focus:border-[#0078C1]"
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                disabled={removing}
                onClick={() => { setConfirmRemoveId(null); setRemoveRemarks(''); setError(null); }}
                className="px-4 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                disabled={removing || !removeRemarks.trim()}
                onClick={removeFile}
                className="px-4 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg flex items-center gap-1.5"
              >
                {removing ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <p role="alert" className="text-xs text-red-600 text-center">{error}</p>}
      <p className="text-[10px] text-slate-400 text-center">Files are stored in the local Docker volume and protected by record access permissions.</p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DeliveryRecordWorkspace(props: DeliveryRecordWorkspaceProps) {
  return (
    <WorkspaceDraftProvider key={`${props.record.id}-${props.currentUserRole}-${props.forceReadOnly ?? false}`}>
      <RecordWorkspace {...props} />
    </WorkspaceDraftProvider>
  );
}

function RecordWorkspace({
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
  const { requestLeave, pending } = useWorkspaceNavigation();
  const navigate = useUIStore(s => s.handleNavigate);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError]     = useState<string | null>(null);
  const [docSize, setDocSize]       = useState<DocumentSize>(DEFAULT_DOCUMENT_SIZE);

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
      await printSingleManifest(record, companies, docData, docSize);
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

  const currentIndex = allRecordIds.indexOf(record.id);
  const prevId = currentIndex > 0 ? allRecordIds[currentIndex - 1] : null;
  const nextId = currentIndex < allRecordIds.length - 1 ? allRecordIds[currentIndex + 1] : null;

  const moduleName = record.category;

  const renderTabContent = (tabId: string) => {
    switch (tabId) {
      case 'general':
        return (
          <GeneralTab
            record={record}
            currentUserRole={currentUserRole}
            currentUserName={currentUserName}
            onUpdateRecord={onUpdateRecord}
            readOnly={forceReadOnly}
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
        return <CommentsTab recordId={record.id} readOnly={forceReadOnly} />;

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
            onClick={() => requestLeave(onBack)}
            disabled={pending}
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
            onClick={() => { if (prevId) requestLeave(() => onNavigateToRecord(prevId)); }}
            disabled={!prevId || pending}
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
            onClick={() => { if (nextId) requestLeave(() => onNavigateToRecord(nextId)); }}
            disabled={!nextId || pending}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-semibold text-slate-600"
            title="Next Record"
          >
            Next
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          {(['Sales Coordinator', 'Logistics', 'Admin'] as UserRole[]).includes(currentUserRole) && (
            <div className="relative flex flex-wrap min-w-0 items-center gap-2">
              <DocumentSizeSelect value={docSize} onChange={setDocSize} disabled={pdfLoading} inline />
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

      <section aria-label="Record summary" className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <CompanyHistoryButton
            companyId={record.company_id}
            companyName={record.company_name}
            currentRecordId={record.id}
            disabled={pending}
            className="font-bold text-slate-800"
            onOpenRecord={(screen, id) => requestLeave(() => navigate(screen, id))}
          />
          <span className="text-slate-500">{record.category}</span>
          <span className={`rounded-full border px-2 py-0.5 font-semibold ${STATUS_COLOR[record.status] ?? 'bg-slate-50 text-slate-700 border-slate-200'}`}>{record.status}</span>
          <span className={`rounded-full border px-2 py-0.5 ${PRIORITY_COLOR[record.priority] ?? 'bg-slate-100 text-slate-700 border-slate-200'}`}>Priority: {record.priority}</span>
        </div>
        <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-700">
          {[
            ['Driver', record.driver || 'Unassigned'],
            ['Delivery date', record.delivery_date],
            ['Time in', record.time_in || '—'],
            ['Time out', record.time_out || '—'],
          ].map(([label, value]) => <div key={label} className="flex gap-1"><dt className="text-slate-500">{label}:</dt><dd className="font-semibold">{value}</dd></div>)}
        </dl>
      </section>
      <WorkspaceTabs
        id={`record-${record.id}`}
        tabs={visibleTabs.map(tab => {
          const Icon = tab.icon;
          return { id: tab.id, label: tab.label, icon: <Icon aria-hidden="true" className="w-[18px] h-[18px] shrink-0" /> };
        })}
        renderPanel={renderTabContent}
      />
    </div>
  );
}
