import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, FileText, Link2, Loader2, Pencil, Plus, Save, X as XIcon } from 'lucide-react';
import { api } from '@/api';
import { accountManagerChoices, useAccountManagersQuery } from '@/api/queries/useAccountManagersQuery';
import { useCompaniesQuery } from '@/api/queries/useCompaniesQuery';
import { accountManagerOptionGroups, companySapNumbers } from '@/utils/accountDirectory';
import CompanySapQuickPick from '@/components/CompanySapQuickPick';
import ComboboxField from '@/components/ComboboxField';
import { RecordStatusProgress } from '@/components/RecordStatus';
import { AREAS, AREA_HIERARCHY, ITEM_TYPES, PRIORITIES, RMA_ITEM_TYPES, VEHICLES } from '@/data';
import { usePermissions } from '@/hooks/usePermissions';
import type { DeliveryRecord, ItemType, PriorityLevel, RecordLineItem, RmaContact, UserRole } from '@/types';
import { formatManilaTimestamp as formatTs } from '@/utils/manilaTimestamp';
import { notify } from '@/utils/notify';
import { recordLabel } from '@/utils/recordLabel';
import {
  isDraftRecord,
  isPriorityLocked,
  PRIORITY_LOCKED_NOTE,
  selectableStatuses,
  submissionErrors,
} from '@/utils/recordLifecycle';
import { INTERNAL_TRANSFER_LABEL, RMA_CATEGORIES, TRANSFER_OUT_CATEGORY, canonicalRmaCategory, formatRmaCategoryOption, formatRmaContacts, isReturnToCustomerCategory } from '@/utils/rma';
import { RmaContactsEditor, cleanRmaContacts } from './RmaContactsEditor';
import { RmaStructuredItemsEditor, RmaStructuredItemsList, cleanRmaItems } from './RmaStructuredItemsEditor';
import { getStartTimeDisplay } from './RecordWorkspaceShell';
import { ReturnToDraftDialog } from './ReturnToDraftDialog';
import { useWorkspaceDraft } from './WorkspaceDrafts';

type EditDraft = {
  priority: PriorityLevel;
  reference: string;
  amount: string;
  area: string;
  vehicle: string;
  account_manager: string;
  delivery_date: string;
  item_type: ItemType;
  is_draft: 'Yes' | 'No';
  remarks: string;
  item_description: string;
  line_items: RecordLineItem[];
  address: string;
  case_number: string;
  service_slip_no: string;
  client_remarks: string;
  internal_logistics_remarks: string;
  rma_contacts: RmaContact[];
  /** A canonical slip category, or a retired legacy label kept read-only. */
  rma_type: string;
  rma_movement: DeliveryRecord['rma_movement'] | '';
  is_internal_transfer: boolean;
  purchase_date: string;
  customer_contact_name: string;
  customer_contact_email: string;
  customer_contact_phone: string;
};

function buildDraft(record: DeliveryRecord, remarks = record.remarks || ''): EditDraft {
  return {
    priority: record.priority,
    reference: record.category === 'RMA' ? (record.rma_reference ?? record.reference) : record.reference,
    amount: record.amount != null ? String(record.amount) : '',
    area: record.area,
    vehicle: record.vehicle || '(None)',
    account_manager: record.account_manager,
    delivery_date: record.delivery_date,
    item_type: record.item_type,
    is_draft: record.is_draft,
    remarks,
    item_description: record.item_description || '',
    address: record.address ?? '',
    line_items: (record.line_items ?? []).map(({ id: _id, ...li }) => ({ ...li })),
    case_number: record.case_number ?? '',
    service_slip_no: record.service_slip_no ?? '',
    client_remarks: record.client_remarks ?? '',
    internal_logistics_remarks: record.internal_logistics_remarks ?? '',
    rma_contacts: (record.rma_contacts ?? []).map(c => ({ name: c.name, phone: c.phone ?? '', email: c.email ?? '' })),
    rma_type: record.rma_type ?? '',
    rma_movement: record.rma_movement ?? '',
    is_internal_transfer: Boolean(record.is_internal_transfer),
    purchase_date: record.purchase_date ?? '',
    customer_contact_name: record.customer_contact_name ?? '',
    customer_contact_email: record.customer_contact_email ?? '',
    customer_contact_phone: record.customer_contact_phone ?? '',
  };
}

function formatPhpAmount(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Shown beside the locked Movement method and Delivery Date fields (mirrors the server guard in records.ts). */
const RMA_SCHEDULE_LOCK_HINT = 'Locked after transport starts or receipt is confirmed.';

export interface RecordOverviewTabProps {
  record: DeliveryRecord;
  currentUserRole: UserRole;
  currentUserName: string;
  onUpdateRecord: (id: string, updates: Partial<DeliveryRecord>) => Promise<void>;
  readOnly?: boolean;
  /** Optional banner rendered above Status Progression (e.g. TransportSignoffPanel or Accounting Collection verification cue). */
  topBanner?: ReactNode;
}

/**
 * Unified Overview tab shared by Deliveries, RMA, Procurement Pick-up,
 * Sales Orders, and Accounting Collection.
 */
export function RecordOverviewTab({
  record,
  currentUserRole,
  currentUserName,
  onUpdateRecord,
  readOnly = false,
  topBanner,
}: RecordOverviewTabProps) {
  const access = usePermissions();
  const isRma = record.category === 'RMA';
  const isCollection = record.category === 'Accounting Collection';
  const tassRma = currentUserRole === 'TASS' && isRma;

  const canEditFull =
    !readOnly &&
    access.canRecord(record.category, 'UPDATE') &&
    (tassRma ||
      ((currentUserRole === 'Sales Coordinator' || currentUserRole === 'Admin') &&
        (record.status === 'Scheduled' || isDraftRecord(record))));
  // Mirrors the server guards (records.ts PUT and PATCH status): movement, date and Draft
  // freeze once transport starts, receipt is confirmed, or the RMA is completed.
  const rmaScheduleLocked = isRma && (Boolean(record.rma_transport_started_at) || Boolean(record.rma_received_at) || record.status === 'Delivered');
  const canManageDraft =
    !readOnly &&
    access.canRecord(record.category, 'SUBMIT') &&
    (currentUserRole === 'Sales Coordinator' || currentUserRole === 'Admin' || tassRma) &&
    !record.time_in &&
    !rmaScheduleLocked;

  const [lifecycleRemarks, setLifecycleRemarks] = useState('');
  const [editVersion, setEditVersion] = useState(record.rma_version ?? 0);
  const [metadataEditVersion, setMetadataEditVersion] = useState(record.edit_version);
  const [saveConflict, setSaveConflict] = useState<string | null>(null);
  const [latestSaved, setLatestSaved] = useState<DeliveryRecord | null>(null);
  const [reviewingLatest, setReviewingLatest] = useState(false);
  const [returnToDraftOpen, setReturnToDraftOpen] = useState(false);

  const canEditAreaAddress =
    !readOnly && access.canRecord(record.category, 'UPDATE') && currentUserRole === 'Logistics' && !isRma;
  const canEditDeliveryDate =
    !readOnly &&
    access.canRecord(record.category, 'UPDATE') &&
    currentUserRole === 'Logistics' &&
    record.category === 'Deliveries';
  const priorityLocked = isPriorityLocked(record);
  const startTimeDisplay = getStartTimeDisplay(record);
  const canEditPriority =
    !readOnly &&
    access.canRecord(record.category, 'UPDATE') &&
    !priorityLocked &&
    (currentUserRole === 'Sales Coordinator' ||
      currentUserRole === 'Admin' ||
      (currentUserRole === 'Logistics' && !isRma) ||
      tassRma);
  const canEdit = canEditFull || canEditAreaAddress || canEditDeliveryDate || canEditPriority;
  // TASS may correct a completed RMA, but only as a logged correction with a reason (#348).
  const correctingCompletedRma = tassRma && canEditFull && record.status === 'Delivered';

  const [editing, setEditing] = useState(false);
  const accountManagers = useAccountManagersQuery(editing && canEditFull);
  // Only while editing: read mode never loads the company directory.
  const companies = useCompaniesQuery(editing && canEditFull);
  const recordCompany = editing && canEditFull ? companies.data?.find(company => company.id === record.company_id) : undefined;
  const [saving, setSaving] = useState(false);
  const [remarksError, setRemarksError] = useState(false);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [rmaErrors, setRmaErrors] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<EditDraft>(() => buildDraft(record));
  // Remounts the structured item editor whenever the draft is replaced wholesale.
  const [draftRevision, setDraftRevision] = useState(0);

  useWorkspaceDraft('general', editing || !!lifecycleRemarks, saving);

  // Re-sync draft when a different record is opened
  useEffect(() => {
    setEditing(false);
    setSaveConflict(null);
    setLatestSaved(null);
    setRemarksError(false);
    setAmountError(null);
    setRmaErrors({});
    setLifecycleRemarks('');
    setEditVersion(record.rma_version ?? 0);
    setMetadataEditVersion(record.edit_version);
    setDraft(buildDraft(record));
  }, [record.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof EditDraft>(k: K, v: EditDraft[K]) => setDraft(p => ({ ...p, [k]: v }));
  // Once a slip reference exists for a canonical category, the category is part of that number.
  const categoryLocked = record.category === 'RMA' && !!record.rma_reference && !!canonicalRmaCategory(record.rma_type);

  const handleStartEdit = () => {
    setSaveConflict(null);
    setLatestSaved(null);
    setRemarksError(false);
    setAmountError(null);
    setRmaErrors({});
    // A bulk priority change or another session can update this record while the workspace stays open.
    setEditVersion(record.rma_version ?? 0);
    setMetadataEditVersion(record.edit_version);
    // Keep the saved note in read mode; every edit starts with a fresh reason.
    setDraft(buildDraft(record, ''));
    setDraftRevision(revision => revision + 1);
    setEditing(true);
  };

  const handleSave = async () => {
    setRmaErrors({});
    setAmountError(null);

    const cleanItems = isRma ? cleanRmaItems(draft.line_items) : draft.line_items;
    const cleanContacts = isRma ? cleanRmaContacts(draft.rma_contacts) : [];
    if (canEditFull && isRma) {
      const validation = submissionErrors(
        {
          company_name: record.company_name ?? '',
          company_id: record.company_id ?? '',
          reference: '',
          delivery_date: draft.delivery_date,
          category: 'RMA',
          rma_movement: draft.rma_movement,
          priority: draft.priority,
          area: draft.area,
          account_manager: draft.account_manager,
          rma_type: draft.rma_type,
          is_internal_transfer: draft.is_internal_transfer,
          purchase_date: draft.purchase_date,
          customer_contact_name: draft.customer_contact_name,
          customer_contact_email: draft.customer_contact_email,
          customer_contact_phone: draft.customer_contact_phone,
          service_slip_no: isReturnToCustomerCategory(draft.rma_type) ? draft.service_slip_no : '',
          rma_contacts: cleanContacts,
          line_items: cleanItems,
        },
        isDraftRecord(record),
      );
      const fieldErrors: Record<string, string> = {};
      // A legacy record may keep its retired category while other details are edited; submitting still needs one.
      if (validation.rma_type && (isDraftRecord(record) || draft.rma_type !== (record.rma_type ?? ''))) fieldErrors.rma_type = validation.rma_type;
      for (const field of ['priority', 'area', 'account_manager', 'customer_contact_email', 'rma_movement', 'delivery_date', 'is_internal_transfer', 'service_slip_no', 'rma_contacts', 'line_items']) {
        // A locked schedule cannot be edited, so it must not block the save (legacy blanks stay saveable).
        if (rmaScheduleLocked && (field === 'rma_movement' || field === 'delivery_date')) continue;
        if (validation[field]) fieldErrors[field] = validation[field];
      }
      if (Object.keys(fieldErrors).length) {
        setRmaErrors(fieldErrors);
        return;
      }
    }

    let parsedAmount: number | null | undefined;
    if (canEditFull && isCollection) {
      const trimmedAmount = draft.amount.replace(/,/g, '').trim();
      if (!trimmedAmount) {
        parsedAmount = null;
      } else {
        const numericAmount = Number(trimmedAmount);
        if (!Number.isFinite(numericAmount) || numericAmount < 0) {
          setAmountError('Enter a valid non-negative amount.');
          return;
        }
        parsedAmount = numericAmount;
      }
    }

    if (!draft.remarks.trim()) {
      setRemarksError(true);
      return;
    }

    setRemarksError(false);
    setSaving(true);

    const updates: Partial<DeliveryRecord> & { expected_version?: number } = {
      remarks: draft.remarks,
      ...(isRma ? { expected_version: editVersion } : { expected_edit_version: metadataEditVersion }),
    };

    if (canEditFull) {
      updates.priority = draft.priority;
      // The RMA slip reference is server-generated and locked; it is never sent.
      if (!isRma) updates.reference = draft.reference;
      if (isCollection && parsedAmount !== undefined) updates.amount = parsedAmount;
      updates.area = draft.area;
      if (!isRma && access.canRecord(record.category, 'ASSIGN') && draft.vehicle !== record.vehicle) {
        updates.vehicle = draft.vehicle;
      }
      updates.account_manager = draft.account_manager;
      if (!rmaScheduleLocked) updates.delivery_date = draft.delivery_date;
      updates.item_type = draft.item_type;
      updates.item_description = draft.item_description;
      updates.line_items = cleanItems;
      updates.address = draft.address;
      if (isRma) {
        if (draft.rma_type !== (record.rma_type ?? '')) updates.rma_type = draft.rma_type || null;
        if (draft.is_internal_transfer !== Boolean(record.is_internal_transfer)) updates.is_internal_transfer = draft.is_internal_transfer;
        if (tassRma && !rmaScheduleLocked) updates.rma_movement = draft.rma_movement || null;
        updates.purchase_date = draft.purchase_date || null;
        // The contact list keeps the legacy single-contact columns in step on the server.
        updates.rma_contacts = cleanContacts;
        updates.case_number = draft.case_number.trim() || null;
        updates.service_slip_no = isReturnToCustomerCategory(draft.rma_type) ? draft.service_slip_no.trim() || null : null;
        updates.client_remarks = draft.client_remarks.trim() || null;
        updates.internal_logistics_remarks = draft.internal_logistics_remarks.trim() || null;
      }
    } else {
      if (canEditAreaAddress) {
        updates.area = draft.area;
        updates.address = draft.address;
      }
      if (canEditDeliveryDate) updates.delivery_date = draft.delivery_date;
      if (canEditPriority) updates.priority = draft.priority;
    }

    try {
      await onUpdateRecord(record.id, {
        ...updates,
        modified_by: `${currentUserName} (${currentUserRole})`,
      });
      setEditing(false);
      notify.success(correctingCompletedRma ? 'Completed RMA corrected' : 'Record changes saved');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save the record. Please try again.';
      const status = (error as { status?: number }).status;
      if (status === 409 || status === 428) setSaveConflict(message);
      notify.error(message);
    } finally {
      setSaving(false);
    }
  };

  const reviewLatest = async () => {
    setReviewingLatest(true);
    try {
      setLatestSaved(await api.getRecord(record.id));
    } catch (error) {
      notify.error(
        error instanceof Error ? error.message : 'Could not load the latest record. Your draft is preserved.',
      );
    } finally {
      setReviewingLatest(false);
    }
  };

  const useLatestSaved = () => {
    if (!latestSaved) return;
    setDraft(buildDraft(latestSaved, ''));
    setDraftRevision(revision => revision + 1);
    setMetadataEditVersion(latestSaved.edit_version);
    setEditVersion(latestSaved.rma_version ?? 0);
    setSaveConflict(null);
    setLatestSaved(null);
  };

  const handleCancel = () => {
    setDraft(buildDraft(record));
    setRemarksError(false);
    setAmountError(null);
    setRmaErrors({});
    setSaveConflict(null);
    setLatestSaved(null);
    setEditing(false);
  };

  const inputCls =
    'w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue';
  const fieldInputCls = (field: string) => `${inputCls}${rmaErrors[field] ? ' border-red-500 bg-red-50' : ''}`;
  const labelCls = 'text-xs text-slate-400 uppercase tracking-widest font-bold';

  const showTassBadge = isCollection && (record.status === 'Delivered' || record.collection_verified);
  const showCollectionHighlight = isCollection && (record.amount != null || showTassBadge);

  return (
    <div className="space-y-5">
      {topBanner}

      {editing && saveConflict && (
        <section
          role="alert"
          className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
        >
          <p>{saveConflict} Your draft is still in the editor.</p>
          <button
            type="button"
            disabled={reviewingLatest}
            onClick={() => void reviewLatest()}
            className="rounded border border-amber-700 px-3 py-2 font-semibold disabled:opacity-50"
          >
            {reviewingLatest ? 'Loading latest values…' : 'Review latest saved values'}
          </button>
          {latestSaved && (
            <div className="space-y-2">
              <p className="font-bold">Latest saved values</p>
              <dl>
                <dt>Reference</dt>
                <dd>{latestSaved.reference}</dd>
                {isCollection && latestSaved.amount != null && (
                  <>
                    <dt>Amount</dt>
                    <dd>{formatPhpAmount(latestSaved.amount)}</dd>
                  </>
                )}
                <dt>Address</dt>
                <dd>{latestSaved.address || 'Not set'}</dd>
                <dt>Account Manager</dt>
                <dd>{latestSaved.account_manager}</dd>
                <dt>Delivery Date</dt>
                <dd>{latestSaved.delivery_date}</dd>
              </dl>
              <p>Replacing your draft loads the latest values and requires you to enter your change again.</p>
              <button
                type="button"
                onClick={useLatestSaved}
                className="rounded border border-amber-700 px-3 py-2 font-semibold"
              >
                Replace draft with latest saved values
              </button>
            </div>
          )}
        </section>
      )}

      {/* Status stepper */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Status Progression</p>
        <RecordStatusProgress record={record} />
      </div>

      {/* Accounting Collection highlight: Amount to Collect + compact TASS Verification badge */}
      {showCollectionHighlight && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
          {showTassBadge && (
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`px-2.5 py-1 rounded-full border text-xs font-semibold tracking-wide ${
                  record.collection_verified
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}
              >
                {record.collection_verified ? 'Collection Verified' : 'Pending Verification'}
              </span>
              {priorityLocked && <span className="text-xs text-slate-500">{PRIORITY_LOCKED_NOTE}</span>}
            </div>
          )}
          {record.amount != null && (
            <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
              <div>
                <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-0.5">
                  Amount to Collect
                </p>
                <p className="text-2xl font-bold text-emerald-800 tabular-nums">{formatPhpAmount(record.amount)}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Return to Draft action for submitted, unstarted records */}
      {canManageDraft && !isDraftRecord(record) && selectableStatuses(record, currentUserRole).includes('Draft') && (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
            <button
              type="button"
              onClick={() => setReturnToDraftOpen(true)}
              aria-haspopup="dialog"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
            >
              Return to Draft
            </button>
            <p className="text-xs text-slate-500">
              Takes this record back out of dispatch so you can edit it and submit it again.
            </p>
          </div>
          <ReturnToDraftDialog
            record={record}
            open={returnToDraftOpen}
            onDismiss={() => setReturnToDraftOpen(false)}
            onSubmit={async reason => {
              await onUpdateRecord(record.id, {
                status: 'Draft',
                remarks: reason,
                ...(isRma ? { expected_version: record.rma_version ?? 0 } : {}),
              });
              notify.success('Record returned to Draft');
            }}
          />
        </>
      )}

      {/* Submit Draft controls */}
      {canManageDraft &&
        isDraftRecord(record) &&
        selectableStatuses(record, currentUserRole).some(status => status === 'Draft' || status === 'Scheduled') && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <label htmlFor="submission-change-remarks" className="block text-xs font-bold text-slate-700">
              Remarks — reason for change (required)
            </label>
            <p id="submission-change-remarks-help" className="text-xs text-slate-600">
              Explain why you are submitting or returning this record to Draft. The reason is saved with your name in
              Remarks History.
            </p>
            <textarea
              id="submission-change-remarks"
              aria-describedby="submission-change-remarks-help"
              required
              value={lifecycleRemarks}
              onChange={e => setLifecycleRemarks(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              placeholder="Reason for submitting or returning to draft"
            />
            {selectableStatuses(record, currentUserRole)
              .filter(status => (isDraftRecord(record) ? status === 'Scheduled' : status === 'Draft'))
              .map(status => (
                <button
                  key={status}
                  type="button"
                  disabled={saving || !lifecycleRemarks.trim()}
                  className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                  onClick={async () => {
                    setSaving(true);
                    try {
                      await onUpdateRecord(record.id, {
                        status,
                        remarks: lifecycleRemarks.trim(),
                        ...(isRma ? { expected_version: record.rma_version ?? 0 } : {}),
                      });
                      setLifecycleRemarks('');
                      notify.success(isDraftRecord(record) ? 'Record submitted' : 'Record returned to Draft');
                    } catch (error) {
                      notify.error(
                        error instanceof Error ? error.message : 'Could not change submission status.',
                      );
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  {isDraftRecord(record) ? 'Submit' : 'Return to Draft'}
                </button>
              ))}
            <p className="text-xs text-slate-500">
              Drafts retain existing assignments and stay hidden from drivers until submitted.
            </p>
          </div>
        )}

      {/* Fields grid / inline metadata editor */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Record Details</h4>
          {canEdit && !editing && (
            <button
              type="button"
              onClick={handleStartEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-brand-blue hover:bg-blue-50 border border-blue-200 rounded-lg transition-colors cursor-pointer"
            >
              <Pencil aria-hidden="true" className="w-3 h-3" /> {correctingCompletedRma ? 'Correct completed RMA' : 'Edit'}
            </button>
          )}
        </div>

        {!editing ? (
          <>
            {correctingCompletedRma && (
              <p role="note" className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900">
                This RMA is completed. Use “Correct completed RMA” only to fix a mistake; a correction reason is required.
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-xs">
              {[
                {
                  label: isRma ? 'RMA Document Reference' : 'Reference (SAP)',
                  value: isRma ? record.rma_reference ?? record.reference : record.reference,
                },
                ...(isRma && record.legacy_sap_reference
                  ? [{ label: 'Legacy SAP Reference', value: record.legacy_sap_reference }]
                  : []),
                ...(isCollection
                  ? [{ label: 'Amount to Collect', value: record.amount != null ? formatPhpAmount(record.amount) : '—' }]
                  : []),
                { label: 'Area', value: record.area },
                { label: 'Address', value: record.address || '—' },
                { label: 'Vehicle', value: record.vehicle || '—' },
                { label: 'Driver', value: record.driver || 'Unassigned' },
                { label: 'Driver Assistants', value: (record.driver_assistants ?? []).join(', ') || '—' },
                startTimeDisplay,
                {
                  label: isRma ? 'Completed at' : 'Time Out',
                  value: formatTs(isRma ? record.rma_completed_at ?? record.time_out : record.time_out),
                },
                { label: isRma ? 'Recipient / Collector' : 'Received By', value: record.received_by || '—' },
                { label: 'Account Manager', value: record.account_manager },
                { label: 'Delivery Date', value: record.delivery_date },
                { label: 'Created At', value: record.created_at ? formatTs(record.created_at) : '—' },
                { label: 'Item Type', value: record.item_type },
                { label: 'Draft', value: record.is_draft },
                ...(isRma
                  ? [
                      { label: 'Category', value: record.rma_type || '—' },
                      { label: 'Classification', value: record.is_internal_transfer ? INTERNAL_TRANSFER_LABEL : 'RMA' },
                      { label: 'Case Number', value: record.case_number || '—' },
                      ...(isReturnToCustomerCategory(record.rma_type) ? [{ label: 'Service Slip (SS#)', value: record.service_slip_no || '—' }] : []),
                      { label: 'Purchase Date', value: record.purchase_date || '—' },
                      { label: 'Contact Person(s)', value: formatRmaContacts(record) || '—' },
                      ...((record.rma_contacts ?? []).some(c => c.email) ? [{ label: 'Contact Email', value: (record.rma_contacts ?? []).map(c => c.email).filter(Boolean).join(', ') }] : []),
                    ]
                  : []),
                { label: 'Priority', value: record.priority },
              ].map(row => (
                <div key={row.label} className="flex flex-col gap-0.5">
                  <span className={labelCls}>{row.label}</span>
                  <span className="font-semibold text-slate-800">{row.value}</span>
                </div>
              ))}
              {priorityLocked && <p className="text-xs text-slate-500">{PRIORITY_LOCKED_NOTE}</p>}
            </div>

            {isRma && (
              <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                <div>
                  <p className={`${labelCls} mb-1.5 flex items-center gap-2`}>
                    Client Slip Remarks
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] normal-case tracking-normal text-sky-800">Printed on client slip</span>
                  </p>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{record.client_remarks || '—'}</p>
                </div>
                {record.internal_logistics_remarks && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2" role="note" aria-label="Internal Logistics Notes">
                    <p className="text-xs font-bold uppercase tracking-widest text-amber-800 mb-1">Internal Logistics Notes · never printed on client slips</p>
                    <p className="text-sm text-amber-900 leading-relaxed whitespace-pre-line">{record.internal_logistics_remarks}</p>
                  </div>
                )}
              </div>
            )}
            {record.remarks && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className={`${labelCls} mb-1.5`}>{isRma ? 'Latest Workflow Remark' : 'Remarks'}</p>
                <p className="text-sm text-slate-700 leading-relaxed">{record.remarks}</p>
              </div>
            )}
            {isRma && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className={`${labelCls} mb-1.5`}>Units / Items</p>
                <RmaStructuredItemsList record={record} />
              </div>
            )}
            {!isRma && record.item_description && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className={`${labelCls} mb-1.5`}>Item Description</p>
                <p className="text-sm text-slate-700 leading-relaxed">{record.item_description}</p>
              </div>
            )}
            {!isRma && record.line_items && record.line_items.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className={`${labelCls} mb-1.5`}>Line Items</p>
                <ul className="list-disc list-inside text-sm text-slate-700 leading-relaxed">
                  {record.line_items.map((li, idx) => (
                    <li key={idx}>
                      <span className="tabular-nums text-xs bg-slate-100 px-1 py-0.5 rounded mr-1">x{li.quantity}</span>
                      {li.sku}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-4 text-xs">
            {correctingCompletedRma && (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                <p><span className="font-bold">You are correcting a completed RMA.</span> Status and driver assignment stay locked. Explain the correction below; it is saved with your name in Remarks History.</p>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {canEditPriority && (
                <div className="space-y-1">
                  <label htmlFor="overview-priority" className={labelCls}>
                    Priority{isRma ? ' *' : ''}
                  </label>
                  <select
                    id="overview-priority"
                    value={draft.priority}
                    onChange={e => set('priority', e.target.value as PriorityLevel)}
                    className={fieldInputCls('priority')}
                    aria-invalid={!!rmaErrors.priority}
                  >
                    {PRIORITIES.map(p => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  {rmaErrors.priority && <p className="text-xs text-red-600">{rmaErrors.priority}</p>}
                </div>
              )}
              {priorityLocked && (
                <div className="space-y-1">
                  <span className={labelCls}>Priority</span>
                  <p className="font-semibold text-slate-800">{record.priority}</p>
                  <p className="text-xs text-slate-500">{PRIORITY_LOCKED_NOTE}</p>
                </div>
              )}
              {canEditFull && isRma && (
                <div className="space-y-1">
                  <label htmlFor="overview-reference" className={labelCls}>RMA Document Reference</label>
                  <input id="overview-reference" type="text" readOnly aria-readonly="true" tabIndex={-1}
                    value={record.rma_reference || 'Auto-generated on save once a category is chosen'}
                    className={`${inputCls} bg-slate-50 text-slate-500 cursor-not-allowed`} />
                  <p className="text-xs text-slate-500">Auto-generated and locked from manual edits.</p>
                </div>
              )}
              {canEditFull && !isRma && (
                <div className="space-y-1">
                  <label htmlFor="overview-reference" className={labelCls}>
                    {isRma ? 'RMA Document Reference' : 'Reference (SAP)'}
                    {isRma && ' (optional)'}
                  </label>
                  <input
                    id="overview-reference"
                    type="text"
                    value={draft.reference}
                    onChange={e => {
                      set('reference', e.target.value);
                      setRmaErrors(errors => ({ ...errors, rma_reference: '' }));
                    }}
                    className={isRma ? fieldInputCls('rma_reference') : inputCls}
                    aria-invalid={isRma ? !!rmaErrors.rma_reference : undefined}
                    aria-describedby={rmaErrors.rma_reference ? 'rma-reference-error' : undefined}
                  />
                  {!isRma && (
                    <CompanySapQuickPick sapNumbers={companySapNumbers(recordCompany)} value={draft.reference} onPick={sap => set('reference', sap)} />
                  )}
                  {rmaErrors.rma_reference && (
                    <p id="rma-reference-error" className="text-xs text-red-600">
                      {rmaErrors.rma_reference}
                    </p>
                  )}
                </div>
              )}
              {canEditFull && isCollection && (
                <div className="space-y-1">
                  <label htmlFor="overview-amount" className={labelCls}>
                    Amount to Collect (₱)
                  </label>
                  <input
                    id="overview-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={draft.amount}
                    onChange={e => {
                      set('amount', e.target.value);
                      if (amountError) setAmountError(null);
                    }}
                    placeholder="0.00"
                    className={`${inputCls}${amountError ? ' border-red-500 bg-red-50' : ''}`}
                    aria-invalid={!!amountError}
                    aria-describedby={amountError ? 'overview-amount-error' : undefined}
                  />
                  {amountError && (
                    <p id="overview-amount-error" className="text-xs text-red-600">
                      {amountError}
                    </p>
                  )}
                </div>
              )}
              {canEditFull && isRma && (
                <>
                  {tassRma && (
                    <div className="space-y-1">
                      <label htmlFor="edit-rma-movement" className={labelCls}>
                        Movement method
                        {rmaScheduleLocked && <span className="normal-case tracking-normal font-normal"> (locked)</span>}
                      </label>
                      <select
                        id="edit-rma-movement"
                        value={draft.rma_movement ?? ''}
                        onChange={event => set('rma_movement', event.target.value as EditDraft['rma_movement'])}
                        className={fieldInputCls('rma_movement')}
                        aria-invalid={!!rmaErrors.rma_movement}
                        disabled={rmaScheduleLocked}
                        aria-describedby={rmaScheduleLocked ? 'edit-rma-movement-lock' : undefined}
                      >
                        <option value="">— Select before submitting —</option>
                        <option value="LOGISTICS_TRANSPORT">Logistics transport</option>
                        <option value="SUPPLIER_COLLECTION" disabled={draft.is_internal_transfer}>Supplier collection</option>
                        <option value="INTERNAL_NO_DRIVER">Internal / no driver</option>
                      </select>
                      {rmaScheduleLocked && <p id="edit-rma-movement-lock" className="text-xs text-slate-500">{RMA_SCHEDULE_LOCK_HINT}</p>}
                      {rmaErrors.rma_movement && (
                        <p role="alert" className="text-xs text-red-600">
                          {rmaErrors.rma_movement}
                        </p>
                      )}
                    </div>
                  )}
                  <div className="space-y-1">
                    <label htmlFor="overview-rma-category" className={labelCls}>
                      Category{categoryLocked && <span className="normal-case tracking-normal font-normal"> (locked — slip reference assigned)</span>}
                    </label>
                    <select
                      id="overview-rma-category"
                      value={draft.rma_type}
                      disabled={categoryLocked}
                      onChange={e => {
                        const value = e.target.value;
                        setDraft(previous => ({ ...previous, rma_type: value,
                          service_slip_no: isReturnToCustomerCategory(value) ? previous.service_slip_no : '',
                          is_internal_transfer: canonicalRmaCategory(value) === TRANSFER_OUT_CATEGORY ? previous.is_internal_transfer : false }));
                        setRmaErrors(errors => ({ ...errors, rma_type: '', is_internal_transfer: '' }));
                      }}
                      className={fieldInputCls('rma_type')}
                      aria-invalid={!!rmaErrors.rma_type}
                      aria-describedby={rmaErrors.rma_type ? 'rma-category-error' : undefined}
                    >
                      <option value="">— Select —</option>
                      {record.rma_type && !RMA_CATEGORIES.some(value => value === record.rma_type) && (
                        <option value={record.rma_type} disabled>{record.rma_type} (retired)</option>
                      )}
                      {RMA_CATEGORIES.map(value => (
                        <option key={value} value={value}>
                          {formatRmaCategoryOption(value)}
                        </option>
                      ))}
                    </select>
                    {rmaErrors.rma_type && (
                      <p id="rma-category-error" className="text-xs text-red-600">
                        {rmaErrors.rma_type}
                      </p>
                    )}
                  </div>
                  {canonicalRmaCategory(draft.rma_type) === TRANSFER_OUT_CATEGORY && (
                    <div className="sm:col-span-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                      <input
                        id="overview-rma-internal-transfer"
                        type="checkbox"
                        checked={draft.is_internal_transfer}
                        disabled={record.status === 'Delivered'}
                        onChange={e => {
                          const checked = e.target.checked;
                          setDraft(previous => ({ ...previous, is_internal_transfer: checked,
                            rma_movement: checked && previous.rma_movement === 'SUPPLIER_COLLECTION' ? '' : previous.rma_movement }));
                          setRmaErrors(errors => ({ ...errors, is_internal_transfer: '', rma_movement: '' }));
                        }}
                        className="mt-1"
                      />
                      <label htmlFor="overview-rma-internal-transfer" className="text-xs text-slate-700">
                        <span className="font-bold">{INTERNAL_TRANSFER_LABEL}</span>
                        <span className="block text-slate-600">{record.status === 'Delivered' ? 'Locked after completion.' : 'Routed by Logistics but left out of RMA KPIs and reports.'}</span>
                      </label>
                      {rmaErrors.is_internal_transfer && <p className="text-xs text-red-600">{rmaErrors.is_internal_transfer}</p>}
                    </div>
                  )}
                  <div className="space-y-1">
                    <label htmlFor="overview-purchase-date" className={labelCls}>
                      Purchase Date <span className="normal-case tracking-normal font-normal">(optional)</span>
                    </label>
                    <input
                      id="overview-purchase-date"
                      type="date"
                      value={draft.purchase_date}
                      onChange={e => {
                        set('purchase_date', e.target.value);
                        setRmaErrors(errors => ({ ...errors, purchase_date: '' }));
                      }}
                      className={fieldInputCls('purchase_date')}
                      aria-invalid={!!rmaErrors.purchase_date}
                      aria-describedby={rmaErrors.purchase_date ? 'rma-purchase-date-error' : undefined}
                    />
                    {rmaErrors.purchase_date && (
                      <p id="rma-purchase-date-error" className="text-xs text-red-600">
                        {rmaErrors.purchase_date}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="overview-case-number" className={labelCls}>
                      Case Number <span className="normal-case tracking-normal font-normal">(optional)</span>
                    </label>
                    <input id="overview-case-number" type="text" maxLength={80} value={draft.case_number} placeholder="e.g., CAS-31417-Y4Y6Z3"
                      onChange={e => set('case_number', e.target.value)} className={inputCls} />
                  </div>
                  {isReturnToCustomerCategory(draft.rma_type) && (
                    <div className="space-y-1">
                      <label htmlFor="overview-service-slip" className={labelCls}>
                        Service Slip (SS#) <span className="normal-case tracking-normal font-normal">(optional · RTC only)</span>
                      </label>
                      <input id="overview-service-slip" type="text" maxLength={60} value={draft.service_slip_no} placeholder="e.g., SS#60142"
                        onChange={e => { set('service_slip_no', e.target.value); setRmaErrors(errors => ({ ...errors, service_slip_no: '' })); }}
                        className={fieldInputCls('service_slip_no')} aria-invalid={!!rmaErrors.service_slip_no} />
                      {rmaErrors.service_slip_no && <p className="text-xs text-red-600">{rmaErrors.service_slip_no}</p>}
                    </div>
                  )}
                  <div className="sm:col-span-2">
                    <RmaContactsEditor idPrefix="overview-rma-contact" contacts={draft.rma_contacts} error={rmaErrors.rma_contacts || undefined}
                      onChange={contacts => { set('rma_contacts', contacts); setRmaErrors(errors => ({ ...errors, rma_contacts: '' })); }} />
                  </div>
                </>
              )}
              {(canEditFull || canEditAreaAddress) && (
                <>
                  <div className="space-y-1">
                    <ComboboxField
                      label="Area"
                      required={isRma}
                      optional={!isRma}
                      error={rmaErrors.area}
                      options={AREAS}
                      optionGroups={AREA_HIERARCHY.flatMap(r =>
                        r.subregions.map(s => ({ label: `${r.region} · ${s.name}`, options: s.areas })),
                      )}
                      value={draft.area}
                      onChange={v => set('area', v)}
                      placeholder="Type to search or scroll to browse..."
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="overview-address" className={labelCls}>
                      Address{' '}
                      <span className="text-xs font-normal text-slate-400 normal-case tracking-normal">
                        (optional)
                      </span>
                    </label>
                    <input
                      id="overview-address"
                      type="text"
                      value={draft.address}
                      onChange={e => set('address', e.target.value)}
                      className={inputCls}
                      placeholder="Street, building, floor, or additional location detail"
                    />
                  </div>
                </>
              )}
              {canEditFull && (
                <>
                  {!isRma && (
                    <div className="space-y-1">
                      <label htmlFor="overview-vehicle" className={labelCls}>
                        Vehicle
                      </label>
                      <select
                        id="overview-vehicle"
                        value={draft.vehicle}
                        disabled={!access.canRecord(record.category, 'ASSIGN')}
                        onChange={e => set('vehicle', e.target.value)}
                        className={inputCls}
                      >
                        {VEHICLES.map(v => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="space-y-1">
                    <label htmlFor="overview-account-manager" className={labelCls}>
                      Account Manager{isRma ? ' *' : ''}
                    </label>
                    <select
                      id="overview-account-manager"
                      value={draft.account_manager}
                      onChange={e => set('account_manager', e.target.value)}
                      className={fieldInputCls('account_manager')}
                      aria-invalid={!!rmaErrors.account_manager}
                    >
                      <option value="">— Select —</option>
                      {/* Active Account Managers, plus the saved name if it has since been deactivated. */}
                      {(() => {
                        const choices = accountManagerChoices(accountManagers.data, record.account_manager);
                        const groups = accountManagerOptionGroups(recordCompany, choices, accountManagers.data);
                        const options = (names: string[]) => names.map(m => <option key={m} value={m}>{m}</option>);
                        // The company's assigned Account Managers first; any other stays selectable.
                        return groups
                          ? groups.filter(group => group.options.length).map(group => <optgroup key={group.label} label={group.label}>{options(group.options)}</optgroup>)
                          : options(choices);
                      })()}
                    </select>
                    {rmaErrors.account_manager && (
                      <p className="text-xs text-red-600">{rmaErrors.account_manager}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="overview-item-type" className={labelCls}>
                      Item Type
                    </label>
                    <select
                      id="overview-item-type"
                      value={draft.item_type}
                      onChange={e => set('item_type', e.target.value as ItemType)}
                      className={inputCls}
                    >
                      {isRma && !RMA_ITEM_TYPES.some(type => type === draft.item_type) && (
                        <option value={draft.item_type} disabled>
                          {draft.item_type} (legacy value)
                        </option>
                      )}
                      {(isRma ? RMA_ITEM_TYPES : ITEM_TYPES).map(t => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="overview-delivery-date" className={labelCls}>
                      Delivery Date
                      {isRma && (draft.rma_movement === 'LOGISTICS_TRANSPORT' ? ' *' : ' (optional)')}
                      {rmaScheduleLocked && <span className="normal-case tracking-normal font-normal"> (locked)</span>}
                    </label>
                    <input
                      id="overview-delivery-date"
                      type="date"
                      value={draft.delivery_date}
                      onChange={e => {
                        set('delivery_date', e.target.value);
                        setRmaErrors(errors => ({ ...errors, delivery_date: '' }));
                      }}
                      className={isRma ? fieldInputCls('delivery_date') : inputCls}
                      disabled={rmaScheduleLocked}
                      aria-invalid={isRma ? !!rmaErrors.delivery_date : undefined}
                      aria-describedby={[rmaScheduleLocked ? 'overview-delivery-date-lock' : null, rmaErrors.delivery_date ? 'rma-delivery-date-error' : null].filter(Boolean).join(' ') || undefined}
                    />
                    {rmaErrors.delivery_date && (
                      <p id="rma-delivery-date-error" className="text-xs text-red-600">
                        {rmaErrors.delivery_date}
                      </p>
                    )}
                    {rmaScheduleLocked && <p id="overview-delivery-date-lock" className="text-xs text-slate-500">{RMA_SCHEDULE_LOCK_HINT}</p>}
                  </div>
                </>
              )}
              {canEditDeliveryDate && (
                <div className="space-y-1">
                  <label htmlFor="overview-delivery-date" className={labelCls}>
                    Delivery Date
                  </label>
                  <input
                    id="overview-delivery-date"
                    type="date"
                    value={draft.delivery_date}
                    onChange={e => set('delivery_date', e.target.value)}
                    className={inputCls}
                  />
                </div>
              )}
            </div>

            {canEditFull && (
              <div className="space-y-1">
                <label htmlFor="overview-item-description" className={labelCls}>
                  Item Description{' '}
                  <span className="text-xs font-normal text-slate-400 normal-case tracking-normal">(optional)</span>
                </label>
                <input
                  id="overview-item-description"
                  type="text"
                  value={draft.item_description}
                  onChange={e => set('item_description', e.target.value)}
                  className={inputCls}
                  placeholder="Summary of items or collection details"
                />
              </div>
            )}

            {canEditFull && isRma && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label htmlFor="overview-client-remarks" className={labelCls}>
                    Client Slip Remarks <span className="normal-case tracking-normal font-normal">(printed on client slip)</span>
                  </label>
                  <textarea id="overview-client-remarks" rows={2} maxLength={2000} value={draft.client_remarks} placeholder="e.g., SAP#12019325"
                    onChange={e => set('client_remarks', e.target.value)} className={inputCls} />
                </div>
                <div className="space-y-1">
                  <label htmlFor="overview-internal-logistics-remarks" className={`${labelCls} text-amber-700`}>
                    Internal Logistics Notes <span className="normal-case tracking-normal font-normal">(Logistics only — never printed)</span>
                  </label>
                  <textarea id="overview-internal-logistics-remarks" rows={2} maxLength={2000} value={draft.internal_logistics_remarks}
                    placeholder="e.g., Call before going." onChange={e => set('internal_logistics_remarks', e.target.value)}
                    className={`${inputCls} border-amber-300 bg-amber-50/40`} />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label htmlFor="overview-change-remarks" className={labelCls}>
                {correctingCompletedRma ? 'Correction reason' : 'Remarks — reason for change'} <span className="text-red-500">*</span>
              </label>
              <p id="overview-change-remarks-help" className="text-xs text-slate-600">
                {correctingCompletedRma
                  ? 'Explain what was wrong and what you corrected. The reason is saved with your name in Remarks History.'
                  : 'Explain why you are making this change. The reason is saved with your name in Remarks History.'}
              </p>
              <textarea
                id="overview-change-remarks"
                aria-describedby={remarksError ? 'overview-change-remarks-help overview-change-remarks-error' : 'overview-change-remarks-help'}
                required
                value={draft.remarks}
                onChange={e => {
                  set('remarks', e.target.value);
                  if (remarksError && e.target.value.trim()) setRemarksError(false);
                }}
                rows={3}
                placeholder={correctingCompletedRma ? 'What was corrected and why…' : canEditFull ? '' : 'Explain why you are making this update...'}
                className={`w-full px-2.5 py-1.5 border rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue ${
                  remarksError ? 'border-red-400 bg-red-50' : 'border-slate-300'
                }`}
              />
              {remarksError && (
                <p id="overview-change-remarks-error" role="alert" className="text-xs text-red-600 font-semibold">
                  {correctingCompletedRma ? 'A correction reason is required to save changes to a completed RMA.' : 'Remarks are required to save changes.'}
                </p>
              )}
            </div>

            {canEditFull && isRma && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <RmaStructuredItemsEditor key={draftRevision} idPrefix="overview-rma-item" items={draft.line_items} error={rmaErrors.line_items || undefined}
                  onChange={items => { set('line_items', items); setRmaErrors(errors => ({ ...errors, line_items: '' })); }} />
              </div>
            )}
            {canEditFull && !isRma && (
              <div className="space-y-1 mt-4 pt-4 border-t border-slate-100">
                <div className="flex justify-between items-center mb-1.5">
                  <label className={labelCls}>Line Items</label>
                  <button
                    type="button"
                    onClick={() => set('line_items', [...(draft.line_items || []), { sku: '', quantity: 1 }])}
                    className="flex items-center gap-1 text-xs font-bold text-brand-blue hover:text-brand-navy cursor-pointer"
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
                      onChange={e => {
                        const newItems = (draft.line_items || []).map((entry, idx) =>
                          idx === index ? { ...entry, sku: e.target.value } : entry,
                        );
                        set('line_items', newItems);
                      }}
                      className={inputCls}
                    />
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={e => {
                        const newItems = (draft.line_items || []).map((entry, idx) =>
                          idx === index ? { ...entry, quantity: parseInt(e.target.value, 10) || 1 } : entry,
                        );
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
                  <p className="text-xs text-slate-400 italic">No line items added.</p>
                )}
              </div>
            )}

            {/* Always-locked dispatch fields */}
            <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
              {tassRma && (
                <div className="flex flex-col gap-0.5">
                  <span className={labelCls}>
                    Vehicle <span className="text-slate-300 normal-case tracking-normal font-normal">(Logistics)</span>
                  </span>
                  <span className="font-semibold text-slate-400 italic">{record.vehicle || '—'}</span>
                </div>
              )}
              {[
                { label: 'Driver', value: record.driver || 'Unassigned' },
                { label: 'Driver Assistants', value: (record.driver_assistants ?? []).join(', ') || '—' },
                startTimeDisplay,
                {
                  label: isRma ? 'Completed at' : 'Time Out',
                  value: formatTs(isRma ? record.rma_completed_at ?? record.time_out : record.time_out),
                },
                { label: isRma ? 'Recipient / Collector' : 'Received By', value: record.received_by || '—' },
              ].map(row => (
                <div key={row.label} className="flex flex-col gap-0.5">
                  <span className={labelCls}>
                    {row.label}{' '}
                    {!isRma && (
                      <span className="text-slate-300 normal-case tracking-normal font-normal">(Logistics only)</span>
                    )}
                  </span>
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
                  <FileText className="w-3 h-3 text-brand-navy" />
                  <span className="tabular-nums text-xs text-slate-700">{a}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {canEdit && !editing && !correctingCompletedRma && (
          <p className="mt-4 text-xs text-slate-400 border-t border-slate-100 pt-3">
            This record can be edited while its status is <span className="font-bold text-blue-600">Draft</span> or{' '}
            <span className="font-bold text-blue-600">Scheduled</span>. Once Logistics advances the status, it locks.
          </p>
        )}

        {editing && (
          <div className="flex gap-2 justify-end pt-4 border-t border-slate-100 mt-6">
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors text-xs uppercase cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="px-6 py-2.5 bg-brand-blue hover:bg-brand-navy text-white font-bold rounded-lg transition-colors text-xs uppercase flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving…' : correctingCompletedRma ? 'Save correction' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>

      {/* Linked Collection — rendered only for non-Accounting Collection records */}
      {!isCollection && (
        <LinkedCollectionCard
          record={record}
          currentUserRole={currentUserRole}
          onUpdateRecord={onUpdateRecord}
          readOnly={readOnly}
        />
      )}

      {/* Audit footer */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { label: 'Created By', value: record.created_by },
          { label: 'Created At', value: formatTs(record.created_at) },
          { label: 'Modified By', value: record.modified_by },
          { label: 'Updated At', value: formatTs(record.modified_at) },
        ].map(row => (
          <div key={row.label} className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
            <p className="text-xs text-slate-400 uppercase tracking-widest font-bold mb-0.5">{row.label}</p>
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
  const canLink =
    !readOnly &&
    access.canRecord(record.category, 'UPDATE') &&
    (currentUserRole === 'Logistics' || currentUserRole === 'Admin');
  const [linkInput, setLinkInput] = useState('');
  const [linkRemarks, setLinkRemarks] = useState('');
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkEditVersion, setLinkEditVersion] = useState(record.edit_version);

  useEffect(() => {
    if (!linkInput && !linkRemarks && !linking) setLinkEditVersion(record.edit_version);
  }, [record.id, record.edit_version, linkInput, linkRemarks, linking]);

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
      } as Partial<DeliveryRecord>);
      setLinkInput('');
      setLinkRemarks('');
    } catch (error) {
      setLinkError(error instanceof Error ? error.message : 'Failed to update linked collection');
    } finally {
      setLinking(false);
    }
  };

  const lc = record.linked_collection;
  const labelCls = 'text-xs text-slate-400 uppercase tracking-widest font-bold';

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Link2 className="w-3.5 h-3.5 text-brand-blue" />
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Linked Collection</h4>
      </div>

      {lc ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-xs">
            <div className="flex flex-col gap-0.5">
              <span className={labelCls}>Collection Record No.</span>
              <span className="tabular-nums font-bold text-slate-800">{recordLabel(lc)}</span>
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
                {lc.collection_verified && <span className="ml-2 text-xs text-emerald-600 font-bold">✓ Verified</span>}
              </span>
            </div>
          </div>
          {canLink && (
            <button
              type="button"
              onClick={() => void handleLink(null)}
              disabled={linking}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              {linking ? <Loader2 className="w-3 h-3 animate-spin" /> : <XIcon className="w-3 h-3" />}
              Unlink
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {canLink ? (
            <>
              <div className="space-y-1.5 text-xs">
                <label htmlFor="collection-link-input" className={labelCls}>
                  Collection Record No.
                </label>
                <input
                  id="collection-link-input"
                  type="text"
                  value={linkInput}
                  onChange={e => {
                    setLinkInput(e.target.value);
                    setLinkError(null);
                  }}
                  placeholder="e.g. COL-26-00019"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
                />
              </div>
              <div className="space-y-1.5 text-xs">
                <label htmlFor="collection-link-remarks" className={labelCls}>
                  Remarks — reason for change <span className="text-red-500">*</span>
                </label>
                <p id="collection-link-remarks-help" className="text-xs text-slate-600">
                  Explain why you are linking this collection. This is the change reason, not a discussion comment.
                </p>
                <input
                  id="collection-link-remarks"
                  aria-describedby="collection-link-remarks-help"
                  required
                  type="text"
                  value={linkRemarks}
                  onChange={e => {
                    setLinkRemarks(e.target.value);
                    setLinkError(null);
                  }}
                  placeholder="Brief reason for linking…"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
                />
              </div>
              {linkError && <p className="text-xs text-red-600 font-semibold">{linkError}</p>}
              <button
                type="button"
                onClick={() => void handleLink(linkInput.trim() || null)}
                disabled={linking || !linkInput.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-brand-blue hover:bg-brand-navy rounded-lg transition-colors cursor-pointer disabled:opacity-50"
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
