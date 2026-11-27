import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, MessageSquare, ScrollText, Shield } from 'lucide-react';
import { api, type ApiComment } from '@/api';
import { operationalSyncOptions } from '@/api/queries/operationalSync';
import CommentComposer from '@/components/CommentComposer';
import { formatManilaTimestamp as formatTs } from '@/utils/manilaTimestamp';
import { notify } from '@/utils/notify';
import { useWorkspaceDraft } from './WorkspaceDrafts';
import { diffAuditEntry, formatAuditValue } from './recordAuditDiff';

// ─── Comments Tab ─────────────────────────────────────────────────────────────

export function RecordCommentsTab({ recordId, readOnly = false }: { recordId: string; readOnly?: boolean }) {
  const client = useQueryClient();
  const query = useQuery({
    ...operationalSyncOptions,
    queryKey: ['record-comments', recordId],
    queryFn: () => api.getRecordComments(recordId),
  });
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
        <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
      </div>
    );
  }

  return (
    <div className="space-y-4 py-2">
      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2 px-1">
        <MessageSquare className="w-3.5 h-3.5 text-brand-blue" />
        Comments
        {comments.length > 0 && (
          <span className="bg-slate-100 text-slate-600 text-xs font-bold px-1.5 py-0.5 rounded-full">
            {comments.length}
          </span>
        )}
      </h4>
      <p id="record-comment-help" className="text-sm text-slate-600">
        Optional discussion about this record. Comments do not replace the remarks required when making changes.
      </p>
      {loadError && (
        <div role="alert" className="text-sm text-red-700">
          {loadError}{' '}
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="min-h-11 rounded px-3 font-semibold underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700"
          >
            Retry loading comments
          </button>
        </div>
      )}
      {readOnly && (
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          You have read-only access to this discussion.
        </p>
      )}

      {comments.length > 0 && (
        <div className="space-y-3">
          {comments.map(c => (
            <div key={c.id} className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-brand-navy flex items-center justify-center text-white text-xs font-bold shrink-0">
                {c.author.split(' ').map((p: string) => p[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-slate-700">{c.author}</span>
                  <span className="text-xs text-slate-400 tabular-nums">{formatTs(c.created_at)}</span>
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
          <p className="text-sm text-slate-400">
            {readOnly ? 'No comments yet.' : 'No comments yet. Add the first comment below.'}
          </p>
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

// ─── Remarks History Tab ──────────────────────────────────────────────────────

const CONTEXT_COLOR: Record<string, string> = {
  CREATION:             'bg-emerald-100 text-emerald-700 border-emerald-200',
  GENERAL_EDIT:         'bg-blue-100 text-blue-700 border-blue-200',
  DRIVER_UPDATE:        'bg-violet-100 text-violet-700 border-violet-200',
  STATUS_CHANGE:        'bg-amber-100 text-amber-700 border-amber-200',
  TIMESTAMP_CORRECTION: 'bg-indigo-100 text-indigo-700 border-indigo-200',
};

const CONTEXT_LABEL: Record<string, string> = {
  CREATION:             'Created',
  GENERAL_EDIT:         'General Edit',
  DRIVER_UPDATE:        'Driver/Delivery',
  STATUS_CHANGE:        'Status Change',
  TIME_IN:              'Transport started',
  RMA_TRANSPORT:        'RMA transport',
  TIMESTAMP_CORRECTION: 'Timestamp Correction',
};

export function RecordRemarksTab({ recordId }: { recordId: string }) {
  const query = useQuery({
    ...operationalSyncOptions,
    queryKey: ['record-remarks', recordId],
    queryFn: () => api.getRecordRemarks(recordId),
  });
  const remarks = query.data ?? [];
  const loading = query.isPending;
  const error = query.isError ? (query.error.message || 'Failed to load remarks.') : null;

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-center gap-2 py-20 text-red-600 text-sm">
        <AlertTriangle className="w-4 h-4" /> {error}
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="min-h-11 rounded px-3 font-semibold underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700"
        >
          Retry loading remarks
        </button>
      </div>
    );
  }

  return (
    <div className="py-4 px-2 space-y-4">
      <div className="flex items-center gap-2 px-1">
        <ScrollText className="w-3.5 h-3.5 text-brand-blue" />
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          Remarks History
        </h4>
        {remarks.length > 0 && (
          <span className="bg-slate-100 text-slate-600 text-xs font-bold px-1.5 py-0.5 rounded-full">
            {remarks.length}
          </span>
        )}
        <span className="text-xs text-slate-400 ml-auto">Read-only · most recent first</span>
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
                <div className="relative z-10 w-9 h-9 rounded-full bg-brand-navy flex items-center justify-center shrink-0 border-2 border-white shadow-sm">
                  <ScrollText className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 bg-white border border-slate-200 rounded-xl p-4 shadow-sm min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 rounded-full border text-xs font-bold uppercase tracking-wider ${CONTEXT_COLOR[r.context] ?? 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                      {CONTEXT_LABEL[r.context] ?? r.context}
                    </span>
                    <span className="text-xs font-semibold text-slate-700">{r.author}</span>
                    <span className="text-xs text-slate-400 ml-auto">{formatTs(r.created_at)}</span>
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

// ─── Audit Trail Tab ──────────────────────────────────────────────────────────

const AUDIT_ACTION_COLOR: Record<string, string> = {
  CREATE: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  UPDATE: 'bg-blue-100 text-blue-700 border-blue-200',
  DELETE: 'bg-red-100 text-red-700 border-red-200',
};

const AUDIT_DOT_COLOR: Record<string, string> = {
  CREATE: 'bg-emerald-500',
  UPDATE: 'bg-blue-500',
  DELETE: 'bg-red-500',
};

export function RecordAuditTab({ recordId }: { recordId: string }) {
  const query = useQuery({
    ...operationalSyncOptions,
    queryKey: ['record-audit', recordId],
    queryFn: () => api.getRecordAudit(recordId),
  });
  const entries = query.data ?? null;
  const loading = query.isPending;
  const error = query.isError ? (query.error.message || 'Failed to load audit trail.') : null;

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-center gap-2 py-20 text-red-600 text-sm">
        <AlertTriangle className="w-4 h-4" /> {error}
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="min-h-11 rounded px-3 font-semibold underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700"
        >
          Retry loading audit trail
        </button>
      </div>
    );
  }

  return (
    <div className="py-4 px-2 space-y-4">
      {!entries || entries.length === 0 ? (
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
                  <div className={`relative z-10 w-9 h-9 rounded-full flex items-center justify-center shrink-0 border-2 border-white shadow-sm ${AUDIT_DOT_COLOR[entry.action] ?? 'bg-slate-400'}`}>
                    <Shield className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 bg-white border border-slate-200 rounded-xl p-4 shadow-sm min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-full border text-xs font-bold uppercase tracking-wider ${AUDIT_ACTION_COLOR[entry.action] ?? 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                        {entry.action}
                      </span>
                      <span className="text-xs font-semibold text-slate-700">{entry.changed_by}</span>
                      <span className="text-xs text-slate-400 ml-auto">{formatTs(entry.timestamp)}</span>
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
