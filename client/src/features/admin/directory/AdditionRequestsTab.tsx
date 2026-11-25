import { useEffect, useId, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Search, XCircle } from 'lucide-react';
import type { ApiMasterDataAdditionRequest, ApproveMasterDataRequestInput, MasterDataEntityType } from '@/api';
import { ActionDialog } from '@/components/ActionDialog';
import { Pagination } from '@/components/Pagination';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthStore } from '@/store/authStore';
import { useMasterDataRequestDetailQuery, useMasterDataRequestMutations, useMasterDataRequestsQuery } from '@/api/queries/useMasterDataRequestsQuery';
import { RequestFieldsEditor } from '@/features/masterDataRequests/MasterDataAdditionRequestDialog';
import { entityLabel, requestFields, requestFormErrors, reviewForm, serverFieldErrors, type RequestForm } from '@/features/masterDataRequests/requestForm';
import {
  DEFAULT_REQUEST_PAGE_SIZE, EntityBadge, MISSING_TARGET_NOTICE, OpenedFromNotificationPill, REQUEST_PAGE_SIZES, RequestDetails, RequestOutcome, StatusTabs,
  formatManila, serverStatusCounts, useScrollToHighlight, withPinnedTarget, type StatusTab,
} from '@/features/masterDataRequests/requestDisplay';
import { Field, TableShell, describedBy, inputClass } from './DirectoryParts';

/** Same rules as permissionRuntime.ts and the server's approve/reject guards. */
export function useAdditionRequestReviewAccess() {
  const role = useAuthStore(state => state.authUser?.role);
  const access = usePermissions();
  const canReview = role === 'ADMIN' && access.canWrite('admin') && access.canResource('admin', 'WRITE');
  return {
    canRead: role === 'ADMIN' && access.canResource('admin', 'READ'),
    canReject: canReview,
    canApprove: (type: MasterDataEntityType) => canReview && (type === 'COMPANY'
      ? access.canResource('companies', 'CREATE') : access.canWrite('suppliers') && access.canResource('suppliers', 'CREATE')),
  };
}

/** Only the fields the Admin changed, so untouched values keep their submitted form (one-click approval). */
export function approvalChanges(request: ApiMasterDataAdditionRequest, form: RequestForm) {
  const before: Record<string, unknown> = { ...requestFields(reviewForm(request)) };
  const after: Record<string, unknown> = { ...requestFields(form) };
  const same = (a: unknown, b: unknown) => JSON.stringify(Array.isArray(a) ? [...a].sort() : a) === JSON.stringify(Array.isArray(b) ? [...b].sort() : b);
  return Object.fromEntries(Object.entries(after).filter(([key, value]) => key === 'sap_numbers'
    ? JSON.stringify(value) !== JSON.stringify(before[key]) : !same(value, before[key])));
}

const actionClass = 'rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-blue';

/** Search text is sent to the server once typing pauses. */
export const SEARCH_DEBOUNCE_MS = 250;

/** ADMIN review queue for TASS Company/Supplier addition requests (Feature 4b). Filtered, searched and
 * paged on the server; tab counts are the server's, so they always match the pending badge. */
export default function AdditionRequestsTab({ highlightedRequestId = null, onAuditAffected }: { highlightedRequestId?: string | null; onAuditAffected?: () => void }) {
  const review = useAdditionRequestReviewAccess();
  const [status, setStatus] = useState<StatusTab>('PENDING');
  const [entity, setEntity] = useState<'ALL' | MasterDataEntityType>('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_REQUEST_PAGE_SIZE);
  const [approving, setApproving] = useState<ApiMasterDataAdditionRequest | null>(null);
  const [rejecting, setRejecting] = useState<ApiMasterDataAdditionRequest | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const next = searchInput.trim();
    // Only a real change of search text resets paging (not the initial mount or whitespace edits).
    if (next === search) return;
    const timer = setTimeout(() => { setSearch(next); setPage(1); }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput, search]);
  const query = useMasterDataRequestsQuery({ status, entity_type: entity, search: search || undefined, page, limit: pageSize }, review.canRead);
  // When the last page empties (approve/reject, background change), fall back to the last real page.
  const serverPages = query.data?.pages;
  useEffect(() => {
    if (typeof serverPages === 'number' && serverPages >= 1 && page > serverPages) setPage(serverPages);
  }, [serverPages, page]);
  const rows = useMemo(() => query.data?.requests ?? [], [query.data]);
  // A notification target on another page or tab is fetched by id and pinned to the top.
  const inPage = highlightedRequestId ? rows.find(row => row.id === highlightedRequestId) : undefined;
  const detail = useMasterDataRequestDetailQuery(highlightedRequestId, review.canRead && !!highlightedRequestId && query.isSuccess && !inPage);
  // A failed refetch keeps the old cached data; never show that stale target.
  const pinned = inPage || detail.isError ? undefined : detail.data;
  const highlighted = inPage ?? pinned;
  const visible = withPinnedTarget(rows, pinned);
  const highlightRef = useScrollToHighlight(highlighted?.id, !!highlighted);
  const counts = serverStatusCounts(query.data?.counts);
  const total = query.data?.total ?? rows.length;

  return (
    <section aria-labelledby="addition-requests-heading" className="space-y-4">
      <div>
        <h2 id="addition-requests-heading" className="text-sm font-bold text-slate-900">Addition Requests</h2>
        <p className="text-xs text-slate-500">Companies and suppliers TASS asked to add. Approving creates the directory entry with the submitted details, which you can adjust first.</p>
      </div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <StatusTabs value={status} onChange={next => { setStatus(next); setPage(1); }} counts={counts} />
        <label className="text-xs font-semibold text-slate-700">Type
          <select value={entity} onChange={event => { setEntity(event.target.value as typeof entity); setPage(1); }}
            className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/25">
            <option value="ALL">All</option><option value="COMPANY">Company</option><option value="SUPPLIER">Supplier</option>
          </select>
        </label>
        <label className="relative block w-full lg:max-w-xs">
          <span className="sr-only">Search addition requests</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input type="search" value={searchInput} maxLength={200} onChange={event => setSearchInput(event.target.value)} placeholder="Search requests" className={`${inputClass} pl-9`} />
        </label>
      </div>
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">{notice}</p>}
      {detail.isError && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{MISSING_TARGET_NOTICE}</p>}
      {query.isPending ? (
        <p role="status" className="flex items-center justify-center py-12 text-sm text-slate-500"><Loader2 aria-hidden="true" className="mr-2 h-5 w-5 animate-spin" /> Loading requests…</p>
      ) : query.error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Could not load addition requests. <button type="button" className="font-semibold underline" onClick={() => void query.refetch()}>Retry</button>
        </p>
      ) : (
        <>
          <TableShell label="Addition requests" columns={['Request', 'Details', 'Requested by', 'Status', 'Actions']}
            empty={visible.length ? null : counts.ALL ? 'No requests match these filters.' : 'No addition requests yet.'}>
            {visible.map(row => {
              const isHighlighted = row.id === highlighted?.id;
              return (
                <tr key={row.id} ref={isHighlighted ? element => { highlightRef.current = element; } : undefined} data-request-id={row.id}
                  aria-current={isHighlighted ? 'true' : undefined} className={isHighlighted ? 'bg-brand-sky/40 outline outline-2 -outline-offset-2 outline-brand-blue' : 'hover:bg-slate-50'}>
                  <td className="max-w-[16rem] px-4 py-3 align-top">
                    <div className="flex flex-wrap items-center gap-1.5"><EntityBadge type={row.entity_type} />{row.id === pinned?.id && <OpenedFromNotificationPill />}</div>
                    <span className="mt-1 block break-words font-bold text-slate-900">{row.name}</span>
                  </td>
                  <td className="max-w-[20rem] px-4 py-3 align-top"><RequestDetails request={row} /></td>
                  <td className="px-4 py-3 align-top text-slate-700">
                    <span className="block font-semibold">{row.requested_by.name}</span>
                    <span className="block text-slate-500">{formatManila(row.created_at)}</span>
                  </td>
                  <td className="max-w-[16rem] px-4 py-3 align-top"><RequestOutcome request={row} /></td>
                  <td className="px-4 py-3 align-top">
                    {row.status === 'PENDING' && (
                      <div className="flex justify-end gap-1.5">
                        {review.canApprove(row.entity_type) && (
                          <button type="button" aria-label={`Approve and create ${row.name}`} onClick={() => { setNotice(null); setApproving(row); }}
                            className={`${actionClass} border-brand-blue bg-brand-navy text-white hover:bg-brand-blue`}>Approve &amp; Create</button>
                        )}
                        {review.canReject && (
                          <button type="button" aria-label={`Reject ${row.name}`} onClick={() => { setNotice(null); setRejecting(row); }}
                            className={`${actionClass} border-red-200 bg-white text-red-700 hover:bg-red-50`}>Reject</button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </TableShell>
          {total > 0 && (
            <Pagination currentPage={Math.min(page, serverPages ?? 1)} totalPages={serverPages ?? 1} totalItems={total} pageSize={pageSize} onPageChange={setPage}
              onPageSizeChange={size => { setPageSize(size); setPage(1); }} pageSizeOptions={REQUEST_PAGE_SIZES} />
          )}
        </>
      )}
      {approving && <ApproveRequestDialog request={approving} onAuditAffected={onAuditAffected}
        onClose={created => { setApproving(null); if (created) setNotice(`${created} was added to the directory.`); }} />}
      {rejecting && <RejectRequestDialog request={rejecting} onAuditAffected={onAuditAffected}
        onClose={rejected => { setRejecting(null); if (rejected) setNotice(`Request for ${rejected} was rejected.`); }} />}
    </section>
  );
}

export function ApproveRequestDialog({ request, onClose, onAuditAffected }: { request: ApiMasterDataAdditionRequest; onClose: (created?: string) => void; onAuditAffected?: () => void }) {
  const notesId = useId();
  const { approve } = useMasterDataRequestMutations({ onAuditAffected });
  const [form, setForm] = useState<RequestForm>(() => reviewForm(request));
  const [reviewNotes, setReviewNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const label = entityLabel(request.entity_type);
  const retained = request.entity_type === 'COMPANY' ? request.account_managers.map(am => am.id) : request.supplier_categories.map(category => category.id);

  async function confirm() {
    const found = requestFormErrors(form);
    if (reviewNotes.trim().length > 1000) found.review_notes = 'Review notes must be at most 1000 characters';
    setErrors(found); setServerError(null);
    if (Object.keys(found).length) return;
    const data: ApproveMasterDataRequestInput = { expected_version: request.version, entity_type: request.entity_type, ...approvalChanges(request, form),
      ...(reviewNotes.trim() ? { review_notes: reviewNotes.trim() } : {}) };
    try {
      const result = await approve.mutateAsync({ id: request.id, ...data });
      onClose(result.created_company?.name ?? result.created_supplier?.name ?? result.request.created_entity_name ?? request.name);
    } catch (error) {
      const mapped = serverFieldErrors(error);
      setErrors(mapped.fields);
      setServerError(mapped.message && /already been|another session/.test(mapped.message)
        ? `${mapped.message} Close this window to see the current queue.` : mapped.message);
    }
  }

  return (
    <ActionDialog open size="lg" icon={CheckCircle2} pending={approve.isPending} error={serverError}
      title={`Approve ${label.toLowerCase()} request`}
      description={`Requested by ${request.requested_by.name} on ${formatManila(request.created_at)}. Confirm to create the ${label.toLowerCase()} as shown, or adjust the details first.`}
      confirmLabel="Confirm Approve & Create" onConfirm={() => void confirm()} onDismiss={() => onClose()}>
      <div className="space-y-4">
        {request.notes && <p className="whitespace-pre-line break-words rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"><span className="font-bold">Requester notes:</span> {request.notes}</p>}
        <RequestFieldsEditor form={form} setForm={setForm} errors={errors} setErrors={setErrors} showNotes={false} retainedIds={retained} />
        <Field id={notesId} label="Review notes" error={errors.review_notes} hint="Optional; shown on the request.">
          <textarea id={notesId} value={reviewNotes} maxLength={1000} rows={2} className={inputClass} onChange={event => setReviewNotes(event.target.value)}
            {...describedBy(notesId, errors.review_notes, 'hint')} />
        </Field>
      </div>
    </ActionDialog>
  );
}

export function RejectRequestDialog({ request, onClose, onAuditAffected }: { request: ApiMasterDataAdditionRequest; onClose: (rejected?: string) => void; onAuditAffected?: () => void }) {
  const reasonId = useId();
  const { reject } = useMasterDataRequestMutations({ onAuditAffected });
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  async function confirm() {
    const trimmed = reason.trim();
    if (trimmed.length < 3 || trimmed.length > 1000) { setError('Enter a rejection reason of 3 to 1000 characters.'); return; }
    setError(null); setServerError(null);
    try {
      await reject.mutateAsync({ id: request.id, expected_version: request.version, rejection_reason: trimmed });
      onClose(request.name);
    } catch (failure) { setServerError(failure instanceof Error ? failure.message : 'Could not reject the request. Try again.'); }
  }

  return (
    <ActionDialog open destructive icon={XCircle} pending={reject.isPending} error={serverError}
      title={`Reject request for ${request.name}?`}
      description={`${request.requested_by.name} is notified with your reason. Nothing is added to the directory.`}
      confirmLabel="Reject request" onConfirm={() => void confirm()} onDismiss={() => onClose()}>
      <Field id={reasonId} label="Rejection reason" required error={error ?? undefined}>
        <textarea id={reasonId} value={reason} maxLength={1000} rows={3} className={inputClass} onChange={event => { setReason(event.target.value); setError(null); }}
          {...describedBy(reasonId, error ?? undefined)} />
      </Field>
    </ActionDialog>
  );
}
