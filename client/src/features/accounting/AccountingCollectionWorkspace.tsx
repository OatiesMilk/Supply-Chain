import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  FolderOpen,
  History,
  Loader2,
  Lock,
  MessagesSquare,
  Paperclip,
  ScrollText,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { api } from '@/api';
import { operationalSyncOptions } from '@/api/queries/operationalSync';
import { podAttachmentsKey } from '@/api/queries/usePodAttachments';
import { useRecordTimeInMutation } from '@/api/queries/useRecordsQuery';
import ExportMenu from '@/components/ExportMenu';
import { PodAttachmentList } from '@/components/PodAttachmentPreview';
import { acStatusLabel } from '@/data';
import TassVerificationPanel from '@/features/accounting/TassVerificationPanel';
import { DispatchActionsTab } from '@/features/deliveries/DispatchActionsTab';
import MarkDeliveredDialog, { type CompletionValues } from '@/features/deliveries/MarkDeliveredDialog';
import NextStepCard from '@/features/deliveries/NextStepCard';
import { RecordAuditTab, RecordCommentsTab, RecordRemarksTab } from '@/features/deliveries/RecordHistoryTabs';
import { RecordOverviewTab } from '@/features/deliveries/RecordOverviewTab';
import { RecordWorkspaceShell } from '@/features/deliveries/RecordWorkspaceShell';
import StartTransportDialog from '@/features/deliveries/StartTransportDialog';
import TransportSignoffPanel from '@/features/deliveries/TransportSignoffPanel';
import { useWorkspaceDraft } from '@/features/deliveries/WorkspaceDrafts';
import { usePermissions } from '@/hooks/usePermissions';
import type { DeliveryRecord, UserRole } from '@/types';
import { START_LABEL, completionLabels, nextStepForRun } from '@/utils/completionDialog';
import { collectionRecordExportRow } from '@/utils/collectionExport';
import { AC_EXTRA_COLUMNS, DELIVERY_COLUMNS } from '@/utils/export';
import { formatManilaTimestamp as formatTs } from '@/utils/manilaTimestamp';
import { notify } from '@/utils/notify';
import { recordLabel } from '@/utils/recordLabel';
import { canRecordTimeIn } from '@/utils/recordLifecycle';

interface AccountingCollectionWorkspaceProps {
  record: DeliveryRecord;
  allRecordIds: string[];
  allRecords?: DeliveryRecord[];
  currentUserRole: UserRole;
  currentUserName: string;
  onBack: () => void;
  onVerifyCollection: (id: string) => Promise<void>;
  onNavigateToRecord: (id: string) => void;
  onUpdateRecord: (id: string, updates: Partial<DeliveryRecord>) => Promise<void>;
}

type TabId = 'overview' | 'actions' | 'verification' | 'comments' | 'remarks' | 'audit' | 'documents';

interface TabDef {
  id: TabId;
  label: string;
  icon: typeof FileText;
}

const ALL_TABS: TabDef[] = [
  { id: 'overview',     label: 'Overview',         icon: ClipboardList  },
  { id: 'actions',      label: 'Status & Actions', icon: UserPlus       },
  { id: 'verification', label: 'Verification',     icon: ShieldCheck    },
  { id: 'comments',     label: 'Comments',         icon: MessagesSquare },
  { id: 'remarks',      label: 'Remarks History',  icon: ScrollText     },
  { id: 'audit',        label: 'Audit Trail',      icon: History        },
  { id: 'documents',    label: 'Documents',        icon: FolderOpen     },
];

// ─── Saved Collection Evidence (read-only view) ───────────────────────────────

function CollectionEvidence({ recordId }: { recordId: string }) {
  const canRead = usePermissions().canRecord('Accounting Collection');
  const attachments = useQuery({
    ...operationalSyncOptions,
    queryKey: podAttachmentsKey(recordId),
    queryFn: () => api.getRecordAttachments(recordId),
    enabled: !!recordId && canRead,
  });

  return (
    <section aria-label="Saved collection evidence" className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
        <Paperclip className="h-4 w-4" aria-hidden="true" /> Saved collection evidence
      </h3>
      {!canRead ? (
        <p className="text-xs text-slate-600">Collection evidence is not available for your account.</p>
      ) : attachments.isPending ? (
        <p role="status" className="text-xs text-slate-600">
          Loading saved collection evidence…
        </p>
      ) : attachments.isError ? (
        <p role="alert" className="text-xs text-red-700">
          Could not load collection evidence.{' '}
          <button type="button" onClick={() => void attachments.refetch()} className="underline">
            Retry loading evidence
          </button>
        </p>
      ) : attachments.data.length === 0 ? (
        <p className="text-xs text-slate-600">No saved collection evidence is attached to this record.</p>
      ) : (
        <PodAttachmentList key={recordId} files={attachments.data} />
      )}
    </section>
  );
}

// ─── Collection Status Banner (rendered inside Verification Tab) ──────────────

function CollectionStatusBanner({ record }: { record: DeliveryRecord }) {
  return (
    <div
      className={`border rounded-xl p-4 flex items-start gap-3 ${
        record.status === 'Delivered'
          ? 'bg-emerald-50 border-emerald-200'
          : record.status === 'Transport Complete'
            ? 'bg-blue-50 border-blue-200'
            : 'bg-amber-50 border-amber-200'
      }`}
    >
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
          record.status === 'Delivered'
            ? 'bg-emerald-100'
            : record.status === 'Transport Complete'
              ? 'bg-blue-100'
              : 'bg-amber-100'
        }`}
      >
        {record.status === 'Delivered' ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
        ) : record.status === 'Transport Complete' ? (
          <Clock className="w-4 h-4 text-blue-700" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-amber-600" />
        )}
      </div>
      <div>
        <p
          className={`text-xs font-bold uppercase tracking-wider mb-0.5 ${
            record.status === 'Delivered'
              ? 'text-emerald-700'
              : record.status === 'Transport Complete'
                ? 'text-blue-800'
                : 'text-amber-700'
          }`}
        >
          Collection Status: {acStatusLabel(record.status)}
          {record.collection_verified ? ' · Collection Verified' : ''}
        </p>
        <p
          className={`text-xs ${
            record.status === 'Delivered'
              ? 'text-emerald-600'
              : record.status === 'Transport Complete'
                ? 'text-blue-700'
                : 'text-amber-600'
          }`}
        >
          {record.collection_verified
            ? `Collection verified${record.collection_verified_by ? ` by ${record.collection_verified_by}` : ''}${record.collection_verified_at ? ` at ${formatTs(record.collection_verified_at)}` : ''}.`
            : record.status === 'Transport Complete'
              ? 'Transport is complete. Sales must review the saved proof before the collection is finalized.'
              : record.status === 'Delivered'
                ? 'Collection confirmed. Verification is now available.'
                : 'Collection has not been marked Collected yet. Verification cannot proceed until the collection is confirmed.'}
        </p>
        {record.driver && (
          <p className="text-xs text-slate-500 mt-1 font-semibold">
            Driver: {record.driver}
            {record.driver_assistants?.length ? ` · Asst: ${record.driver_assistants.join(', ')}` : ''}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Verification Tab ─────────────────────────────────────────────────────────

function VerificationTab({
  record,
  currentUserRole,
  onVerifyCollection,
}: {
  record: DeliveryRecord;
  currentUserRole: UserRole;
  onVerifyCollection: (id: string) => Promise<void>;
}) {
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useWorkspaceDraft('verification', false, verifying);

  const access = usePermissions();
  const canRead = access.canRecord('Accounting Collection');
  const canVerify = currentUserRole === 'TASS' && access.canRecord('Accounting Collection', 'VERIFY_COLLECTION');

  const handleVerify = async () => {
    setVerifying(true);
    setError(null);
    try {
      await onVerifyCollection(record.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  const renderTassSection = () => {
    if (record.collection_verified && canRead) {
      return (
        <div className="space-y-4">
          <TassVerificationPanel record={record} />
          <CollectionEvidence recordId={record.id} />
        </div>
      );
    }

    if (!canVerify) {
      return (
        <div className="space-y-4">
          {record.status === 'Delivered' && <TassVerificationPanel record={record} />}
          <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50/70 py-10 gap-2 text-slate-500">
            <Lock className="w-7 h-7 text-slate-300" />
            <p className="text-sm">Verification requires TASS collection-verification permission.</p>
          </div>
        </div>
      );
    }

    if (record.status !== 'Delivered') {
      return (
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50/70 py-12 gap-3 text-slate-500">
          <ShieldCheck className="w-9 h-9 text-slate-300" />
          <p className="text-sm text-center max-w-xs">
            Verification is only available once a record is marked Collected.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <CollectionEvidence recordId={record.id} />
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
          <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-brand-blue" /> Collection Verification
          </p>
          {record.amount != null && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
              <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-0.5">
                Amount Being Verified
              </p>
              <p className="text-2xl font-bold text-emerald-800 tabular-nums">
                ₱{record.amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-emerald-700 mt-1">for {record.company_name}</p>
            </div>
          )}
          <p className="text-xs text-slate-500">
            {record.amount != null
              ? `Confirm that the collection of ₱${record.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })} from ${record.company_name} has been completed and verified.`
              : 'This record is marked Collected. Confirm that the billing collection has been completed and verified.'}
          </p>
          {error && (
            <p className="text-red-600 text-xs flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> {error}
            </p>
          )}
          <button
            type="button"
            onClick={() => void handleVerify()}
            disabled={verifying}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-60 transition-all"
          >
            {verifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {record.amount != null
              ? `Verify Collection of ₱${record.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
              : 'Mark as Collection Verified'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <CollectionStatusBanner record={record} />
      <TransportSignoffPanel record={record} currentUserRole={currentUserRole} />
      {renderTassSection()}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AccountingCollectionWorkspace({
  record,
  allRecordIds,
  allRecords = [],
  currentUserRole,
  currentUserName,
  onBack,
  onVerifyCollection,
  onNavigateToRecord,
  onUpdateRecord,
}: AccountingCollectionWorkspaceProps) {
  const access = usePermissions();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [dialog, setDialog] = useState<'start' | 'complete' | null>(null);
  const [cardFocus, setCardFocus] = useState(0);
  const timeInMutation = useRecordTimeInMutation();

  useEffect(() => {
    setActiveTab('overview');
    setDialog(null);
  }, [record.id]);

  const canSeeActions =
    (currentUserRole === 'Logistics' || currentUserRole === 'Admin') &&
    access.canRecord('Accounting Collection', 'WRITE');
  const visibleTabs = ALL_TABS.filter(tab => tab.id !== 'actions' || canSeeActions);

  const nextStep = canSeeActions ? nextStepForRun(record, {
    canStart: access.canRecord(record.category, 'TIME_IN') && canRecordTimeIn(record),
    canComplete: access.canRecord(record.category, 'STATUS') && access.canRecord(record.category, 'COMPLETE'),
    dirty: false,
    collection: true,
  }) : null;
  const closeDialog = (reason: 'cancel' | 'success') => {
    setDialog(null);
    if (reason === 'success') setCardFocus(value => value + 1);
  };
  const startRun = async (remarks: string) => {
    await timeInMutation.mutateAsync({ id: record.id, remarks });
    notify.success('Time In recorded');
  };
  const markCollected = async ({ receivedBy, remarks }: CompletionValues) => {
    await onUpdateRecord(record.id, { status: 'Delivered', received_by: receivedBy, status_remarks: remarks } as Partial<DeliveryRecord>);
    notify.success(completionLabels(record.category).success);
  };

  const needsSalesSignoff =
    record.status === 'Transport Complete' &&
    currentUserRole === 'Sales Coordinator' &&
    access.canAccess('accounting_collection') &&
    access.canRecord('Accounting Collection', 'RECEIVE');
  const needsTassVerify =
    record.status === 'Delivered' &&
    !record.collection_verified &&
    currentUserRole === 'TASS' &&
    access.canRecord('Accounting Collection', 'VERIFY_COLLECTION');
  const pendingVerificationAction: 'sales' | 'tass' | null = needsSalesSignoff
    ? 'sales'
    : needsTassVerify
      ? 'tass'
      : null;

  const overviewCue = (pendingVerificationAction || nextStep) ? (
    <div className="space-y-3">
      {nextStep && (
        <>
          <NextStepCard
            text={nextStep.text}
            done={nextStep.kind === 'done'}
            focusSignal={cardFocus}
            buttonLabel={nextStep.action === 'start' ? START_LABEL : nextStep.action === 'complete' ? completionLabels(record.category).button : undefined}
            onAction={nextStep.action ? () => setDialog(nextStep.action!) : undefined}
            disabled={nextStep.disabled}
            hint={nextStep.hint}
            actionHint={nextStep.action === 'start' ? 'Opens a short form for remarks.' : nextStep.action === 'complete' ? 'Opens a short form for the proof photo, Received by and remarks.' : undefined}
          />
          <StartTransportDialog open={dialog === 'start'} company={record.company_name} typeLabel={record.category} reference={record.reference} driver={record.driver} onConfirm={startRun} onClose={closeDialog} />
          <MarkDeliveredDialog open={dialog === 'complete'} recordId={record.id} category={record.category} company={record.company_name} typeLabel={record.category} reference={record.reference} driver={record.driver} onConfirm={markCollected} onClose={closeDialog} />
        </>
      )}
      {pendingVerificationAction && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-3 text-xs text-blue-950">
          <div className="flex items-center gap-2 font-semibold">
            <ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-blue" />
            <span>
              {pendingVerificationAction === 'sales'
                ? 'Awaiting your Sales verification sign-off.'
                : 'Ready for TASS collection verification.'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('verification')}
            className="inline-flex items-center gap-1 rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
          >
            Open Verification
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  ) : undefined;

  const summaryBadges =
    record.status === 'Delivered' || record.collection_verified ? (
      <span
        className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
          record.collection_verified
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-amber-50 text-amber-700 border-amber-200'
        }`}
      >
        {record.collection_verified ? 'TASS Verified' : 'Pending TASS Verification'}
      </span>
    ) : undefined;

  const headerActions =
    currentUserRole === 'TASS' || currentUserRole === 'Admin' ? (
      <ExportMenu
        rows={[collectionRecordExportRow(record)]}
        columns={[...DELIVERY_COLUMNS, ...AC_EXTRA_COLUMNS]}
        sheetName="Accounting Collection"
        filename={`ac-record-${recordLabel(record)}`}
        pdfTitle="Accounting Collection Record"
        showPdf={true}
        pdfPortrait={true}
        meta={{
          reportName: 'Accounting Collection Record',
          generatedByName: currentUserName,
          generatedByRole: currentUserRole,
        }}
      />
    ) : undefined;

  const renderTabContent = (tabId: string) => {
    switch (tabId as TabId) {
      case 'overview':
        return (
          <RecordOverviewTab
            record={record}
            currentUserRole={currentUserRole}
            currentUserName={currentUserName}
            onUpdateRecord={onUpdateRecord}
            topBanner={overviewCue}
          />
        );
      case 'actions':
        return (
          <DispatchActionsTab
            record={record}
            allRecords={allRecords}
            currentUserRole={currentUserRole}
            currentUserName={currentUserName}
            onUpdateRecord={onUpdateRecord}
            idPrefix="accounting"
          />
        );
      case 'verification':
        return (
          <VerificationTab
            record={record}
            currentUserRole={currentUserRole}
            onVerifyCollection={onVerifyCollection}
          />
        );
      case 'comments':
        return (
          <RecordCommentsTab
            recordId={record.id}
            readOnly={!access.canRecord('Accounting Collection', 'COMMENT')}
          />
        );
      case 'remarks':
        return <RecordRemarksTab recordId={record.id} />;
      case 'audit':
        return <RecordAuditTab recordId={record.id} />;
      case 'documents':
        return <CollectionEvidence recordId={record.id} />;
      default:
        return null;
    }
  };

  return (
    <RecordWorkspaceShell
      id="accounting-collection-workspace"
      tabsId={`accounting-collection-${record.id}`}
      record={record}
      allRecordIds={allRecordIds}
      onBack={onBack}
      onNavigateToRecord={onNavigateToRecord}
      headerActions={headerActions}
      summaryBadges={summaryBadges}
      activeTab={activeTab}
      onTabChange={tabId => setActiveTab(tabId as TabId)}
      tabs={visibleTabs.map(tab => {
        const Icon = tab.icon;
        return {
          id: tab.id,
          label: tab.label,
          icon: <Icon aria-hidden="true" className="w-[18px] h-[18px] shrink-0" />,
          badge:
            tab.id === 'verification' && pendingVerificationAction ? (
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-500" />
            ) : undefined,
        };
      })}
      renderPanel={renderTabContent}
    />
  );
}
