import { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, ChevronLeft, ChevronRight,
  ClipboardList, History, ShieldCheck, FolderOpen,
  FileText, Shield, Paperclip, Lock, Loader2, AlertTriangle,
  CheckCircle2, Check, MessageSquare, Send
} from 'lucide-react';
import { DeliveryRecord, UserRole, DeliveryStatus } from '../types';
import { acStatusLabel, DELIVERY_STATUSES } from '../data';
import { api, ApiAuditEntry, ApiComment } from '../api';
import ExportMenu from './ExportMenu';
import { DELIVERY_COLUMNS, AC_EXTRA_COLUMNS, fmtDate, fmtDatetime, fmtStatus } from '../utils/export';

interface AccountingCollectionWorkspaceProps {
  record: DeliveryRecord;
  allRecordIds: string[];
  currentUserRole: UserRole;
  currentUserName: string;
  onBack: () => void;
  onVerifyCollection: (id: string) => Promise<void>;
  onNavigateToRecord: (id: string) => void;
  onUpdateRecord: (id: string, updates: Partial<DeliveryRecord>) => void;
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

// ─── Audit Trail Tab ──────────────────────────────────────────────────────────
function AuditTrailTab({ recordId }: { recordId: string }) {
  const [entries, setEntries] = useState<ApiAuditEntry[] | null>(null);
  const [comments, setComments] = useState<ApiComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.getRecordAudit(recordId),
      api.getRecordComments(recordId)
    ])
      .then(([audit, cmts]) => { setEntries(audit); setComments(cmts); })
      .catch(e => setError(e.message ?? 'Failed to load audit trail.'))
      .finally(() => setLoading(false));
  }, [recordId]);

  const handleSubmitComment = async () => {
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
          Notes & Comments
          {comments.length > 0 && (
            <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {comments.length}
            </span>
          )}
        </h4>

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
        <div className="flex items-end gap-2 px-2">
          <textarea
            ref={inputRef}
            value={commentBody}
            onChange={e => setCommentBody(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmitComment();
            }}
            placeholder="Add a note or comment… (Ctrl+Enter to send)"
            rows={2}
            className="flex-1 text-xs border border-slate-300 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1] placeholder:text-slate-400"
          />
          <button
            onClick={handleSubmitComment}
            disabled={!commentBody.trim() || submitting}
            className="p-2.5 bg-[#0078C1] text-white rounded-lg hover:bg-[#005fa3] disabled:opacity-40 transition-colors cursor-pointer shrink-0"
            title="Send comment (Ctrl+Enter)"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
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

  const canVerify = currentUserRole === 'TASS' || currentUserRole === 'Admin';

  if (!canVerify) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
        <Lock className="w-8 h-8 text-slate-300" />
        <p className="text-sm">Verification requires TASS or Admin role.</p>
      </div>
    );
  }

  if (record.collection_verified) {
    return (
      <div className="max-w-md mx-auto py-10 space-y-4">
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
  onUpdateRecord: (id: string, updates: Partial<DeliveryRecord>) => void;
}) {
  const [updating, setUpdating] = useState(false);
  const [statusRemarks, setStatusRemarks] = useState('');
  const [remarksError, setRemarksError] = useState(false);
  const canEdit = currentUserRole === 'Sales Coordinator' || currentUserRole === 'Logistics' || currentUserRole === 'Admin';

  const handleStatusChange = async (newStatus: DeliveryStatus) => {
    if (!canEdit || newStatus === record.status || updating) return;
    if (!statusRemarks.trim()) { setRemarksError(true); return; }
    setRemarksError(false);
    setUpdating(true);
    try {
      await onUpdateRecord(record.id, { status: newStatus, ...({ status_remarks: statusRemarks.trim() } as any) });
      setStatusRemarks('');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Status Update card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Collection Status</h4>
        {canEdit ? (
          <>
            <div>
              <textarea
                value={statusRemarks}
                onChange={e => { setStatusRemarks(e.target.value); if (remarksError && e.target.value.trim()) setRemarksError(false); }}
                rows={2}
                placeholder="Reason for status change (required)…"
                className={`w-full px-3 py-2 border rounded-lg text-xs resize-none focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1] ${remarksError ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}
              />
              {remarksError && <p className="text-[11px] text-red-600 font-semibold mt-1">Remarks are required to change status.</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              {DELIVERY_STATUSES.map(s => {
                const isActive = record.status === s;
                return (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    disabled={isActive || updating}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all disabled:cursor-default ${
                      isActive
                        ? (STATUS_ACTIVE[s] ?? 'bg-slate-700 text-white border-slate-700')
                        : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50 hover:border-slate-400'
                    } ${updating && !isActive ? 'opacity-50' : ''}`}
                  >
                    {acStatusLabel(s)}
                  </button>
                );
              })}
            </div>
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
        </div>
        <p className="text-sm font-bold text-slate-700 mb-3">{record.company_name}</p>
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
            Collection Status: {acStatusLabel(record.status)}
          </p>
          <p className={`text-[11px] ${record.status === 'Delivered' ? 'text-emerald-600' : 'text-amber-600'}`}>
            {record.status === 'Delivered'
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
            { label: 'Date & Time',     value: record.date_time ? formatTs(record.date_time) : '—' },
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
        return <ScaffoldTab icon={Paperclip} label="Documents & Attachments" />;
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
            onClick={onBack}
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
