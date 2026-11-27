import { useEffect, useRef, useState } from 'react';
import {
  ClipboardList,
  Download,
  FileText,
  FolderOpen,
  History,
  Loader2,
  MessagesSquare,
  Paperclip,
  Save,
  ScrollText,
  UserPlus,
  X as XCircle,
  X as XIcon,
} from 'lucide-react';
import { api, ApiCompany, ApiError } from '@/api';
import { usePodAttachments } from '@/api/queries/usePodAttachments';
import { useRecordDetailQuery } from '@/api/queries/useRecordsQuery';
import { ActionDialog } from '@/components/ActionDialog';
import DocumentSizeSelect from '@/components/DocumentSizeSelect';
import { DEFAULT_SLIP_DOCUMENT_SIZE, rmaSlipFileName } from '@/utils/rmaClientSlipPdf';
import { PodAttachmentList } from '@/components/PodAttachmentPreview';
import { ManifestDocumentationData, printSingleManifest } from '@/features/deliveries/DeliveryManifest';
import { usePermissions } from '@/hooks/usePermissions';
import type { DeliveryRecord, OutputActionConfig, OutputActionTrigger, UserRole } from '@/types';
import { getPodAttachmentRejection, POD_ATTACHMENT_ACCEPT } from '@/utils/attachmentValidation';
import { DEFAULT_DOCUMENT_SIZE, DocumentSize } from '@/utils/documentSize';
import type { StagedFile } from '@/utils/idbFiles';
import { notify } from '@/utils/notify';
import { recordLabel } from '@/utils/recordLabel';
import { DispatchActionsTab } from './DispatchActionsTab';
import { RecordAuditTab, RecordCommentsTab, RecordRemarksTab } from './RecordHistoryTabs';
import { RecordOverviewTab } from './RecordOverviewTab';
import { RecordWorkspaceShell } from './RecordWorkspaceShell';
import RmaWorkflowPanel from './RmaWorkflowPanel';
import TransportSignoffPanel from './TransportSignoffPanel';
import { useWorkspaceDraft, WorkspaceDraftProvider } from './WorkspaceDrafts';

export { diffAuditEntry, formatAuditValue } from './recordAuditDiff';
export { RecordOverviewTab } from './RecordOverviewTab';

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
  { id: 'general',   label: 'Overview',         icon: ClipboardList,  roles: ['Sales Coordinator', 'Logistics', 'TASS', 'Admin'] },
  { id: 'actions',   label: 'Status & Actions', icon: UserPlus,       roles: ['Logistics', 'TASS', 'Admin'] },
  { id: 'comments',  label: 'Comments',         icon: MessagesSquare, roles: ['Sales Coordinator', 'Logistics', 'TASS', 'Admin'] },
  { id: 'remarks',   label: 'Remarks History',  icon: ScrollText,     roles: ['Sales Coordinator', 'Logistics', 'TASS', 'Admin'] },
  { id: 'audit',     label: 'Audit Trail',      icon: History,        roles: ['Sales Coordinator', 'Logistics', 'TASS', 'Admin'] },
  { id: 'documents', label: 'Documents',        icon: FolderOpen,     roles: ['Sales Coordinator', 'Logistics', 'TASS', 'Admin'] },
];

// ─── Documents Tab ────────────────────────────────────────────────────────────

function StagedAttachment({
  staged,
  disabled,
  onRemove,
}: {
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
        <p className="mt-0.5 text-xs font-medium text-amber-700">Waiting to upload</p>
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
  const { files, stagedFiles, readiness, stageFiles, unstageFile, uploadStaged, removeFile: deleteFile } =
    usePodAttachments(record.id);
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
        onDragOver={e => {
          if (!readOnly) {
            e.preventDefault();
            setDragging(true);
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault();
          setDragging(false);
          if (!readOnly && !busy) void addFiles(e.dataTransfer.files);
        }}
        onClick={() => {
          if (!readOnly && !busy) inputRef.current?.click();
        }}
        aria-busy={busy}
        className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all ${
          dragging
            ? 'border-brand-blue bg-blue-50'
            : busy
              ? 'border-slate-200 bg-slate-50 cursor-wait'
              : readOnly
                ? 'border-slate-200 bg-slate-50 cursor-default'
                : 'border-slate-300 hover:border-brand-blue hover:bg-slate-50'
        }`}
      >
        <Paperclip className={`w-8 h-8 transition-colors ${dragging ? 'text-brand-blue' : 'text-slate-300'}`} />
        <div className="text-center">
          <p className="text-sm font-bold text-slate-700">
            {readOnly
              ? 'Documents are read-only for your account'
              : staging
                ? 'Adding files…'
                : uploading
                  ? 'Uploading…'
                  : 'Drop files here or click to add'}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {readOnly
              ? 'Document uploads require permission.'
              : 'PDF, JPG, PNG, DOCX or XLSX — supported documents can be previewed in app; up to 10 MB each'}
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={POD_ATTACHMENT_ACCEPT}
          className="hidden"
          disabled={busy || readOnly}
          onChange={e => void addFiles(e.target.files)}
        />
      </div>

      {readiness.loading && (
        <p role="status" className="text-xs text-slate-600">
          Loading attachments…
        </p>
      )}
      {readiness.loadFailed && (
        <p role="alert" className="text-xs text-red-700">
          Could not load attachments.
        </p>
      )}
      {!readOnly && stagedFiles.length > 0 && (
        <div className="space-y-2" aria-label="Files waiting to upload">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
              {stagedFiles.length} file{stagedFiles.length !== 1 ? 's' : ''} waiting to upload
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveFiles()}
              className="flex min-h-11 items-center gap-1.5 rounded-lg bg-brand-blue px-4 py-2 text-xs font-bold text-white hover:bg-brand-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <Save aria-hidden="true" className="h-4 w-4" />
              )}
              {uploading ? 'Saving…' : 'Save Files'}
            </button>
          </div>
          {stagedFiles.map(staged => (
            <StagedAttachment
              key={staged.id}
              staged={staged}
              disabled={busy}
              onRemove={() => void removeStaged(staged.id)}
            />
          ))}
        </div>
      )}

      {/* Persisted file list */}
      {files.length > 0 ? (
        <div className="space-y-2">
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
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
        <div className="text-center py-6 text-slate-400 text-xs">No documents attached yet. Upload files above.</div>
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
            <h3 id="remove-attachment-title" className="text-sm font-bold text-slate-900">
              Remove Attachment
            </h3>
            <p className="text-xs text-slate-600">
              Are you sure you want to remove{' '}
              <span className="font-bold">{files.find(f => f.id === confirmRemoveId)?.name}</span>? This action cannot
              be undone and will be permanently recorded in the audit trail.
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
                onClick={() => void removeFile()}
                className="px-4 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg flex items-center gap-1.5"
              >
                {removing ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
      <p className="text-xs text-slate-400 text-center">
        Files are stored in the local Docker volume and protected by record access permissions.
      </p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DeliveryRecordWorkspace(props: DeliveryRecordWorkspaceProps) {
  const access = usePermissions();
  if (!access.canRecord(props.record.category)) {
    return <div role="alert">This record is not available for your account.</div>;
  }
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

  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  // RMA client slips default to A4 portrait (A4 / Letter / Legal selectable).
  const [docSize, setDocSize] = useState<DocumentSize>(() => initialRecord.category === 'RMA' ? DEFAULT_SLIP_DOCUMENT_SIZE : DEFAULT_DOCUMENT_SIZE);
  // RMA PDFs are client slips: the internal documentation trail is opt-in (staff copy only).
  const [includeTrail, setIncludeTrail] = useState(false);
  const isRmaRecord = record.category === 'RMA';
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewBlob, setPdfPreviewBlob] = useState<Blob | null>(null);
  const [pdfFileName, setPdfFileName] = useState('');

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    };
  }, [pdfPreviewUrl]);

  const handleDownloadPdf = async () => {
    if (pdfLoading) return;
    setPdfLoading(true);
    setPdfError(null);
    try {
      const withTrail = !isRmaRecord || includeTrail;
      let docData: ManifestDocumentationData | undefined;
      if (withTrail) {
        const [auditEntries, remarks, comments, attachments] = await Promise.all([
          api.getRecordAudit(record.id),
          api.getRecordRemarks(record.id),
          api.getRecordComments(record.id),
          api.getRecordAttachments(record.id),
        ]);
        docData = { auditEntries, remarks, comments, attachments };
      }
      const blob = await printSingleManifest(record, companies, docData, docSize, { includeDocumentationTrail: withTrail });
      const url = URL.createObjectURL(blob);
      setPdfPreviewBlob(blob);
      setPdfFileName(isRmaRecord ? rmaSlipFileName(record, recordLabel(record)) : `manifest-${recordLabel(record)}-${record.delivery_date}.pdf`);
      setPdfPreviewUrl(url);
      setPdfDialogOpen(false);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Failed to generate PDF. Please try again.');
    } finally {
      setPdfLoading(false);
    }
  };

  // Determine visible tabs per role; forceReadOnly hides the Status & Actions tab for non-RMA
  const visibleTabs = ALL_TABS.filter(
    t => t.roles.includes(currentUserRole) && !(forceReadOnly && t.id === 'actions' && record.category !== 'RMA'),
  );

  const renderTabContent = (tabId: string) => {
    switch (tabId as TabId) {
      case 'general':
        return (
          <RecordOverviewTab
            record={record}
            currentUserRole={currentUserRole}
            currentUserName={currentUserName}
            onUpdateRecord={onUpdateRecord}
            readOnly={forceReadOnly}
            topBanner={<TransportSignoffPanel record={record} currentUserRole={currentUserRole} />}
          />
        );

      case 'actions':
        if (record.category === 'RMA') {
          return <RmaWorkflowPanel key={record.id} record={record} currentUserRole={currentUserRole} />;
        }
        return (
          <DispatchActionsTab
            record={record}
            allRecords={allRecords}
            currentUserRole={currentUserRole}
            currentUserName={currentUserName}
            onUpdateRecord={onUpdateRecord}
            outputActionConfigs={outputActionConfigs}
            idPrefix="delivery"
          />
        );

      case 'comments':
        return (
          <RecordCommentsTab
            recordId={record.id}
            readOnly={forceReadOnly || !access.canRecord(record.category, 'COMMENT')}
          />
        );

      case 'remarks':
        return <RecordRemarksTab recordId={record.id} />;

      case 'audit':
        return <RecordAuditTab recordId={record.id} />;

      case 'documents':
        return <DocumentsTab record={record} readOnly={forceReadOnly || !access.canRecord(record.category, 'POD')} />;

      default:
        return null;
    }
  };

  if (detail.error instanceof ApiError && [401, 403, 404].includes(detail.error.status)) {
    return (
      <div role="alert" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-700">
        This record is no longer available to your account.{' '}
        <button type="button" onClick={onBack} className="min-h-11 px-3 font-semibold text-blue-700">
          Back to records
        </button>
      </div>
    );
  }

  const headerActions = (['Sales Coordinator', 'Logistics', 'TASS', 'Admin'] as UserRole[]).includes(
    currentUserRole,
  ) ? (
    <div>
      <button
        type="button"
        onClick={() => {
          setPdfError(null);
          setPdfDialogOpen(true);
        }}
        disabled={pdfLoading}
        aria-haspopup="dialog"
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors font-semibold text-slate-600 disabled:opacity-60"
        title="Download delivery manifest with documentation trail (PDF)"
      >
        {pdfLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
        {pdfLoading ? 'Generating…' : 'Download PDF'}
      </button>
      <ActionDialog
        open={pdfDialogOpen}
        title="Download PDF"
        description={isRmaRecord
          ? 'Choose a paper size for the client slip. Excludes internal Logistics notes and history.'
          : "Choose a paper size for this record's manifest and documentation trail."}
        confirmLabel="Confirm & Download"
        pending={pdfLoading}
        error={pdfError}
        onConfirm={handleDownloadPdf}
        onDismiss={() => {
          setPdfDialogOpen(false);
          setPdfError(null);
        }}
      >
        <DocumentSizeSelect value={docSize} onChange={setDocSize} disabled={pdfLoading} orientationLabel={isRmaRecord ? 'Portrait' : 'Landscape'} />
        {isRmaRecord && (
          <label className="mt-3 flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-1" checked={includeTrail} disabled={pdfLoading} onChange={e => setIncludeTrail(e.target.checked)} />
            <span>
              Include internal documentation trail (staff copy only)
              <span className="block text-xs text-amber-700">Adds remarks history, comments and audit entries. Do not give this copy to the client.</span>
            </span>
          </label>
        )}
      </ActionDialog>
    </div>
  ) : undefined;

  const topNotice = detail.isError ? (
    <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
      The latest record could not sync. Saved information is shown.{' '}
      <button type="button" className="min-h-11 underline" onClick={() => void detail.refetch()}>
        Retry sync
      </button>
    </p>
  ) : undefined;

  return (
    <RecordWorkspaceShell
      id={`delivery-record-workspace-${record.id}`}
      tabsId={`record-${record.id}`}
      record={record}
      allRecordIds={allRecordIds}
      onBack={onBack}
      onNavigateToRecord={onNavigateToRecord}
      headerActions={headerActions}
      topNotice={topNotice}
      tabs={visibleTabs.map(tab => {
        const Icon = tab.icon;
        return {
          id: tab.id,
          label: tab.label,
          icon: <Icon aria-hidden="true" className="w-[18px] h-[18px] shrink-0" />,
        };
      })}
      renderPanel={renderTabContent}
    >
      {pdfPreviewUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="PDF preview"
        >
          <div className="flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-slate-950 shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 text-white">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{pdfFileName}</p>
                <p className="text-xs text-slate-400">PDF preview</p>
              </div>
              <button
                type="button"
                onClick={() => setPdfPreviewUrl(null)}
                className="rounded p-2 hover:bg-white/10"
                aria-label="Close preview"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            <iframe title="Generated delivery PDF preview" src={pdfPreviewUrl} className="min-h-0 flex-1 bg-white" />
            <div className="flex justify-center p-4">
              <button
                type="button"
                onClick={() => {
                  if (!pdfPreviewBlob) return;
                  const link = document.createElement('a');
                  link.href = URL.createObjectURL(pdfPreviewBlob);
                  link.download = pdfFileName;
                  link.click();
                  URL.revokeObjectURL(link.href);
                }}
                className="flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100"
              >
                <Download className="h-4 w-4" />
                Download PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </RecordWorkspaceShell>
  );
}
