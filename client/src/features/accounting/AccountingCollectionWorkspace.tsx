import { usePermissions } from '@/hooks/usePermissions';
import { ReturnToDraftDialog } from '@/features/deliveries/ReturnToDraftDialog';
import { selectableStatuses, canRecordTimeIn, isDraftRecord, isPriorityLocked, PRIORITY_LOCKED_NOTE } from '@/utils/recordLifecycle';
import { completionError } from '@/utils/podRequirement';
import { podAttachmentsKey, usePodAttachments } from '@/api/queries/usePodAttachments';
import { operationalSyncOptions } from '@/api/queries/operationalSync';
import { useQuery } from '@tanstack/react-query';
import { PodAttachmentList } from '@/components/PodAttachmentPreview';
import { useRecordTimeInMutation, useUpdateRecordMutation } from '@/api/queries/useRecordsQuery';
import PodUploader from '@/components/PodUploader';
import CommentComposer from '@/components/CommentComposer';
import { CompanyHistoryButton } from '@/components/CompanyHistoryPanel';
import { useUIStore } from '@/store/uiStore';
import { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, ChevronLeft, ChevronRight,
  ClipboardList, History, ShieldCheck, FolderOpen,
  FileText, Shield, Paperclip, Lock, Loader2, AlertTriangle,
  CheckCircle2, Check, MessageSquare
} from 'lucide-react';
import { DeliveryRecord, UserRole, DeliveryStatus } from '@/types';
import { acStatusLabel, DELIVERY_STATUSES } from '@/data';
import { api, ApiAuditEntry, ApiComment } from '@/api';
import ExportMenu from '@/components/ExportMenu';
import { DELIVERY_COLUMNS, AC_EXTRA_COLUMNS, fmtDate, fmtDatetime, fmtStatus } from '@/utils/export';
import { useWorkspaceDraft, useWorkspaceNavigation } from '@/features/deliveries/WorkspaceDrafts';
import { notify } from '@/utils/notify';

interface AccountingCollectionWorkspaceProps {
  record: DeliveryRecord;
  allRecordIds: string[];
  currentUserRole: UserRole;
  currentUserName: string;
  onBack: () => void;
  onVerifyCollection: (id: string) => Promise<void>;
  onNavigateToRecord: (id: string) => void;
  onUpdateRecord: (id: string, updates: Partial<DeliveryRecord>) => Promise<void>;
}

type TabId = 'overview' | 'timeline' | 'verification' | 'documents';

interface TabDef {
  id: TabId;
  label: string;
  icon: typeof FileText;
}

const ALL_TABS: TabDef[] = [
  { id: 'overview',      label: 'Overview',      icon: ClipboardList },
  { id: 'timeline',      label: 'Audit Trail',   icon: History       },
  { id: 'verification',  label: 'Verification',  icon: ShieldCheck   },
  { id: 'documents',     label: 'Documents',     icon: FolderOpen    },
];

const STATUS_COLOR: Record<string, string> = {
  'Delivered':   'bg-emerald-50 text-emerald-700 border-emerald-200',
  'On-Hold':     'bg-red-50 text-red-700 border-red-200',
  'Rescheduled': 'bg-purple-50 text-purple-700 border-purple-200',
  'Pending':     'bg-amber-50 text-amber-700 border-amber-200',
  'Scheduled':   'bg-blue-50 text-blue-700 border-blue-200'
};

const PRIORITY_COLOR: Record<string, string> = {
  '1 - Low':      'bg-slate-100 text-slate-700 border-slate-200',
  '2 - Moderate': 'bg-amber-50 text-amber-700 border-amber-200',
  '3 - High':     'bg-red-50 text-red-700 border-red-200'
};

function formatTs(ts: string): string {
  return new Date(ts).toLocaleString('en-PH', {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

// ─── Audit diff helpers ───────────────────────────────────────────────────────
// entry.previous_value / entry.new_value are full record snapshots, so a
// "diff" means comparing the two objects key by key rather than parsing a
// pre-computed delta.

const AUDIT_FIELD_LABELS: Record<string, string> = {
  status: 'Status',
  driver: 'Driver',
  delivery_date: 'Delivery Date',
  vehicle: 'Vehicle',
  driver_assistants: 'Driver Assistant',
  remarks: 'Remarks',
  priority: 'Priority',
  area: 'Area',
  company_name: 'Company',
  collection_verified: 'Collection Verified',
  collection_verified_by: 'Verified By',
  collection_verified_at: 'Verified At',
  amount: 'Amount',
  reference: 'Reference (SAP Number)',
  account_manager: 'Account Manager',
};

const AUDIT_SKIP_FIELDS = new Set([
  'id', 'company_id', 'customer_id', 'created_by_id',
  'created_at', 'updated_at', 'created_by', 'modified_by', 'modified_at',
  'document_attachment', 'attachments', 'output_actions_log', 'email_notification_sent',
  'linked_collection', 'linked_collection_id',
]);

function shouldSkipAuditField(key: string): boolean {
  return AUDIT_SKIP_FIELDS.has(key) || key.endsWith('_id') || key.toLowerCase().includes('cmrx');
}

function auditFieldLabel(key: string): string {
  if (AUDIT_FIELD_LABELS[key]) return AUDIT_FIELD_LABELS[key];
  return key.split('_').map(w => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
}

function isEmptyAuditValue(v: unknown): boolean {
  return v === null || v === undefined || v === '' || v === false || (Array.isArray(v) && v.length === 0);
}

function formatAuditValue(v: unknown): string {
  if (isEmptyAuditValue(v)) return '—';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v))) return formatTs(v);
  if (Array.isArray(v)) {
    if (v.every(item => typeof item === 'string' || typeof item === 'number')) return v.join(', ');
    const formatted = v.map(item => {
      if (item && typeof item === 'object') {
        const sku = (item as any).sku || (item as any).description;
        const qty = (item as any).quantity;
        if (sku !== undefined && qty !== undefined) return `${sku} × ${qty}`;
        if (sku !== undefined) return String(sku);
        if ('name' in (item as any) && typeof (item as any).name === 'string') return (item as any).name;
      }
      return typeof item === 'object' ? JSON.stringify(item) : String(item);
    }).filter(Boolean);
    return formatted.length > 0 ? formatted.join(', ') : '—';
  }
  if (typeof v === 'object' && v !== null) {
    if ('name' in (v as any) && typeof (v as any).name === 'string') return (v as any).name;
    if ('reference' in (v as any) && typeof (v as any).reference === 'string') return (v as any).reference;
    try {
      return JSON.stringify(v);
    } catch {
      return '—';
    }
  }
  return String(v);
}

function normalizeAuditForDiff(key: string, v: unknown): unknown {
  if (key === 'line_items' && Array.isArray(v)) {
    return v.map((item: any) => ({
      sku: typeof item?.sku === 'string' ? item.sku : typeof item?.description === 'string' ? item.description : '',
      quantity: typeof item?.quantity === 'number' ? item.quantity : parseInt(item?.quantity, 10) || 1,
    }));
  }
  return v;
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
      if (JSON.stringify(normalizeAuditForDiff(key, ov)) === JSON.stringify(normalizeAuditForDiff(key, nv))) continue;
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
      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800"><Paperclip className="h-4 w-4" aria-hidden="true" /> Saved collection evidence</h3>
      {!canRead ? <p className="text-xs text-slate-600">Collection evidence is not available for your account.</p>
        : attachments.isPending ? <p role="status" className="text-xs text-slate-600">Loading saved collection evidence…</p>
        : attachments.isError ? <p role="alert" className="text-xs text-red-700">Could not load collection evidence. <button type="button" onClick={() => void attachments.refetch()} className="underline">Retry loading evidence</button></p>
        : attachments.data.length === 0 ? <p className="text-xs text-slate-600">No saved collection evidence is attached to this record.</p>
        : <PodAttachmentList key={recordId} files={attachments.data} />}
    </section>
  );
}

// ─── Audit Trail Tab ──────────────────────────────────────────────────────────
function AuditTrailTab({ recordId }: { recordId: string }) {
  const canComment = usePermissions().canRecord('Accounting Collection', 'COMMENT');
  const [entries, setEntries] = useState<ApiAuditEntry[] | null>(null);
  const [comments, setComments] = useState<ApiComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [retry, setRetry] = useState(0);
  useWorkspaceDraft('comments', !!commentBody, submitting);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.getRecordAudit(recordId).catch(() => { throw new Error('Could not load audit history. Try again.'); }),
      api.getRecordComments(recordId).catch(() => { throw new Error('Could not load comments. Try again.'); })
    ])
      .then(([audit, cmts]) => { setEntries(audit); setComments(cmts); })
      .catch(e => setError(e.message ?? 'Failed to load audit trail.'))
      .finally(() => setLoading(false));
  }, [recordId, retry]);

  const handleSubmitComment = async () => {
    const body = commentBody.trim();
    if (!canComment || !body || submitting) return;
    setSubmitting(true);
    try {
      const created = await api.createRecordComment(recordId, body);
      setComments(prev => [...prev, created]);
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

  if (error) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-center gap-2 py-20 text-red-600 text-sm">
        <AlertTriangle className="w-4 h-4" /> {error}
        <button type="button" onClick={() => setRetry(value => value + 1)} className="min-h-11 rounded px-3 font-semibold underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700">Retry loading history and comments</button>
      </div>
    );
  }

  const actionColor: Record<string, string> = {
    CREATE: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    UPDATE: 'bg-blue-100 text-blue-700 border-blue-200',
    DELETE: 'bg-red-100 text-red-700 border-red-200'
  };
  const dotColor: Record<string, string> = {
    CREATE: 'bg-emerald-500',
    UPDATE: 'bg-blue-500',
    DELETE: 'bg-red-500'
  };

  return (
    <div className="space-y-6 py-4 px-2">
      {/* Audit entries */}
      {(!entries || entries.length === 0) ? (
        <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
          <Shield className="w-10 h-10 text-slate-200" />
          <p className="text-sm text-slate-400">No audit events recorded yet for this record.</p>
        </div>
      ) : (
        <div>
          <p className="text-xs text-slate-400 mb-4 px-2">
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
        </div>
      )}

      {/* Comments section */}
      <div className="border-t border-slate-200 pt-5">
        <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2 mb-4 px-2">
          <MessageSquare className="w-3.5 h-3.5 text-[#0078C1]" />
          Comments
          {comments.length > 0 && (
            <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {comments.length}
            </span>
          )}
        </h4>
        <p id="accounting-comment-help" className="mb-3 px-2 text-sm text-slate-600">Optional discussion about this record. Comments do not replace the remarks required when making changes.</p>

        {/* Existing comments */}
        {comments.length > 0 && (
          <div className="space-y-3 mb-4 px-2">
            {comments.map(c => (
              <div key={c.id} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-[#1F3864] flex items-center justify-center text-white text-[9px] font-black shrink-0">
                  {c.author.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}
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

        {/* New comment input */}
        <CommentComposer disabled={!canComment}
          id="accounting-comment-body"
          describedBy="accounting-comment-help"
          value={commentBody}
          onChange={setCommentBody}
          onSubmit={handleSubmitComment}
          submitting={submitting}
          className="px-2"
        />
      </div>
    </div>
  );
}

// ─── Verification Tab ─────────────────────────────────────────────────────────
function VerificationTab({
  record,
  currentUserRole,
  onVerifyCollection
}: {
  record: DeliveryRecord;
  currentUserRole: UserRole;
  onVerifyCollection: (id: string) => Promise<void>;
}) {
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useWorkspaceDraft('verification', false, verifying);

  const access = usePermissions();
  const canVerify = currentUserRole === 'TASS' && access.canRecord('Accounting Collection', 'VERIFY_COLLECTION');

  if (!canVerify) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
        <Lock className="w-8 h-8 text-slate-300" />
        <p className="text-sm">Verification requires TASS collection-verification permission.</p>
      </div>
    );
  }

  if (record.collection_verified) {
    return (
      <div className="max-w-md mx-auto py-10 space-y-4">
        <CollectionEvidence recordId={record.id} />
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 space-y-2">
          <p className="text-emerald-700 font-black text-sm flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" /> Collection Verified
          </p>
          {record.collection_verified_by && (
            <p className="text-emerald-600 text-xs">Verified by: <span className="font-semibold">{record.collection_verified_by}</span></p>
          )}
          {record.collection_verified_at && (
            <p className="text-emerald-600 text-xs">Verified at: <span className="font-semibold">{formatTs(record.collection_verified_at)}</span></p>
          )}
        </div>
      </div>
    );
  }

  if (record.status !== 'Delivered') {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
        <ShieldCheck className="w-10 h-10 text-slate-200" />
        <p className="text-sm text-center max-w-xs">
          Verification is only available once a record is marked Collected.
        </p>
      </div>
    );
  }

  const handleVerify = async () => {
    setVerifying(true);
    setError(null);
    try {
      await onVerifyCollection(record.id);
    } catch (e: any) {
      setError(e.message ?? 'Verification failed. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-10 space-y-4">
      <CollectionEvidence recordId={record.id} />
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
        <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#0078C1]" /> Collection Verification
        </p>
        {record.amount != null && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-0.5">Amount Being Verified</p>
            <p className="text-2xl font-black text-emerald-800 tabular-nums">
              ₱{record.amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-emerald-700 mt-1">for {record.company_name}</p>
          </div>
        )}
        <p className="text-xs text-slate-500">
          {record.amount != null
            ? `Confirm that the collection of ₱${record.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })} from ${record.company_name} has been completed and verified.`
            : 'This record is marked Collected. Confirm that the billing collection has been completed and verified.'
          }
        </p>
        {error && (
          <p className="text-red-600 text-xs flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> {error}
          </p>
        )}
        <button
          onClick={handleVerify}
          disabled={verifying}
          className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-60 transition-all"
        >
          {verifying
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Check className="w-3.5 h-3.5" />
          }
          {record.amount != null
            ? `Verify Collection of ₱${record.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
            : 'Mark as Collection Verified'
          }
        </button>
      </div>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────
const STATUS_ACTIVE: Record<string, string> = {
  'Scheduled':   'bg-blue-600 text-white border-blue-600',
  'Delivered':   'bg-emerald-600 text-white border-emerald-600',
  'On-Hold':     'bg-red-600 text-white border-red-600',
  'Rescheduled': 'bg-purple-600 text-white border-purple-600',
  'Pending':     'bg-amber-500 text-white border-amber-500',
};

function OverviewTab({
  record,
  currentUserRole,
  onUpdateRecord,
}: {
  record: DeliveryRecord;
  currentUserRole: UserRole;
  onUpdateRecord: (id: string, updates: Partial<DeliveryRecord>) => Promise<void>;
}) {
  const navigate = useUIStore(s => s.handleNavigate);
  const [updating, setUpdating] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [receivedBy, setReceivedBy] = useState(record.received_by ?? '');
  const [draftReference, setDraftReference] = useState(record.reference);
  const [referenceEditVersion, setReferenceEditVersion] = useState(record.edit_version);
  useEffect(() => { setReceivedBy(record.received_by ?? ''); setDraftReference(record.reference); setReferenceEditVersion(record.edit_version); setStatusError(null); }, [record.id]);
  const { readiness, uploadStaged } = usePodAttachments(record.id);
  const timeInMutation = useRecordTimeInMutation();
  const referenceMutation = useUpdateRecordMutation();
  const [statusRemarks, setStatusRemarks] = useState('');
  const [remarksError, setRemarksError] = useState(false);
  useWorkspaceDraft(
    'overview',
    draftReference !== record.reference || !!statusRemarks || receivedBy !== (record.received_by ?? ''),
    updating
  );
  const access = usePermissions();
  const canEdit = (currentUserRole === 'Sales Coordinator' || currentUserRole === 'Logistics' || currentUserRole === 'Admin') && access.canRecord(record.category, 'WRITE');

  const [returnToDraftOpen, setReturnToDraftOpen] = useState(false);

  const handleStatusChange = async (newStatus: DeliveryStatus) => {
    if (!canEdit || !access.canRecord(record.category, 'STATUS') || newStatus === 'Delivered' && !access.canRecord(record.category, 'COMPLETE') || newStatus === 'Draft' && !access.canRecord(record.category, 'SUBMIT') || newStatus === record.status || updating) return;
    if (newStatus === 'Draft') { setReturnToDraftOpen(true); return; }
    const error = completionError(record, newStatus, receivedBy, readiness);
    if (error) { setStatusError(error); return; }
    setStatusError(null);
    if (!statusRemarks.trim()) { setRemarksError(true); return; }
    setRemarksError(false);
    setUpdating(true);
    try {
      await uploadStaged();
      await onUpdateRecord(record.id, { status: newStatus, ...(newStatus === "Delivered" ? { received_by: receivedBy.trim() } : {}), ...({ status_remarks: statusRemarks.trim() } as any) });
      setStatusRemarks('');
      notify.success('Collection status updated');
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Could not update the collection.');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Status Update card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Collection Status</h4>
        {statusError && <p role="alert" className="text-xs text-red-700">{statusError}</p>}
        {canEdit ? (
          <>
            {access.canRecord(record.category, 'UPDATE') && isDraftRecord(record) && (currentUserRole === 'Sales Coordinator' || currentUserRole === 'Admin') && <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">Reference (required to submit)</label>
              <input value={draftReference} onChange={e => setDraftReference(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs" />
              <button type="button" disabled={updating || !statusRemarks.trim() || !draftReference.trim() || draftReference === record.reference} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold disabled:opacity-50"
                onClick={async () => { setUpdating(true); setStatusError(null); try { const saved = await referenceMutation.mutateAsync({ id: record.id, updates: { reference: draftReference.trim(), remarks: statusRemarks.trim(), expected_edit_version: referenceEditVersion } }); setReferenceEditVersion(saved.edit_version); setStatusRemarks(''); notify.success('Draft reference saved'); } catch (error) { notify.error(error instanceof Error ? error.message : 'Could not save the draft.'); } finally { setUpdating(false); } }}>Save Draft Reference</button>
            </div>}
            {record.status !== 'Delivered' && <>
              <PodUploader recordId={record.id} required disabled={updating} />
              <label className="block text-xs font-bold text-slate-700">Received By *</label>
              <input value={receivedBy} onChange={e => setReceivedBy(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs" />
              {access.canRecord(record.category, 'TIME_IN') && canRecordTimeIn(record) && (currentUserRole === 'Logistics' || currentUserRole === 'Admin') && <button type="button" disabled={updating || !statusRemarks.trim()} className="rounded-lg bg-blue-700 px-4 py-2 text-xs text-white disabled:opacity-50"
                onClick={async () => { setUpdating(true); setStatusError(null); try { await timeInMutation.mutateAsync({ id: record.id, remarks: statusRemarks.trim() }); setStatusRemarks(''); notify.success('Time In recorded'); } catch (error) { notify.error(error instanceof Error ? error.message : 'Could not record Time In.'); } finally { setUpdating(false); } }}>Record Time In</button>}
              {completionError(record, 'Delivered', receivedBy, readiness) && <p className="text-xs text-slate-600">{completionError(record, 'Delivered', receivedBy, readiness)}</p>}
            </>}
            <div>
              <label htmlFor="accounting-change-remarks" className="mb-1 block text-sm font-medium text-slate-700">Remarks — reason for change (required)</label>
              <p id="accounting-change-remarks-help" className="mb-2 text-xs text-slate-600">Explain why you are making this change. The reason is saved with your name in the record history.</p>
              <textarea
                id="accounting-change-remarks"
                aria-describedby="accounting-change-remarks-help"
                required
                value={statusRemarks}
                onChange={e => { setStatusRemarks(e.target.value); if (remarksError && e.target.value.trim()) setRemarksError(false); }}
                rows={2}
                placeholder="Reason for status change (required)…"
                className={`w-full px-3 py-2 border rounded-lg text-xs resize-none focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1] ${remarksError ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}
              />
              {remarksError && <p className="text-[11px] text-red-600 font-semibold mt-1">Remarks are required to change status.</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              {selectableStatuses(record, currentUserRole).map(s => {
                const isActive = record.status === s;
                return (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    disabled={isActive || updating || !access.canRecord(record.category, 'STATUS') || (s === 'Delivered' && !access.canRecord(record.category, 'COMPLETE')) || (s === 'Draft' && !access.canRecord(record.category, 'SUBMIT')) || !!completionError(record, s, receivedBy, readiness)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all disabled:cursor-default ${
                      isActive
                        ? (STATUS_ACTIVE[s] ?? 'bg-slate-700 text-white border-slate-700')
                        : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50 hover:border-slate-400'
                    } ${updating && !isActive ? 'opacity-50' : ''}`}
                  >
                    {s === "Scheduled" && isDraftRecord(record) ? "Submit" : s === "Draft" ? "Return to Draft" : acStatusLabel(s)}
                  </button>
                );
              })}
            </div>
            <ReturnToDraftDialog
              record={record}
              open={returnToDraftOpen}
              onDismiss={() => setReturnToDraftOpen(false)}
              onSubmit={async reason => { await onUpdateRecord(record.id, { status: 'Draft', remarks: reason }); notify.success('Record returned to Draft'); }}
            />
          </>
        ) : (
          <span className={`inline-flex px-2.5 py-1 rounded-full border text-[10px] font-semibold tracking-wide ${STATUS_COLOR[record.status] ?? 'bg-slate-50 text-slate-700 border-slate-200'}`}>
            {acStatusLabel(record.status)}
          </span>
        )}
      </div>

      {/* Header card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <span className="font-mono font-black text-lg text-slate-900">{record.id}</span>
          <span className="px-2.5 py-1 rounded-md font-black text-[10px] uppercase tracking-wider border bg-blue-100 text-blue-800 border-blue-200">
            Accounting Collection
          </span>
          <span className={`px-2.5 py-1 rounded-full border text-[10px] font-semibold tracking-wide ${STATUS_COLOR[record.status] ?? 'bg-slate-50 text-slate-700 border-slate-200'}`}>
            {acStatusLabel(record.status)}
          </span>
          <span className={`px-2.5 py-1 rounded-full border text-[10px] font-semibold ${PRIORITY_COLOR[record.priority] ?? 'bg-slate-100 text-slate-700 border-slate-200'}`}>
            Priority: {record.priority}
          </span>
          {isPriorityLocked(record) && <span className="text-[11px] text-slate-500">{PRIORITY_LOCKED_NOTE}</span>}
        </div>
        <div className="text-sm font-bold text-slate-700 mb-3">
          <CompanyHistoryButton
            companyId={record.company_id}
            companyName={record.company_name}
            currentRecordId={record.id}
            disabled={updating}
            onOpenRecord={navigate}
          />
        </div>
        {record.amount != null && (
          <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
            <div>
              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-0.5">Amount to Collect</p>
              <p className="text-2xl font-black text-emerald-800 tabular-nums">
                ₱{record.amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Collection status cross-reference — TASS needs the collection run confirmed before verifying it */}
      <div className={`border rounded-xl p-4 flex items-start gap-3 ${
        record.status === 'Delivered'
          ? 'bg-emerald-50 border-emerald-200'
          : 'bg-amber-50 border-amber-200'
      }`}>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
          record.status === 'Delivered' ? 'bg-emerald-100' : 'bg-amber-100'
        }`}>
          {record.status === 'Delivered'
            ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            : <AlertTriangle className="w-4 h-4 text-amber-600" />
          }
        </div>
        <div>
          <p className={`text-xs font-black uppercase tracking-wider mb-0.5 ${
            record.status === 'Delivered' ? 'text-emerald-700' : 'text-amber-700'
          }`}>
            Collection Status: {acStatusLabel(record.status)}{record.collection_verified ? ' · Collection Verified' : ''}
          </p>
          <p className={`text-[11px] ${record.status === 'Delivered' ? 'text-emerald-600' : 'text-amber-600'}`}>
            {record.collection_verified
              ? `Collection verified${record.collection_verified_by ? ` by ${record.collection_verified_by}` : ''}${record.collection_verified_at ? ` at ${formatTs(record.collection_verified_at)}` : ''}.`
              : record.status === 'Delivered'
                ? 'Collection confirmed. Verification is now available.'
                : 'Collection has not been marked Collected yet. Verification cannot proceed until the collection is confirmed.'}
          </p>
          {record.driver && (
            <p className="text-[10px] text-slate-500 mt-1 font-semibold">
              Driver: {record.driver}{record.driver_assistants?.length ? ` · Asst: ${record.driver_assistants.join(', ')}` : ''}
            </p>
          )}
        </div>
      </div>

      {/* Fields grid */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Record Details</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-xs">
          {[
            { label: 'Company',         value: record.company_name },
            { label: 'Reference (SAP)', value: record.reference },
            { label: 'Area',            value: record.area },
            { label: 'Driver',          value: record.driver || 'Unassigned' },
            { label: 'Account Manager', value: record.account_manager },
            { label: 'Delivery Date',   value: record.delivery_date },
            { label: 'Created At',      value: record.created_at ? formatTs(record.created_at) : '—' },
            { label: 'Item Type',       value: record.item_type },
            { label: 'Draft',           value: record.is_draft },
          ].map(row => (
            <div key={row.label} className="flex flex-col gap-0.5">
              <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">{row.label}</span>
              <span className="font-semibold text-slate-800">{row.value}</span>
            </div>
          ))}
        </div>

        {/* Full-width fields */}
        {record.remarks && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1.5">Remarks</p>
            <p className="text-sm text-slate-700 leading-relaxed">{record.remarks}</p>
          </div>
        )}
        {record.item_description && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1.5">Item Description</p>
            <p className="text-sm text-slate-700 leading-relaxed">{record.item_description}</p>
          </div>
        )}
      </div>

      {/* Audit footer */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { label: 'Created By',    value: record.created_by },
          { label: 'Created At',    value: formatTs(record.created_at) },
          { label: 'Modified By',   value: record.modified_by },
          { label: 'Updated At',    value: formatTs(record.modified_at) },
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

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AccountingCollectionWorkspace({
  record,
  allRecordIds,
  currentUserRole,
  currentUserName,
  onBack,
  onVerifyCollection,
  onNavigateToRecord,
  onUpdateRecord,
}: AccountingCollectionWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const { requestLeave, pending } = useWorkspaceNavigation();
  const navigationNonce = useUIStore(s => s.navigationNonce);
  const currentScreen = useUIStore(s => s.currentScreen);
  const selectedRecordId = useUIStore(s => s.selectedRecordId);
  const initialNavigationNonce = useRef(navigationNonce);

  useEffect(() => {
    if (navigationNonce === initialNavigationNonce.current) return;
    initialNavigationNonce.current = navigationNonce;

    if (currentScreen !== 'accounting_collection' || selectedRecordId) return;
    requestLeave(onBack);
  }, [navigationNonce, currentScreen, selectedRecordId, requestLeave, onBack]);

  const currentIndex = allRecordIds.indexOf(record.id);
  const prevId = currentIndex > 0 ? allRecordIds[currentIndex - 1] : null;
  const nextId = currentIndex < allRecordIds.length - 1 ? allRecordIds[currentIndex + 1] : null;

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewTab record={record} currentUserRole={currentUserRole} onUpdateRecord={onUpdateRecord} />;
      case 'timeline':
        return <AuditTrailTab recordId={record.id} />;
      case 'verification':
        return (
          <VerificationTab
            record={record}
            currentUserRole={currentUserRole}
            onVerifyCollection={onVerifyCollection}
          />
        );
      case 'documents':
        return <CollectionEvidence recordId={record.id} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4" id="accounting-collection-workspace">
      {/* Navigation bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => requestLeave(onBack)}
            disabled={pending}
            className="flex items-center gap-1.5 text-[#0078C1] hover:text-[#1F3864] text-xs font-semibold transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Accounting Collection
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
          {(currentUserRole === 'TASS' || currentUserRole === 'Admin') && (
            <ExportMenu
              rows={[{
                id: record.id,
                company_name: record.company_name,
                reference: record.reference,
                category: record.category,
                priority: record.priority,
                area: record.area,
                delivery_date_fmt: fmtDate(record.delivery_date),
                driver: record.driver || '',
                driver_assistants: record.driver_assistants?.join(', ') || '',
                account_manager: record.account_manager,
                vehicle: record.vehicle,
                item_type: record.item_type,
                status_fmt: fmtStatus(record.status),
                remarks: record.remarks || '',
                created_by: record.created_by,
                created_at_fmt: fmtDatetime(record.created_at),
                collection_verified_fmt: record.collection_verified ? 'Verified' : 'Pending',
                collection_verified_by: record.collection_verified_by || '',
                collection_verified_at_fmt: record.collection_verified_at ? fmtDatetime(record.collection_verified_at) : '',
              }]}
              columns={[...DELIVERY_COLUMNS, ...AC_EXTRA_COLUMNS]}
              sheetName="Accounting Collection"
              filename={`ac-record-${record.id}`}
              pdfTitle="Accounting Collection Record"
              showPdf={true}
              pdfPortrait={true}
              meta={{
                reportName: 'Accounting Collection Record',
                generatedByName: currentUserName,
                generatedByRole: currentUserRole,
              }}
            />
          )}
        </div>
      </div>

      {/* Tab Navigation + Content */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 overflow-x-auto">
          <div className="flex items-stretch min-w-max">
            {ALL_TABS.map(tab => {
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
