import { useEffect, useState } from 'react';
import { ClipboardList, Loader2, Plus } from 'lucide-react';
import { ActionDialog } from '@/components/ActionDialog';
import { Pagination } from '@/components/Pagination';
import { useMasterDataRequestDetailQuery, useMasterDataRequestsQuery } from '@/api/queries/useMasterDataRequestsQuery';
import {
  DEFAULT_REQUEST_PAGE_SIZE, EntityBadge, MISSING_TARGET_NOTICE, OpenedFromNotificationPill, REQUEST_PAGE_SIZES, RequestDetails, RequestOutcome, StatusTabs,
  formatManila, serverStatusCounts, useScrollToHighlight, withPinnedTarget, type StatusTab,
} from './requestDisplay';

/** TASS: every Company/Supplier addition request this user submitted, with its outcome.
 * Filtered and paged on the server; a notification target outside the page is fetched and pinned. */
export default function MyAdditionRequestsModal({ highlightedRequestId = null, onClose, onNewRequest }: {
  highlightedRequestId?: string | null;
  onClose: () => void;
  onNewRequest?: () => void;
}) {
  const [status, setStatus] = useState<StatusTab>('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_REQUEST_PAGE_SIZE);
  const query = useMasterDataRequestsQuery({ status, page, limit: pageSize });
  // When the last page empties (approve/reject, background change), fall back to the last real page.
  const serverPages = query.data?.pages;
  useEffect(() => {
    if (typeof serverPages === 'number' && serverPages >= 1 && page > serverPages) setPage(serverPages);
  }, [serverPages, page]);
  const rows = query.data?.requests ?? [];
  const inPage = highlightedRequestId ? rows.find(row => row.id === highlightedRequestId) : undefined;
  const detail = useMasterDataRequestDetailQuery(highlightedRequestId, !!highlightedRequestId && query.isSuccess && !inPage);
  // A failed refetch keeps the old cached data; never show that stale target.
  const pinned = inPage || detail.isError ? undefined : detail.data;
  const highlighted = inPage ?? pinned;
  const visible = withPinnedTarget(rows, pinned);
  const highlightRef = useScrollToHighlight(highlighted?.id, !!highlighted);
  const total = query.data?.total ?? rows.length;
  const changeStatus = (next: StatusTab) => { setStatus(next); setPage(1); };

  return (
    <ActionDialog open size="lg" icon={ClipboardList} dismissOnBackdrop title="My addition requests"
      description="Company and supplier requests you sent to an Admin. You are notified when each is approved or rejected." onDismiss={onClose}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <StatusTabs value={status} onChange={changeStatus} counts={serverStatusCounts(query.data?.counts)} />
          {onNewRequest && (
            <button type="button" onClick={onNewRequest}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <Plus aria-hidden="true" className="h-4 w-4" /> New request
            </button>
          )}
        </div>
        {detail.isError && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{MISSING_TARGET_NOTICE}</p>}
        {query.isPending ? (
          <p role="status" className="flex items-center justify-center py-8 text-sm text-slate-500"><Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> Loading requests…</p>
        ) : query.error ? (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            Could not load your requests. <button type="button" className="font-semibold underline" onClick={() => void query.refetch()}>Retry</button>
          </p>
        ) : (
          <>
            <ul aria-label="My addition requests" className="max-h-[55vh] space-y-2 overflow-y-auto">
              {visible.map(row => {
                const isHighlighted = row.id === highlighted?.id;
                return (
                  <li key={row.id} ref={isHighlighted ? element => { highlightRef.current = element; } : undefined} data-request-id={row.id}
                    aria-current={isHighlighted ? 'true' : undefined}
                    className={`rounded-lg border p-3 ${isHighlighted ? 'border-brand-blue bg-brand-sky/40 ring-2 ring-brand-blue/30' : 'border-slate-200 bg-white'}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <EntityBadge type={row.entity_type} /><span className="break-words text-sm font-bold text-slate-900">{row.name}</span>
                          {row.id === pinned?.id && <OpenedFromNotificationPill />}
                        </div>
                        <p className="text-xs text-slate-500">Sent {formatManila(row.created_at)}</p>
                      </div>
                      <RequestOutcome request={row} />
                    </div>
                    <div className="mt-2"><RequestDetails request={row} /></div>
                  </li>
                );
              })}
              {!visible.length && <li className="py-8 text-center text-sm text-slate-500">{status === 'ALL' ? 'You have not sent any addition requests yet.' : 'No requests with this status.'}</li>}
            </ul>
            {total > 0 && (
              <Pagination currentPage={Math.min(page, serverPages ?? 1)} totalPages={serverPages ?? 1} totalItems={total} pageSize={pageSize} onPageChange={setPage}
                onPageSizeChange={size => { setPageSize(size); setPage(1); }} pageSizeOptions={REQUEST_PAGE_SIZES} />
            )}
          </>
        )}
      </div>
    </ActionDialog>
  );
}
