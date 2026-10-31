import { usePermissions } from '@/hooks/usePermissions';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { operationalSyncOptions } from '@/api/queries/operationalSync';
import RmaWorkflowPanel from './RmaWorkflowPanel';
import { useRecordDetailQuery, useUpdateRecordMutation } from '@/api/queries/useRecordsQuery';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft, ChevronLeft, ChevronRight,
  ClipboardList, History, UserPlus, MessagesSquare, FolderOpen,
  FileText, Shield, Settings, MessageSquare, Paperclip,
  Loader2, AlertTriangle, Check, Truck,
  RotateCcw, PackageSearch, ShoppingCart, ListChecks, Download,
  ScrollText, Link2, X as XCircle
} from 'lucide-react';
import { DeliveryRecord, DeliveryCategory, UserRole, DeliveryStatus, OutputActionConfig, OutputActionTrigger, PriorityLevel, ItemType } from '@/types';
import { api, ApiError, ApiAuditEntry, ApiComment, ApiCompany, ApiRemarkLog } from '@/api';
import { printSingleManifest, ManifestDocumentationData } from '@/features/deliveries/DeliveryManifest';
import { rankDriversByCoverage } from '@/utils/driverCoverage';
import { DRIVERS, driverIdForName,DRIVER_ASSISTANTS, DELIVERY_STATUSES, AREAS, AREA_HIERARCHY, VEHICLES, PRIORITIES, ITEM_TYPES, RMA_ITEM_TYPES, ACCOUNT_MANAGERS, DRIVER_COVERAGE_AREAS, getSubregion, getNearbyAreas } from '@/data';
import ComboboxField from '@/components/ComboboxField';
import { Pencil, X as XIcon, Save, Plus } from 'lucide-react';
import { getOutputTrigger, runOutputActions } from '@/outputActions';
import { exportRecordOutputPDF } from '@/utils/recordOutputPdf';
import RecordStatus, { RecordStatusProgress } from '@/components/RecordStatus';
import { POD_ATTACHMENT_ACCEPT, getPodAttachmentRejection } from '@/utils/attachmentValidation';
import PodUploader from '@/components/PodUploader';
import CommentComposer from '@/components/CommentComposer';
import { PodAttachmentList } from '@/components/PodAttachmentPreview';
import { usePodAttachments } from '@/api/queries/usePodAttachments';
import type { StagedFile } from '@/utils/idbFiles';
import { completionError } from '@/utils/podRequirement';
import { submissionErrors } from '@/utils/recordLifecycle';
import { RMA_CATEGORIES, type RmaCategory } from '@/utils/rma';
import { DocumentSize, DEFAULT_DOCUMENT_SIZE } from '@/utils/documentSize';
import DocumentSizeSelect from '@/components/DocumentSizeSelect';
import { CompanyHistoryButton } from '@/components/CompanyHistoryPanel';
import { useUIStore } from '@/store/uiStore';
import WorkspaceTabs from './WorkspaceTabs';
import { WorkspaceDraftProvider, useWorkspaceDraft, useWorkspaceNavigation } from './WorkspaceDrafts';
import { screenKeyForCategory } from '@/routes/screenRouting';
import { notify } from '@/utils/notify';

import { useRecordTimeInMutation } from '@/api/queries/useRecordsQuery';
import { ReturnToDraftDialog } from './ReturnToDraftDialog';
import { selectableStatuses, canRecordTimeIn, isDraftRecord, manilaToday, manilaDateTimeInput, manilaInputToIso, rescheduleDateError, isPriorityLocked, PRIORITY_LOCKED_NOTE } from '@/utils/recordLifecycle';
import { formatManilaTime, formatManilaTimestamp as formatTs } from '@/utils/manilaTimestamp';

// ─── Helpers ──────────────────────────────────────────────────────────────────


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
  { id: 'general',   label: 'Overview',        icon: ClipboardList,  roles: ['Sales Coordinator', 'Logistics', 'TASS', 'Admin'] },
  { id: 'actions',   label: 'Status & Actions', icon: UserPlus, roles: ['Logistics', 'TASS', 'Admin'] },
  { id: 'comments',  label: 'Comments',        icon: MessagesSquare, roles: ['Sales Coordinator', 'Logistics', 'TASS', 'Admin'] },
  { id: 'remarks',   label: 'Remarks History', icon: ScrollText,     roles: ['Sales Coordinator', 'Logistics', 'TASS', 'Admin'] },
  { id: 'audit',     label: 'Audit Trail',     icon: History,        roles: ['Sales Coordinator', 'Logistics', 'TASS', 'Admin'] },
  { id: 'documents', label: 'Documents',       icon: FolderOpen,     roles: ['Sales Coordinator', 'Logistics', 'TASS', 'Admin'] },
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
  rma_type: RmaCategory | '';
  rma_movement: DeliveryRecord['rma_movement'] | '';
  purchase_date: string;
  customer_contact_name: string;
  customer_contact_email: string;
  customer_contact_phone: string;
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
  const access = usePermissions();
  const tassRma = currentUserRole === 'TASS' && record.category === 'RMA';
  const canEditFull = !readOnly && access.canRecord(record.category, 'UPDATE') && (tassRma || ((currentUserRole === 'Sales Coordinator' || currentUserRole === 'Admin') && (record.status === 'Scheduled' || isDraftRecord(record))));
  const canManageDraft = !readOnly && access.canRecord(record.category, 'SUBMIT') && (currentUserRole === 'Sales Coordinator' || currentUserRole === 'Admin' || tassRma) && !record.time_in;
  const [lifecycleRemarks, setLifecycleRemarks] = useState('');
  const [editVersion, setEditVersion] = useState(record.rma_version ?? 0);
  const [metadataEditVersion, setMetadataEditVersion] = useState(record.edit_version);
  const [saveConflict, setSaveConflict] = useState<string | null>(null);
  const [latestSaved, setLatestSaved] = useState<DeliveryRecord | null>(null);
  const [reviewingLatest, setReviewingLatest] = useState(false);
  const [returnToDraftOpen, setReturnToDraftOpen] = useState(false);
  const canEditAreaAddress = !readOnly && access.canRecord(record.category, 'UPDATE') && currentUserRole === 'Logistics' && record.category !== 'RMA';
  const canEditDeliveryDate = !readOnly && access.canRecord(record.category, 'UPDATE') && currentUserRole === 'Logistics' && record.category === 'Deliveries';
  const priorityLocked = isPriorityLocked(record);
  const canEditPriority = !readOnly && access.canRecord(record.category, 'UPDATE') && !priorityLocked && ((currentUserRole === 'Sales Coordinator' || currentUserRole === 'Admin') || (currentUserRole === 'Logistics' && record.category !== 'RMA') || tassRma);
  const canEdit = canEditFull || canEditAreaAddress || canEditDeliveryDate || canEditPriority;

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [remarksError, setRemarksError] = useState(false);
  const [rmaErrors, setRmaErrors] = useState<Record<string, string>>({});
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
    rma_type: record.rma_type ?? '',
    rma_movement: record.rma_movement ?? '',
    purchase_date: record.purchase_date ?? '',
    customer_contact_name: record.customer_contact_name ?? '',
    customer_contact_email: record.customer_contact_email ?? '',
    customer_contact_phone: record.customer_contact_phone ?? '',
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
      rma_type: record.rma_type ?? '',
      rma_movement: record.rma_movement ?? '',
      purchase_date: record.purchase_date ?? '',
      customer_contact_name: record.customer_contact_name ?? '',
      customer_contact_email: record.customer_contact_email ?? '',
      customer_contact_phone: record.customer_contact_phone ?? '',
    });
  }, [record.id]);

  const set = <K extends keyof EditDraft>(k: K, v: EditDraft[K]) => setDraft(p => ({ ...p, [k]: v }));

  const handleStartEdit = () => {
    setSaveConflict(null);
    setLatestSaved(null);
    setRemarksError(false);
    setRmaErrors({});
    // A bulk priority change can update this record while the workspace stays open.
    setEditVersion(record.rma_version ?? 0);
    setMetadataEditVersion(record.edit_version);
    setDraft(d => ({ ...d, priority: record.priority, reference: record.reference, area: record.area, address: record.address ?? '', vehicle: record.vehicle || '(None)', account_manager: record.account_manager, delivery_date: record.delivery_date, item_type: record.item_type, item_description: record.item_description, line_items: record.line_items ?? [], rma_type: record.rma_type ?? '', rma_movement: record.rma_movement ?? '', purchase_date: record.purchase_date ?? '', customer_contact_name: record.customer_contact_name ?? '', customer_contact_email: record.customer_contact_email ?? '', customer_contact_phone: record.customer_contact_phone ?? '' }));
    // Keep the saved note in read mode; every edit starts with a fresh reason.
    setDraft(d => ({ ...d, remarks: '' }));
    setEditing(true);
  };

  const handleSave = async () => {
    setRmaErrors({});
    if (canEditFull && record.category === 'RMA') {
      const validation = submissionErrors({
        company_name: record.company_name ?? '',
        company_id: record.company_id ?? '',
        reference: '',
        rma_reference: draft.reference,
        delivery_date: draft.delivery_date,
        category: 'RMA',
        rma_movement: draft.rma_movement,
        priority: draft.priority,
        area: draft.area,
        account_manager: draft.account_manager,
        rma_type: draft.rma_type,
        purchase_date: draft.purchase_date,
        customer_contact_name: draft.customer_contact_name,
        customer_contact_email: draft.customer_contact_email,
        customer_contact_phone: draft.customer_contact_phone,
      }, isDraftRecord(record));
      const fieldErrors: Record<string, string> = {};
      if (validation.reference) fieldErrors.rma_reference = validation.reference;
      for (const field of ['priority', 'area', 'account_manager', 'customer_contact_email', 'rma_movement', 'delivery_date']) {
        if (validation[field]) fieldErrors[field] = validation[field];
      }
      if (Object.keys(fieldErrors).length) {
        setRmaErrors(fieldErrors);
        return;
      }
    }
    if (!draft.remarks.trim()) {
      setRemarksError(true);
      return;
    }
    setRemarksError(false);
    setSaving(true);
    const updates: any = { remarks: draft.remarks, ...(record.category === 'RMA' ? { expected_version: editVersion } : { expected_edit_version: metadataEditVersion }) };
    if (canEditFull) {
      updates.priority = draft.priority;
      if (record.category === 'RMA') updates.rma_reference = draft.reference.trim() || null;
      else updates.reference = draft.reference;
      updates.area = draft.area;
      if (record.category !== 'RMA' && access.canRecord(record.category, 'ASSIGN') && draft.vehicle !== record.vehicle) updates.vehicle = draft.vehicle;
      updates.account_manager = draft.account_manager;
      updates.delivery_date = draft.delivery_date;
      updates.item_type = draft.item_type;
      updates.item_description = draft.item_description;
      updates.line_items = draft.line_items;
      updates.address = draft.address;
      if (record.category === 'RMA') {
        updates.rma_type = draft.rma_type || null;
        if (tassRma) updates.rma_movement = draft.rma_movement || null;
        updates.purchase_date = draft.purchase_date || null;
        updates.customer_contact_name = draft.customer_contact_name || null;
        updates.customer_contact_email = draft.customer_contact_email || null;
        updates.customer_contact_phone = draft.customer_contact_phone || null;
      }
    } else {
      if (canEditAreaAddress) {
        updates.area = draft.area;
        updates.address = draft.address;
      }
      if (canEditDeliveryDate) updates.delivery_date = draft.delivery_date;
      if (canEditPriority) {
        updates.priority = draft.priority;
      }
    }
    try {
      await onUpdateRecord(record.id, {
        ...updates,
        modified_by: `${currentUserName} (${currentUserRole})`,

      });
      setEditing(false);
      notify.success('Record changes saved');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save the record. Please try again.';
      if ((error as { status?: number }).status === 409 || (error as { status?: number }).status === 428) setSaveConflict(message);
      notify.error(message);
    } finally {
      setSaving(false);
    }
  };

  const reviewLatest = async () => {
    setReviewingLatest(true);
    try { setLatestSaved(await api.getRecord(record.id)); }
    catch (error) { notify.error(error instanceof Error ? error.message : 'Could not load the latest record. Your draft is preserved.'); }
    finally { setReviewingLatest(false); }
  };
  const useLatestSaved = () => {
    if (!latestSaved) return;
    const latest = latestSaved;
    setDraft({ priority: latest.priority, reference: latest.reference, area: latest.area, address: latest.address ?? '', vehicle: latest.vehicle || '(None)',
      account_manager: latest.account_manager, delivery_date: latest.delivery_date, item_type: latest.item_type, is_draft: latest.is_draft,
      remarks: '', item_description: latest.item_description ?? '', line_items: latest.line_items ?? [], rma_type: latest.rma_type ?? '',
      rma_movement: latest.rma_movement ?? '', purchase_date: latest.purchase_date ?? '', customer_contact_name: latest.customer_contact_name ?? '',
      customer_contact_email: latest.customer_contact_email ?? '', customer_contact_phone: latest.customer_contact_phone ?? '' });
    setMetadataEditVersion(latest.edit_version); setEditVersion(latest.rma_version ?? 0); setSaveConflict(null); setLatestSaved(null);
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
      rma_type: record.rma_type ?? '',
      rma_movement: record.rma_movement ?? '',
      purchase_date: record.purchase_date ?? '',
      customer_contact_name: record.customer_contact_name ?? '',
      customer_contact_email: record.customer_contact_email ?? '',
      customer_contact_phone: record.customer_contact_phone ?? '',
    });
    setRemarksError(false);
    setRmaErrors({});
    setEditing(false);
  };

  const inputCls = 'w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]';
  const fieldInputCls = (field: string) => `${inputCls}${rmaErrors[field] ? ' border-red-500 bg-red-50' : ''}`;
  const labelCls = 'text-[10px] text-slate-400 uppercase tracking-widest font-bold';

  return (
    <div className="space-y-5">
      {editing && saveConflict && <section role="alert" className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <p>{saveConflict} Your draft is still in the editor.</p>
        <button type="button" disabled={reviewingLatest} onClick={() => void reviewLatest()} className="rounded border border-amber-700 px-3 py-2 font-semibold disabled:opacity-50">{reviewingLatest ? 'Loading latest values…' : 'Review latest saved values'}</button>
        {latestSaved && <div className="space-y-2">
          <p className="font-bold">Latest saved values</p>
          <dl><dt>Reference</dt><dd>{latestSaved.reference}</dd><dt>Address</dt><dd>{latestSaved.address || 'Not set'}</dd><dt>Account Manager</dt><dd>{latestSaved.account_manager}</dd><dt>Delivery Date</dt><dd>{latestSaved.delivery_date}</dd></dl>
          <p>Replacing your draft loads the latest values and requires you to enter your change again.</p>
          <button type="button" onClick={useLatestSaved} className="rounded border border-amber-700 px-3 py-2 font-semibold">Replace draft with latest saved values</button>
        </div>}
      </section>}
      {/* Status stepper */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Status Progression</p>
        <RecordStatusProgress record={record} />
      </div>

      {canManageDraft && !isDraftRecord(record) && selectableStatuses(record, currentUserRole).includes('Draft') && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <button type="button" onClick={() => setReturnToDraftOpen(true)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0078C1]">
            Return to Draft
          </button>
          <p className="text-xs text-slate-500">Takes this record back out of dispatch so you can edit it and submit it again.</p>
        </div>
      )}
      <ReturnToDraftDialog
        record={record}
        open={returnToDraftOpen}
        onDismiss={() => setReturnToDraftOpen(false)}
        onSubmit={async reason => { await onUpdateRecord(record.id, { status: 'Draft', remarks: reason, ...(record.category === 'RMA' ? { expected_version: record.rma_version ?? 0 } : {}) }); notify.success('Record returned to Draft'); }}
      />

      {canManageDraft && isDraftRecord(record) && selectableStatuses(record, currentUserRole).some(status => status === 'Draft' || status === 'Scheduled') && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <label htmlFor="submission-change-remarks" className="block text-xs font-bold text-slate-700">Remarks — reason for change (required)</label>
          <p id="submission-change-remarks-help" className="text-xs text-slate-600">Explain why you are submitting or returning this record to Draft. The reason is saved with your name in Remarks History.</p>
          <textarea id="submission-change-remarks" aria-describedby="submission-change-remarks-help" required value={lifecycleRemarks} onChange={e => setLifecycleRemarks(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs" placeholder="Reason for submitting or returning to draft" />
          {selectableStatuses(record, currentUserRole).filter(status => isDraftRecord(record) ? status === 'Scheduled' : status === 'Draft').map(status => (
            <button key={status} type="button" disabled={saving || !lifecycleRemarks.trim()} className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
              onClick={async () => { setSaving(true); try { await onUpdateRecord(record.id, { status, remarks: lifecycleRemarks.trim(), ...(record.category === 'RMA' ? { expected_version: record.rma_version ?? 0 } : {}) }); setLifecycleRemarks(''); notify.success(isDraftRecord(record) ? 'Record submitted' : 'Record returned to Draft'); } catch (error) { notify.error(error instanceof Error ? error.message : 'Could not change submission status.'); } finally { setSaving(false); } }}>
              {isDraftRecord(record) ? 'Submit' : 'Return to Draft'}
            </button>
          ))}
          <p className="text-xs text-slate-500">Drafts retain existing assignments and stay hidden from drivers until submitted.</p>
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
              <Pencil className="w-3 h-3" /> Edit
            </button>
          )}

        </div>

        {!editing ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-xs">
              {[
                { label: record.category === 'RMA' ? 'RMA Document Reference' : 'Reference (SAP)', value: record.category === 'RMA' ? (record.rma_reference ?? record.reference) : record.reference },
                ...(record.category === 'RMA' && record.legacy_sap_reference ? [{ label: 'Legacy SAP Reference', value: record.legacy_sap_reference }] : []),
                { label: 'Area',            value: record.area },
                { label: 'Address',         value: record.address || '—' },
                { label: 'Vehicle',         value: record.vehicle || '—' },
                { label: 'Driver',            value: record.driver || 'Unassigned' },
                { label: 'Driver Assistants', value: (record.driver_assistants ?? []).join(', ') || '—' },
                { label: 'Time In',           value: formatTs(record.time_in) },
                { label: record.category === 'RMA' ? 'Completed at' : 'Time Out', value: formatTs(record.category === 'RMA' ? record.rma_completed_at ?? record.time_out : record.time_out) },
                { label: record.category === 'RMA' ? 'Recipient / Collector' : 'Received By', value: record.received_by || '—' },
                { label: 'Account Manager',   value: record.account_manager },
                { label: 'Delivery Date',   value: record.delivery_date },
                { label: 'Created At',      value: record.created_at ? formatTs(record.created_at) : '—' },
                { label: 'Item Type',       value: record.item_type },
                { label: 'Draft',           value: record.is_draft },
                ...(record.category === 'RMA' ? [
                  { label: 'Category', value: record.rma_type || '—' },
                  { label: 'Purchase Date', value: record.purchase_date || '—' },
                  { label: 'Customer Contact Name', value: record.customer_contact_name || '—' },
                  { label: 'Customer Contact Email', value: record.customer_contact_email || '—' },
                  { label: 'Customer Contact Phone', value: record.customer_contact_phone || '—' },
                ] : []),
                { label: 'Priority', value: record.priority },
              ].map(row => (
                <div key={row.label} className="flex flex-col gap-0.5">
                  <span className={labelCls}>{row.label}</span>
                  <span className="font-semibold text-slate-800">{row.value}</span>
                </div>
              ))}
              {priorityLocked && <p className="text-[11px] text-slate-500">{PRIORITY_LOCKED_NOTE}</p>}
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
              {canEditPriority && (
                <div className="space-y-1">
                  <label className={labelCls}>Priority{record.category === 'RMA' ? ' *' : ''}</label>
                  <select value={draft.priority} onChange={e => set('priority', e.target.value as PriorityLevel)} className={fieldInputCls('priority')} aria-invalid={!!rmaErrors.priority}>
                    {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  {rmaErrors.priority && <p className="text-[11px] text-red-600">{rmaErrors.priority}</p>}
                </div>
              )}
              {priorityLocked && (
                <div className="space-y-1">
                  <span className={labelCls}>Priority</span>
                  <p className="font-semibold text-slate-800">{record.priority}</p>
                  <p className="text-[11px] text-slate-500">{PRIORITY_LOCKED_NOTE}</p>
                </div>
              )}
              {canEditFull && (
                <div className="space-y-1">
                  <label className={labelCls}>
                    {record.category === 'RMA' ? 'RMA Document Reference' : 'Reference (SAP)'}
                    {record.category === 'RMA' && ' (optional)'}
                  </label>
                  <input
                    type="text"
                    value={draft.reference}
                    onChange={e => { set('reference', e.target.value); setRmaErrors(errors => ({ ...errors, rma_reference: '' })); }}
                    className={record.category === 'RMA' ? fieldInputCls('rma_reference') : inputCls}
                    aria-invalid={record.category === 'RMA' ? !!rmaErrors.rma_reference : undefined}
                    aria-describedby={rmaErrors.rma_reference ? 'rma-reference-error' : undefined}
                  />
                  {rmaErrors.rma_reference && <p id="rma-reference-error" className="text-[11px] text-red-600">{rmaErrors.rma_reference}</p>}
                </div>
              )}
              {canEditFull && record.category === 'RMA' && <>
                {tassRma && <div className="space-y-1">
                  <label htmlFor="edit-rma-movement" className={labelCls}>Movement method</label>
                  <select id="edit-rma-movement" value={draft.rma_movement ?? ''} onChange={event => set('rma_movement', event.target.value as EditDraft['rma_movement'])} className={fieldInputCls('rma_movement')} aria-invalid={!!rmaErrors.rma_movement}>
                    <option value="">— Select before submitting —</option>
                    <option value="LOGISTICS_TRANSPORT">Logistics transport</option>
                    <option value="SUPPLIER_COLLECTION">Supplier collection</option>
                    <option value="INTERNAL_NO_DRIVER">Internal / no driver</option>
                  </select>
                  {rmaErrors.rma_movement && <p role="alert" className="text-xs text-red-600">{rmaErrors.rma_movement}</p>}
                </div>}
                <div className="space-y-1">
                  <label className={labelCls}>Category <span className="normal-case tracking-normal font-normal">(optional)</span></label>
                  <select
                    value={draft.rma_type}
                    onChange={e => { set('rma_type', e.target.value as EditDraft['rma_type']); setRmaErrors(errors => ({ ...errors, rma_type: '' })); }}
                    className={fieldInputCls('rma_type')}
                    aria-invalid={!!rmaErrors.rma_type}
                    aria-describedby={rmaErrors.rma_type ? 'rma-category-error' : undefined}
                  >
                    <option value="">— Select —</option>
                    {RMA_CATEGORIES.map(value => <option key={value} value={value}>{value}</option>)}
                  </select>
                  {rmaErrors.rma_type && <p id="rma-category-error" className="text-[11px] text-red-600">{rmaErrors.rma_type}</p>}
                </div>
                <div className="space-y-1">
                  <label className={labelCls}>Purchase Date <span className="normal-case tracking-normal font-normal">(optional)</span></label>
                  <input
                    type="date"
                    value={draft.purchase_date}
                    onChange={e => { set('purchase_date', e.target.value); setRmaErrors(errors => ({ ...errors, purchase_date: '' })); }}
                    className={fieldInputCls('purchase_date')}
                    aria-invalid={!!rmaErrors.purchase_date}
                    aria-describedby={rmaErrors.purchase_date ? 'rma-purchase-date-error' : undefined}
                  />
                  {rmaErrors.purchase_date && <p id="rma-purchase-date-error" className="text-[11px] text-red-600">{rmaErrors.purchase_date}</p>}
                </div>
                <div className="space-y-1">
                  <label className={labelCls}>Customer Contact Name <span className="normal-case tracking-normal font-normal">(optional)</span></label>
                  <input
                    type="text"
                    value={draft.customer_contact_name}
                    onChange={e => { set('customer_contact_name', e.target.value); setRmaErrors(errors => ({ ...errors, customer_contact_name: '' })); }}
                    className={fieldInputCls('customer_contact_name')}
                    aria-invalid={!!rmaErrors.customer_contact_name}
                    aria-describedby={rmaErrors.customer_contact_name ? 'rma-contact-name-error' : undefined}
                  />
                  {rmaErrors.customer_contact_name && <p id="rma-contact-name-error" className="text-[11px] text-red-600">{rmaErrors.customer_contact_name}</p>}
                </div>
                <div className="space-y-1">
                  <label className={labelCls}>Customer Contact Email <span className="normal-case tracking-normal font-normal">(optional)</span></label>
                  <input
                    type="email"
                    value={draft.customer_contact_email}
                    onChange={e => { set('customer_contact_email', e.target.value); setRmaErrors(errors => ({ ...errors, customer_contact_email: '' })); }}
                    className={fieldInputCls('customer_contact_email')}
                    aria-invalid={!!rmaErrors.customer_contact_email}
                    aria-describedby={rmaErrors.customer_contact_email ? 'rma-contact-email-error' : undefined}
                  />
                  {rmaErrors.customer_contact_email && <p id="rma-contact-email-error" className="text-[11px] text-red-600">{rmaErrors.customer_contact_email}</p>}
                </div>
                <div className="space-y-1">
                  <label className={labelCls}>Customer Contact Phone <span className="normal-case tracking-normal font-normal">(optional)</span></label>
                  <input
                    type="tel"
                    value={draft.customer_contact_phone}
                    onChange={e => { set('customer_contact_phone', e.target.value); setRmaErrors(errors => ({ ...errors, customer_contact_email: '' })); }}
                    className={inputCls}
                    aria-invalid={!!rmaErrors.customer_contact_email}
                    aria-describedby={rmaErrors.customer_contact_email ? 'rma-contact-email-error' : undefined}
                  />
                </div>
              </>}
              {(canEditFull || canEditAreaAddress) && (<>
              <div className="space-y-1">
                <ComboboxField
                  label="Area"
                  required={record.category === 'RMA'}
                  optional={record.category !== 'RMA'}
                  error={rmaErrors.area}
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
              </>)}
              {canEditFull && (
                <>
                  {record.category !== 'RMA' && <div className="space-y-1">
                    <label className={labelCls}>Vehicle</label>
                    <select value={draft.vehicle} disabled={!access.canRecord(record.category, 'ASSIGN')} onChange={e => set('vehicle', e.target.value)} className={inputCls}>
                      {VEHICLES.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>}
                  <div className="space-y-1">
                    <label className={labelCls}>Account Manager{record.category === 'RMA' ? ' *' : ''}</label>
                    <select value={draft.account_manager} onChange={e => set('account_manager', e.target.value)} className={fieldInputCls('account_manager')} aria-invalid={!!rmaErrors.account_manager}>
                      <option value="">— Select —</option>
                      {ACCOUNT_MANAGERS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    {rmaErrors.account_manager && <p className="text-[11px] text-red-600">{rmaErrors.account_manager}</p>}
                  </div>
                  <div className="space-y-1">
                    <label className={labelCls}>Item Type</label>
                    <select value={draft.item_type} onChange={e => set('item_type', e.target.value as ItemType)} className={inputCls}>
                      {record.category === 'RMA' && !RMA_ITEM_TYPES.some(type => type === draft.item_type) && <option value={draft.item_type} disabled>{draft.item_type} (legacy value)</option>}
                      {(record.category === 'RMA' ? RMA_ITEM_TYPES : ITEM_TYPES).map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className={labelCls}>Delivery Date{record.category === 'RMA' && (draft.rma_movement === 'LOGISTICS_TRANSPORT' ? ' *' : ' (optional)')}</label>
                    <input
                      type="date"
                      value={draft.delivery_date}
                      onChange={e => { set('delivery_date', e.target.value); setRmaErrors(errors => ({ ...errors, delivery_date: '' })); }}
                      className={record.category === 'RMA' ? fieldInputCls('delivery_date') : inputCls}
                      aria-invalid={record.category === 'RMA' ? !!rmaErrors.delivery_date : undefined}
                      aria-describedby={rmaErrors.delivery_date ? 'rma-delivery-date-error' : undefined}
                    />
                    {rmaErrors.delivery_date && <p id="rma-delivery-date-error" className="text-[11px] text-red-600">{rmaErrors.delivery_date}</p>}
                  </div>
                  <div className="space-y-1">
                    <label className={labelCls}>Date &amp; Time</label>
                    
                  </div>

                </>
              )}
              {canEditDeliveryDate && (
                <div className="space-y-1">
                  <label className={labelCls}>Delivery Date</label>
                  <input type="date" value={draft.delivery_date} onChange={e => set('delivery_date', e.target.value)} className={inputCls} />
                </div>
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
                placeholder={canEditFull ? '' : 'Explain why you are making this update...'}
                className={`w-full px-2.5 py-1.5 border rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1] ${remarksError ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}
              />
              {remarksError && <p className="text-[11px] text-red-600 font-semibold">Remarks are required to save changes.</p>}
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
              {tassRma && <div className="flex flex-col gap-0.5">
                <span className={labelCls}>Vehicle <span className="text-slate-300 normal-case tracking-normal font-normal">(Logistics)</span></span>
                <span className="font-semibold text-slate-400 italic">{record.vehicle || '—'}</span>
              </div>}
              {[
                { label: 'Driver',            value: record.driver || 'Unassigned' },
                { label: 'Driver Assistants', value: (record.driver_assistants ?? []).join(', ') || '—' },
                { label: 'Time In',           value: formatTs(record.time_in) },
                { label: record.category === 'RMA' ? 'Completed at' : 'Time Out', value: formatTs(record.category === 'RMA' ? record.rma_completed_at ?? record.time_out : record.time_out) },
                { label: record.category === 'RMA' ? 'Recipient / Collector' : 'Received By', value: record.received_by || '—' },
              ].map(row => (
                <div key={row.label} className="flex flex-col gap-0.5">
                  <span className={labelCls}>{row.label} {record.category !== 'RMA' && <span className="text-slate-300 normal-case tracking-normal font-normal">(Logistics only)</span>}</span>
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
  const access = usePermissions();
  const canLink = !readOnly && access.canRecord(record.category, 'UPDATE') && (currentUserRole === 'Logistics' || currentUserRole === 'Admin');
  const [linkInput, setLinkInput]   = useState('');
  const [linkRemarks, setLinkRemarks] = useState('');
  const [linking, setLinking]       = useState(false);
  const [linkError, setLinkError]   = useState<string | null>(null);
  const [linkEditVersion, setLinkEditVersion] = useState(record.edit_version);
  useEffect(() => { if (!linkInput && !linkRemarks && !linking) setLinkEditVersion(record.edit_version); }, [record.id, record.edit_version, linkInput, linkRemarks, linking]);
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
        expected_edit_version: linkEditVersion,
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
  const query = useQuery({ ...operationalSyncOptions, queryKey: ['record-remarks', recordId], queryFn: () => api.getRecordRemarks(recordId) });
  const remarks = query.data ?? [];
  const loading = query.isPending;
  const error = query.isError ? (query.error.message || 'Failed to load remarks.') : null;

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
  const access = usePermissions();
  const canAssign = access.canRecord(record.category, 'ASSIGN');
  const [saving, setSaving] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<DeliveryStatus>(record.status);

  const [actionRemarks, setActionRemarks] = useState('');
  const [actionRemarksError, setActionRemarksError] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const actionRemarksRef = useRef<HTMLTextAreaElement>(null);

  const { readiness: podReadiness, uploadStaged } = usePodAttachments(record.id);
  const timeInMutation = useRecordTimeInMutation();
  const dispatchMutation = useUpdateRecordMutation();

  const [selectedDriver, setSelectedDriver] = useState(record.driver);
  const [assistants, setAssistants] = useState<string[]>(record.driver_assistants ?? []);
  const [timeIn, setTimeIn] = useState(manilaDateTimeInput(record.time_in));
  const [timeOut, setTimeOut] = useState(manilaDateTimeInput(record.time_out));
  const [receivedBy, setReceivedBy] = useState(record.received_by ?? '');
  const [newDeliveryDate, setNewDeliveryDate] = useState('');
  const [returnToDraftOpen, setReturnToDraftOpen] = useState(false);

  const draftRecord = isDraftRecord(record);
  const isRma = record.category === 'RMA';
  const statusOptions = selectableStatuses(record, currentUserRole).filter(status => access.canRecord(record.category, 'STATUS') && (status !== 'Delivered' || access.canRecord(record.category, 'COMPLETE')) && (status !== 'Draft' || access.canRecord(record.category, 'SUBMIT')));

  const statusChanged = selectedStatus !== record.status;
  const photoError = statusChanged ? completionError(record, selectedStatus, receivedBy, podReadiness) : null;
  const needsNewDate = statusChanged && selectedStatus === 'Rescheduled' && record.category === 'Deliveries'
    && (currentUserRole === 'Logistics' || currentUserRole === 'Admin');
  const newDateError = needsNewDate ? rescheduleDateError(newDeliveryDate, record.delivery_date) : null;
  const driverFieldsChanged =
    selectedDriver !== (record.driver ?? '') ||
    JSON.stringify(assistants.filter(a => a.trim())) !== JSON.stringify(record.driver_assistants ?? []) ||
    timeIn !== manilaDateTimeInput(record.time_in) ||
    timeOut !== manilaDateTimeInput(record.time_out) ||
    (!isRma && (receivedBy || '') !== (record.received_by ?? ''));
  const assignmentFieldsChanged = selectedDriver !== (record.driver ?? '') ||
    JSON.stringify(assistants.filter(a => a.trim())) !== JSON.stringify(record.driver_assistants ?? []);

  const hasChanges = statusChanged || driverFieldsChanged;
  const [dispatchEditVersion, setDispatchEditVersion] = useState(record.edit_version);
  useEffect(() => { if (!hasChanges && !actionRemarks.trim()) setDispatchEditVersion(record.edit_version); }, [record.id, record.edit_version, hasChanges, actionRemarks]);

  // Sync state when navigating to a different record
  useEffect(() => {
    setSelectedDriver(record.driver);
    setAssistants(record.driver_assistants ?? []);
    setTimeIn(manilaDateTimeInput(record.time_in));
    setTimeOut(manilaDateTimeInput(record.time_out));
    setReceivedBy(record.received_by ?? '');
    setSelectedStatus(record.status);
    setNewDeliveryDate('');
    setActionRemarks('');
    setActionRemarksError(false);
    setSaveFeedback(null);
  }, [record.id, record.time_in, record.time_out, record.status, record.delivery_date]); // eslint-disable-line react-hooks/exhaustive-deps

  useWorkspaceDraft('dispatch', hasChanges || !!actionRemarks || podReadiness.hasStagedFiles, saving || podReadiness.uploading);

  const handleSave = async () => {
    if (saving || photoError || newDateError || !access.canRecord(record.category, 'WRITE')) return;
    if (statusChanged && (!access.canRecord(record.category, 'STATUS') || selectedStatus === 'Delivered' && !access.canRecord(record.category, 'COMPLETE'))) return;
    if (assignmentFieldsChanged && !canAssign) return;
    if (timeIn !== manilaDateTimeInput(record.time_in) && !access.canRecord(record.category, 'TIME_IN')) return;
    if ((timeOut !== manilaDateTimeInput(record.time_out) || receivedBy !== (record.received_by ?? '')) && !access.canRecord(record.category, 'COMPLETE')) return;

    if (!hasChanges && !actionRemarks.trim() && !podReadiness.hasStagedFiles) {
      setSaveFeedback('No changes detected to save.');
      return;
    }

    if (hasChanges && !actionRemarks.trim()) {
      setActionRemarksError(true);
      requestAnimationFrame(() => {
        actionRemarksRef.current?.focus();
        actionRemarksRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
      return;
    }

    setActionRemarksError(false);
    setSaveFeedback(null);
    setSaving(true);

    const now = new Date().toISOString();
    let detailsSaved = false;
    let nextEditVersion = dispatchEditVersion;

    try {
      if (!isRma) await uploadStaged();

      // The update hook routes status changes to PATCH /status and ordinary
      // dispatch fields to PUT /records/:id. Keep them as two ordered writes
      // behind this single button so neither set of changes is silently lost.
      if (driverFieldsChanged || (!statusChanged && actionRemarks.trim())) {
        const fieldUpdates: Partial<DeliveryRecord> = {
          expected_edit_version: dispatchEditVersion,
          remarks: actionRemarks.trim(),
          modified_by: `${currentUserName} (${currentUserRole})`,
          modified_at: now,
        };
        if (selectedDriver !== (record.driver ?? '')) {
          // Save the stable Driver profile id; the server copies the display name.
          const driverId = selectedDriver ? driverIdForName(selectedDriver) : null;
          if (selectedDriver && !driverId) fieldUpdates.driver = selectedDriver;
          else fieldUpdates.driver_id = driverId;
        }
        if (JSON.stringify(assistants.filter(a => a.trim())) !== JSON.stringify(record.driver_assistants ?? [])) {
          fieldUpdates.driver_assistants = assistants.filter(a => a.trim());
        }
        if (timeIn !== manilaDateTimeInput(record.time_in)) fieldUpdates.time_in = timeIn ? manilaInputToIso(timeIn) : null;
        if (timeOut !== manilaDateTimeInput(record.time_out)) fieldUpdates.time_out = timeOut ? manilaInputToIso(timeOut) : null;
        if ((receivedBy || '') !== (record.received_by ?? '')) fieldUpdates.received_by = receivedBy;
        // Keep the exact result of this save as the baseline for a following
        // reschedule; a fresh read could silently accept another writer's edit.
        const saved = await dispatchMutation.mutateAsync({ id: record.id, updates: fieldUpdates });
        nextEditVersion = saved.edit_version;
        setDispatchEditVersion(saved.edit_version);
        detailsSaved = true;
      }

      if (statusChanged) {
        const statusUpdates: Partial<DeliveryRecord> & { status_remarks?: string } = {
          status: selectedStatus,
          status_remarks: actionRemarks.trim(),
          modified_by: `${currentUserName} (${currentUserRole})`,
          modified_at: now,
          ...(selectedStatus === 'Delivered' ? { received_by: receivedBy.trim() } : {}),
          ...(needsNewDate ? { delivery_date: newDeliveryDate, expected_edit_version: nextEditVersion } : {}),
        };
        await onUpdateRecord(record.id, statusUpdates);
      }

      setActionRemarks('');
      notify.success(isRma ? 'RMA changes saved' : 'Dispatch & Logistics changes saved');

      if (statusChanged) {
        const trigger = getOutputTrigger(record.category, selectedStatus);
        if (trigger) {
          const output = await runOutputActions(trigger, outputActionConfigs[trigger], {
            amName: record.account_manager, at: now, recordId: record.id, category: record.category, api,
            exportPDF: async () => exportRecordOutputPDF(await api.getRecord(record.id)),
          });
          if (output.email.failed || output.pdf === 'failed') notify.error(`Changes saved. ${output.banners.join(' ')}`);
          else output.banners.forEach(message => notify.info(message));
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save the changes. Please try again.';
      notify.error(
        detailsSaved && statusChanged
          ? `Dispatch details were saved, but the status was not changed: ${message}`
          : message
      );
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]';

  return (
    <div className="space-y-6">
      {!isRma && record.status !== 'Delivered' && <PodUploader key={record.id} recordId={record.id} required disabled={saving} />}
      {access.canRecord(record.category, 'TIME_IN') && canRecordTimeIn(record) && (currentUserRole === 'Logistics' || currentUserRole === 'Admin') && <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-2">
        <p className="text-xs text-blue-900">Record Time In to start this run. Enter remarks below before starting.</p>
        <button type="button" disabled={saving || !actionRemarks.trim()} className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
          onClick={async () => { setSaving(true); setSaveFeedback(null); try { await timeInMutation.mutateAsync({ id: record.id, remarks: actionRemarks.trim() }); setActionRemarks(''); notify.success('Time In recorded'); } catch (error) { notify.error(error instanceof Error ? error.message : 'Could not record Time In.'); } finally { setSaving(false); } }}>
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
              onClick={() => { if (s === 'Draft') { setReturnToDraftOpen(true); return; } setSelectedStatus(s); setNewDeliveryDate(''); setSaveFeedback(null); }}
              disabled={saving}
              aria-pressed={s === 'Draft' ? undefined : selectedStatus === s}
              aria-haspopup={s === 'Draft' ? 'dialog' : undefined}
              className={`min-h-10 rounded-lg border px-3 py-2.5 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0078C1] disabled:opacity-50 ${
                selectedStatus === s
                  ? 'border-[#1F3864] bg-[#1F3864] text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-[#0078C1] hover:text-[#0078C1]'
              }`}
            >
              {s === 'Draft' ? 'Return to Draft' : isRma && s === 'Delivered' ? 'Complete RMA' : s}
            </button>
          ))}
        </div>
        <ReturnToDraftDialog
          record={record}
          open={returnToDraftOpen}
          onDismiss={() => setReturnToDraftOpen(false)}
          onSubmit={async reason => { await onUpdateRecord(record.id, { status: 'Draft', remarks: reason, ...(record.category === 'RMA' ? { expected_version: record.rma_version ?? 0 } : {}) }); notify.success('Record returned to Draft'); }}
        />
        {needsNewDate && (
          <div className="space-y-1.5">
            <label htmlFor="reschedule-new-date" className="text-xs font-bold text-slate-700">New delivery date <span className="text-red-600">*</span></label>
            <input
              id="reschedule-new-date"
              type="date"
              value={newDeliveryDate}
              min={manilaToday()}
              disabled={saving}
              required
              aria-invalid={!!newDateError}
              aria-describedby="reschedule-new-date-help"
              onChange={e => { setNewDeliveryDate(e.target.value); setSaveFeedback(null); }}
              className={`w-full sm:max-w-xs px-3 py-2 border rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1] ${newDateError ? 'border-red-400' : 'border-slate-300'}`}
            />
            <p id="reschedule-new-date-help" className={`text-[11px] ${newDateError ? 'font-semibold text-red-600' : 'text-slate-500'}`}>
              {newDateError ?? 'The driver sees this run again on the new date.'}
            </p>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="text-xs text-slate-600">
            Current status: <span className="font-semibold text-slate-800">{record.status}</span>
            {selectedStatus !== record.status && <span className="ml-2 text-[#1F3864]">→ {selectedStatus} (unsaved)</span>}
          </p>
        </div>
        {photoError && <p role="alert" className="text-xs font-semibold text-red-700">{photoError}</p>}
      </div>

      {isRma && <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        {statusChanged && selectedStatus === 'Delivered' ? <>
          <label htmlFor="rma-recipient" className="block text-xs font-bold text-slate-700">Recipient / Collector *</label>
          <input id="rma-recipient" type="text" value={receivedBy} onChange={e => setReceivedBy(e.target.value)}
            disabled={saving} required className={inputCls} />
          <p className="text-xs text-slate-500">The recipient or collector name is saved with completion and required remarks. Completed at is recorded automatically.</p>
        </> : <>
          <p className="text-xs font-bold text-slate-700">Recipient / Collector</p>
          <p className="text-xs text-slate-700">{record.received_by || 'Not recorded'}</p>
          {record.status !== 'Delivered' && <p className="text-xs text-slate-500">Select Complete RMA to enter the recipient or collector name and save it with completion.</p>}
        </>}
        {record.time_out && <p className="text-xs text-slate-700">Completed at: {formatTs(record.time_out)}</p>}
      </div>}
      {draftRecord && !isRma && <p className="text-xs text-slate-600">Submit this draft before changing its assignment. Existing assignments are retained.</p>}
      {!isRma && <>
      {/* Driver assignment + completion fields */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Driver &amp; Delivery Details</h4>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Driver</label>
            {(() => {
              const recordSubregion = getSubregion(record.area);
              const nearbyAreas = getNearbyAreas(record.area);

              // Exact Area, then explicit Subregion, then every other active Driver.
              const ranked = rankDriversByCoverage(DRIVERS, d => DRIVER_COVERAGE_AREAS[d], record.area);
              const coveringCount = ranked.area.length + ranked.subregion.length;

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
                    disabled={draftRecord || saving || !canAssign}
                    onChange={e => setSelectedDriver(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1] ${
                      !selectedDriver ? 'border-amber-400 bg-amber-50' : 'border-slate-300'
                    }`}
                  >
                    <option value="">-- Unassigned --</option>
                    {ranked.area.length > 0 && (
                      <optgroup label={`Covers ${record.area}`}>
                        {ranked.area.map(d => <option key={d} value={d}>{d}</option>)}
                      </optgroup>
                    )}
                    {ranked.subregion.length > 0 && (
                      <optgroup label={`Covers ${ranked.subregionName} (subregion)`}>
                        {ranked.subregion.map(d => <option key={d} value={d}>{d}</option>)}
                      </optgroup>
                    )}
                    {ranked.other.length > 0 && (
                      <optgroup label={coveringCount > 0 ? 'Other drivers' : 'All drivers'}>
                        {ranked.other.map(d => <option key={d} value={d}>{d}</option>)}
                      </optgroup>
                    )}
                  </select>
                  {coveringCount > 0 && (
                    <p className="text-[10px] text-emerald-600 font-semibold">
                      {coveringCount} driver{coveringCount !== 1 ? 's' : ''} cover{coveringCount === 1 ? 's' : ''} {record.area} — shown first.
                    </p>
                  )}
                  {coveringCount === 0 && (
                    <p className="text-[10px] text-slate-400">
                      No driver covers {record.area || 'this area'} yet — showing all drivers.
                    </p>
                  )}
                  {recordSubregion && nearbyAreas.length > 0 && (
                    <p className="text-[10px] text-slate-400 italic">
                      Part of <span className="font-semibold not-italic text-slate-500">{recordSubregion}</span> — nearby: {nearbyAreas.join(', ')}
                    </p>
                  )}
                  {sameDayHints.length > 0 && (
                    <p className="text-[10px] text-[#0078C1] font-semibold mt-1 flex flex-col">
                      <span className="mb-0.5 border-b border-blue-100 pb-0.5 inline-block w-max">On this page, also assigned to {recordSubregion ?? record.area} today:</span>
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
                    disabled={draftRecord || saving || !canAssign}
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
                    disabled={draftRecord || saving || !canAssign}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                disabled={draftRecord || saving || !canAssign}
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
              disabled={saving || !access.canRecord(record.category, 'COMPLETE')}
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
                disabled={!record.time_in || saving || !access.canRecord(record.category, 'TIME_IN')}
                onChange={e => setTimeIn(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Time Out (Manila)</label>
              <input
                type="datetime-local"
                value={timeOut}
                disabled={!record.time_out || saving || !access.canRecord(record.category, 'COMPLETE')}
                onChange={e => setTimeOut(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
          <p className="text-xs text-slate-500">Time In starts the run; Time Out is saved automatically on completion. Existing timestamps can be corrected above with remarks, using Manila time.</p>
        </div>
      </div>

      </>}

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
            ref={actionRemarksRef}
            value={actionRemarks}
            onChange={e => { setActionRemarks(e.target.value); if (actionRemarksError && e.target.value.trim()) setActionRemarksError(false); }}
            rows={3}
            placeholder={hasChanges ? 'Reason for the changes above (required)…' : 'Optional note…'}
            className={`w-full px-3 py-2 border rounded-lg text-xs resize-none focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1] ${actionRemarksError ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}
          />
          {actionRemarksError && <p className="text-[11px] text-red-600 font-semibold">A reason is required when making changes to dispatch or status fields.</p>}
        </div>

        {saveFeedback && <p role="status" className="text-[11px] font-semibold text-amber-700">{saveFeedback}</p>}

        <div className="flex gap-2 justify-end pt-4 border-t border-slate-200 mt-6">
          <button
            onClick={() => {
              setSelectedStatus(record.status);
              setNewDeliveryDate('');
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
            disabled={saving || !access.canRecord(record.category, 'WRITE') || !!photoError || !!newDateError}
            className="px-6 py-2.5 bg-[#0078C1] hover:bg-[#1F3864] text-white font-bold rounded-lg transition-colors text-[11px] uppercase flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : isRma && statusChanged && selectedStatus === 'Delivered' ? 'Complete RMA' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Comments Tab ─────────────────────────────────────────────────────────────

function CommentsTab({ recordId, readOnly = false }: { recordId: string; readOnly?: boolean }) {
  const client = useQueryClient();
  const query = useQuery({ ...operationalSyncOptions, queryKey: ['record-comments', recordId], queryFn: () => api.getRecordComments(recordId) });
  const comments = query.data ?? [];
  const loading = query.isPending;
  const loadError = query.isError ? 'Could not load comments. Please try again.' : '';
  const [commentBody, setCommentBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  useWorkspaceDraft('comments', !!commentBody, submitting);

  const handleSubmit = async () => {
    const body = commentBody.trim();
    if (readOnly || !body || submitting) return;
    setSubmitting(true);
    try {
      const created = await api.createRecordComment(recordId, body);
      client.setQueryData<ApiComment[]>(['record-comments', recordId], previous => [...(previous ?? []), created]);
      void client.invalidateQueries({ queryKey: ['record-comments', recordId] });
      setCommentBody('');
    } catch {
      notify.error('Could not send your comment. Your text is kept below; try again.');
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
      {loadError && <div role="alert" className="text-sm text-red-700">{loadError} <button type="button" onClick={() => void query.refetch()} className="min-h-11 rounded px-3 font-semibold underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700">Retry loading comments</button></div>}
      {readOnly && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">You have read-only access to this discussion.</p>}

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

      {!readOnly && (
        <CommentComposer
          id="record-comment-body"
          describedBy="record-comment-help"
          value={commentBody}
          onChange={setCommentBody}
          onSubmit={handleSubmit}
          submitting={submitting}
        />
      )}
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
  rma_reference: 'RMA Document Reference',
  legacy_sap_reference: 'Legacy SAP Reference',
  rma_type: 'RMA Category',
  rma_movement: 'Movement method',
  rma_transport_status: 'Transport status',
  rma_transport_started_at: 'Transport started',
  rma_transport_completed_at: 'Transport completed',
  rma_received_at: 'Physical receipt confirmed',
  rma_received_by: 'Receipt confirmed by',
  rma_recipient: 'Recipient',
  rma_completed_at: 'RMA completed',
  purchase_date: 'Purchase Date',
  customer_contact_name: 'Customer Contact Name',
  customer_contact_email: 'Customer Contact Email',
  customer_contact_phone: 'Customer Contact Phone',
};

// Beyond the explicitly-listed skip fields, also drop the audit meta-fields
// (created_by/modified_by/modified_at) since they duplicate what the entry's
// own header already shows (changed_by + timestamp), and the output-actions
// log/email flag, which aren't simple user-editable fields.
const AUDIT_SKIP_FIELDS = new Set([
  'id', 'company_id', 'customer_id', 'created_by_id',
  'created_at', 'updated_at', 'created_by', 'modified_by', 'modified_at',
  'document_attachment', 'attachments', 'output_actions_log', 'email_notification_sent', 'rma_version', 'rma_received_by',
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
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v))) return formatTs(v);
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
  const query = useQuery({ ...operationalSyncOptions, queryKey: ['record-audit', recordId], queryFn: () => api.getRecordAudit(recordId) });
  const entries = query.data ?? null;
  const loading = query.isPending;
  const error = query.isError ? (query.error.message || 'Failed to load audit trail.') : null;

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

function StagedAttachment({ staged, disabled, onRemove }: {
  staged: StagedFile;
  disabled: boolean;
  onRemove: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const isPhoto = staged.file.type.startsWith('image/');

  useEffect(() => {
    if (!isPhoto) return;
    const url = URL.createObjectURL(staged.file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [isPhoto, staged.file]);

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
      {previewUrl ? (
        <img src={previewUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
      ) : (
        <FileText aria-hidden="true" className="h-5 w-5 shrink-0 text-amber-700" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-slate-800">{staged.file.name}</p>
        <p className="mt-0.5 text-[10px] font-bold text-amber-700">Waiting to upload</p>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={onRemove}
        aria-label={`Remove staged ${staged.file.name}`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-red-50 hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <XIcon aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );
}

function DocumentsTab({ record, readOnly = false }: { record: DeliveryRecord; readOnly?: boolean }) {
  const { files, stagedFiles, readiness, stageFiles, unstageFile, uploadStaged, removeFile: deleteFile } = usePodAttachments(record.id);
  const uploading = readiness.uploading;
  const [dragging, setDragging] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [staging, setStaging] = useState(false);
  const [removing, setRemoving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = uploading || staging || removing;
  useWorkspaceDraft('documents', readiness.hasStagedFiles, busy);

  const addFiles = async (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0 || busy) return;
    const selectedFiles = Array.from(incoming);
    const rejection = getPodAttachmentRejection(selectedFiles);
    if (rejection) {
      notify.fileRejected(rejection.fileName, rejection.reason);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    setStaging(true);
    try {
      await stageFiles(selectedFiles);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Could not stage files.');
    } finally {
      setStaging(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const saveFiles = async () => {
    if (!readiness.hasStagedFiles || busy) return;
    try {
      await uploadStaged();
      notify.success('Documents uploaded');
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Upload failed.');
    }
  };

  const removeStaged = async (id: string) => {
    if (busy) return;
    setStaging(true);
    try {
      await unstageFile(id);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Could not remove staged file.');
    } finally {
      setStaging(false);
    }
  };

  const removeFile = async () => {
    if (!confirmRemoveId) return;
    setRemoving(true);
    try {
      await deleteFile({ id: confirmRemoveId, remarks: '' });
      setConfirmRemoveId(null);
      notify.success('Attachment removed');
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Could not remove attachment.');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={e => { if (!readOnly) { e.preventDefault(); setDragging(true); } }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); if (!readOnly && !busy) addFiles(e.dataTransfer.files); }}
        onClick={() => { if (!readOnly && !busy) inputRef.current?.click(); }}
        aria-busy={busy}
        className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all ${
          dragging
            ? 'border-[#0078C1] bg-blue-50'
            : busy
              ? 'border-slate-200 bg-slate-50 cursor-wait'
              : readOnly ? 'border-slate-200 bg-slate-50 cursor-default' : 'border-slate-300 hover:border-[#0078C1] hover:bg-slate-50'
        }`}
      >
        <Paperclip className={`w-8 h-8 transition-colors ${dragging ? 'text-[#0078C1]' : 'text-slate-300'}`} />
        <div className="text-center">
          <p className="text-sm font-bold text-slate-700">{readOnly ? 'Documents are read-only for your account' : staging ? 'Adding files…' : uploading ? 'Uploading…' : 'Drop files here or click to add'}</p>
            <p className="text-xs text-slate-400 mt-0.5">{readOnly ? 'Document uploads require permission.' : 'PDF, JPG, PNG, DOCX or XLSX — supported documents can be previewed in app; up to 10 MB each'}</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={POD_ATTACHMENT_ACCEPT}
          className="hidden"
          disabled={busy || readOnly}
          onChange={e => addFiles(e.target.files)}
        />
      </div>

      {readiness.loading && <p role="status" className="text-xs text-slate-600">Loading attachments…</p>}
      {readiness.loadFailed && <p role="alert" className="text-xs text-red-700">Could not load attachments.</p>}
      {!readOnly && stagedFiles.length > 0 && (
        <div className="space-y-2" aria-label="Files waiting to upload">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">
              {stagedFiles.length} file{stagedFiles.length !== 1 ? 's' : ''} waiting to upload
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={saveFiles}
              className="flex min-h-11 items-center gap-1.5 rounded-lg bg-[#0078C1] px-4 py-2 text-xs font-bold text-white hover:bg-[#1F3864] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Save aria-hidden="true" className="h-4 w-4" />}
              {uploading ? 'Saving…' : 'Save Files'}
            </button>
          </div>
          {stagedFiles.map(staged => (
            <StagedAttachment
              key={staged.id}
              staged={staged}
              disabled={busy}
              onRemove={() => removeStaged(staged.id)}
            />
          ))}
        </div>
      )}

      {/* Persisted file list */}
      {files.length > 0 ? (
        <div className="space-y-2">
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {files.length} file{files.length !== 1 ? 's' : ''}
            </p>
          </div>
          <PodAttachmentList
            files={files}
            removeDisabled={busy}
            onRemove={!readOnly ? file => setConfirmRemoveId(file.id) : undefined}
          />
        </div>
      ) : stagedFiles.length === 0 ? (
        <div className="text-center py-6 text-slate-400 text-xs">
          No documents attached yet. Upload files above.
        </div>
      ) : null}

      {/* Removal Confirmation Modal */}
      {!readOnly && confirmRemoveId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="remove-attachment-title"
            onKeyDown={event => {
              if (event.key === 'Escape' && !removing) setConfirmRemoveId(null);
            }}
            className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4"
          >
            <h3 id="remove-attachment-title" className="text-sm font-black text-slate-900">Remove Attachment</h3>
            <p className="text-xs text-slate-600">
              Are you sure you want to remove <span className="font-bold">{files.find(f => f.id === confirmRemoveId)?.name}</span>? This action cannot be undone and will be permanently recorded in the audit trail.
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                autoFocus
                disabled={removing}
                onClick={() => setConfirmRemoveId(null)}
                className="px-4 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={removing}
                onClick={removeFile}
                className="px-4 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg flex items-center gap-1.5"
              >
                {removing ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
      <p className="text-[10px] text-slate-400 text-center">Files are stored in the local Docker volume and protected by record access permissions.</p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DeliveryRecordWorkspace(props: DeliveryRecordWorkspaceProps) {
  const access = usePermissions();
  if (!access.canRecord(props.record.category)) return <div role="alert">This record is not available for your account.</div>;
  return (
    <WorkspaceDraftProvider key={`${props.record.id}-${props.currentUserRole}-${props.forceReadOnly ?? false}`}>
      <RecordWorkspace {...props} />
    </WorkspaceDraftProvider>
  );
}

function RecordWorkspace({
  record: initialRecord,
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
  const access = usePermissions();
  const detail = useRecordDetailQuery(initialRecord, initialRecord.category === 'RMA');
  const record = initialRecord.category === 'RMA' ? detail.data ?? initialRecord : initialRecord;
  const { requestLeave, pending } = useWorkspaceNavigation();
  const navigationNonce = useUIStore(s => s.navigationNonce);
  const currentScreen = useUIStore(s => s.currentScreen);
  const selectedRecordId = useUIStore(s => s.selectedRecordId);
  const initialNavigationNonce = useRef(navigationNonce);
  const moduleScreen = screenKeyForCategory(record.category);
  const navigate = useUIStore(s => s.handleNavigate);

  useEffect(() => {
    if (navigationNonce === initialNavigationNonce.current) return;
    initialNavigationNonce.current = navigationNonce;

    if (currentScreen !== moduleScreen || selectedRecordId) return;
    requestLeave(onBack);
  }, [navigationNonce, currentScreen, selectedRecordId, moduleScreen, requestLeave, onBack]);

  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError]     = useState<string | null>(null);
  const [docSize, setDocSize]       = useState<DocumentSize>(DEFAULT_DOCUMENT_SIZE);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewBlob, setPdfPreviewBlob] = useState<Blob | null>(null);
  const [pdfFileName, setPdfFileName] = useState('');
  useEffect(() => () => { if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl); }, [pdfPreviewUrl]);

  const handleDownloadPdf = async () => {
    setPdfLoading(true);
    setPdfError(null);
    try {
      const [auditEntries, remarks, comments, attachments] = await Promise.all([
        api.getRecordAudit(record.id),
        api.getRecordRemarks(record.id),
        api.getRecordComments(record.id),
        api.getRecordAttachments(record.id),
      ]);
      const docData: ManifestDocumentationData = { auditEntries, remarks, comments, attachments };
      const blob = await printSingleManifest(record, companies, docData, docSize);
      const url = URL.createObjectURL(blob);
      setPdfPreviewBlob(blob);
      setPdfFileName(`manifest-${record.id}-${record.delivery_date}.pdf`);
      setPdfPreviewUrl(url);
    } catch (err: any) {
      setPdfError(err.message ?? 'Failed to generate PDF. Please try again.');
    } finally {
      setPdfLoading(false);
    }
  };

  // Determine visible tabs per role; forceReadOnly hides the Assign tab
  const visibleTabs = ALL_TABS.filter(t =>
    t.roles.includes(currentUserRole) && !(forceReadOnly && t.id === 'actions' && record.category !== 'RMA')
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
        if (record.category === 'RMA') return <RmaWorkflowPanel key={record.id} record={record} currentUserRole={currentUserRole} />;
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
        return <CommentsTab recordId={record.id} readOnly={forceReadOnly || !access.canRecord(record.category, 'COMMENT')} />;

      case 'remarks':
        return <RemarksTab recordId={record.id} />;

      case 'audit':
        return <AuditTrailTab recordId={record.id} />;

      case 'documents':
        return <DocumentsTab record={record} readOnly={forceReadOnly || !access.canRecord(record.category, 'POD')} />;

      default:
        return null;
    }
  };

  if (detail.error instanceof ApiError && [401, 403, 404].includes(detail.error.status)) {
    return <div role="alert" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-700">This record is no longer available to your account. <button type="button" onClick={onBack} className="min-h-11 px-3 font-semibold text-blue-700">Back to records</button></div>;
  }

  return (
    <div className="space-y-4" id={`delivery-record-workspace-${record.id}`}>
      {detail.isError && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">The latest record could not sync. Saved information is shown. <button type="button" className="min-h-11 underline" onClick={() => void detail.refetch()}>Retry sync</button></p>}
      {/* Navigation bar */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-gray-100 pb-4">
        <div className="flex min-w-[14rem] flex-1 items-center gap-3">
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

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
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
         </div>
          {(['Sales Coordinator', 'Logistics', 'TASS', 'Admin'] as UserRole[]).includes(currentUserRole) && (
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
          <RecordStatus record={record} />
          <span className={`rounded-full border px-2 py-0.5 ${PRIORITY_COLOR[record.priority] ?? 'bg-slate-100 text-slate-700 border-slate-200'}`}>Priority: {record.priority}</span>
        </div>
        <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-700">
          {[
            ['Driver', record.driver || 'Unassigned'],
            ['Delivery date', record.delivery_date],
            ['Time in', formatManilaTime(record.time_in)],
            [record.category === 'RMA' ? 'Completed at' : 'Time out', formatManilaTime(record.category === 'RMA' ? record.rma_completed_at ?? record.time_out : record.time_out)],
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
      {pdfPreviewUrl && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-label="PDF preview">
          <div className="flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-slate-950 shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 text-white">
              <div className="min-w-0"><p className="truncate text-sm font-semibold">{pdfFileName}</p><p className="text-xs text-slate-400">PDF preview</p></div>
              <button type="button" onClick={() => setPdfPreviewUrl(null)} className="rounded p-2 hover:bg-white/10" aria-label="Close preview"><XCircle className="h-5 w-5" /></button>
            </div>
            <iframe title="Generated delivery PDF preview" src={pdfPreviewUrl} className="min-h-0 flex-1 bg-white" />
            <div className="flex justify-center p-4">
              <button type="button" onClick={() => { if (!pdfPreviewBlob) return; const link = document.createElement('a'); link.href = URL.createObjectURL(pdfPreviewBlob); link.download = pdfFileName; link.click(); URL.revokeObjectURL(link.href); }} className="flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100"><Download className="h-4 w-4" />Download PDF</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
