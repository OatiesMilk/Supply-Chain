import { useEffect, useRef } from 'react';
import type { ApiMasterDataAdditionRequest, MasterDataRequestStatus } from '@/api';

export type StatusTab = MasterDataRequestStatus | 'ALL';
export const STATUS_LABELS: Record<MasterDataRequestStatus, string> = { PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected' };

export const pillClass = 'inline-flex max-w-full items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700';

export function formatManila(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function EntityBadge({ type }: { type: ApiMasterDataAdditionRequest['entity_type'] }) {
  return type === 'COMPANY'
    ? <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800">Company</span>
    : <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-800">Supplier</span>;
}

export function RequestStatusBadge({ status }: { status: MasterDataRequestStatus }) {
  const tone = status === 'PENDING' ? 'border-amber-200 bg-amber-50 text-amber-900'
    : status === 'APPROVED' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800';
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${tone}`}>{STATUS_LABELS[status]}</span>;
}

/** Filter by status tab, entity type and free-text search (name, requester, SAP numbers, contact, notes). */
export function filterRequests(rows: readonly ApiMasterDataAdditionRequest[], status: StatusTab, entity: 'ALL' | ApiMasterDataAdditionRequest['entity_type'] = 'ALL', search = '') {
  const needle = search.trim().toLowerCase();
  return rows.filter(row => (status === 'ALL' || row.status === status) && (entity === 'ALL' || row.entity_type === entity)
    && (!needle || [row.name, row.requested_by.name, ...row.sap_numbers, row.contact_person, row.contact_phone, row.email, row.notes,
      row.created_entity_name ?? '', row.rejection_reason ?? ''].some(value => value.toLowerCase().includes(needle))));
}

export function countByStatus(rows: readonly ApiMasterDataAdditionRequest[]) {
  return { PENDING: rows.filter(row => row.status === 'PENDING').length, APPROVED: rows.filter(row => row.status === 'APPROVED').length,
    REJECTED: rows.filter(row => row.status === 'REJECTED').length, ALL: rows.length } satisfies Record<StatusTab, number>;
}

export function StatusTabs({ value, onChange, counts, label = 'Filter by status' }: { value: StatusTab; onChange: (value: StatusTab) => void; counts: Record<StatusTab, number>; label?: string }) {
  const options: StatusTab[] = ['PENDING', 'APPROVED', 'REJECTED', 'ALL'];
  return (
    <div role="group" aria-label={label} className="inline-flex w-fit flex-wrap rounded-lg border border-slate-200 bg-slate-50 p-0.5">
      {options.map(option => (
        <button key={option} type="button" aria-pressed={value === option} onClick={() => onChange(option)}
          className={`rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-blue ${
            value === option ? 'bg-white text-brand-blue shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          {option === 'ALL' ? 'All' : STATUS_LABELS[option]} <span className="font-semibold text-slate-400">{counts[option]}</span>
        </button>
      ))}
    </div>
  );
}

/** Submitted details of a request (contact, address, Account Managers or categories, notes). */
export function RequestDetails({ request }: { request: ApiMasterDataAdditionRequest }) {
  const contact = [request.contact_person, request.contact_phone, request.email].filter(Boolean).join(' · ');
  const place = [request.address, request.city].filter(Boolean).join(', ');
  const choices = request.entity_type === 'COMPANY' ? request.account_managers : request.supplier_categories;
  return (
    <div className="space-y-1 text-xs text-slate-600">
      {request.sap_numbers.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label={`SAP numbers requested for ${request.name}`}>
          {request.sap_numbers.map(sap => <li key={sap} className={`${pillClass} tabular-nums`}>{sap}</li>)}
        </ul>
      )}
      {contact && <p className="break-words">{contact}</p>}
      {place && <p className="break-words">{place}</p>}
      {choices.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label={request.entity_type === 'COMPANY' ? 'Requested Account Managers' : 'Requested categories'}>
          {choices.map(choice => <li key={choice.id} className={pillClass}>{choice.name}</li>)}
        </ul>
      )}
      {request.notes && <p className="whitespace-pre-line break-words italic text-slate-500">“{request.notes}”</p>}
    </div>
  );
}

/** Outcome line: created entity, rejection reason, reviewer and time. */
export function RequestOutcome({ request }: { request: ApiMasterDataAdditionRequest }) {
  return (
    <div className="space-y-1 text-xs">
      <RequestStatusBadge status={request.status} />
      {request.status === 'APPROVED' && request.created_entity_name && <p className="font-semibold text-emerald-800">Created: {request.created_entity_name}</p>}
      {request.status === 'REJECTED' && request.rejection_reason && <p className="whitespace-pre-line break-words text-red-800">Reason: {request.rejection_reason}</p>}
      {request.review_notes && <p className="whitespace-pre-line break-words text-slate-600">Review notes: {request.review_notes}</p>}
      {request.reviewed_by && <p className="text-slate-500">{request.reviewed_by.name} · {formatManila(request.reviewed_at)}</p>}
    </div>
  );
}

/** Scroll the highlighted request into view once it is rendered. */
export function useScrollToHighlight(id: string | null | undefined, ready: boolean) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!id || !ready) return;
    const element = ref.current;
    if (element && typeof element.scrollIntoView === 'function') element.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [id, ready]);
  return ref;
}

/** Status tab counts straight from the server, so they always match the pending badge. */
export function serverStatusCounts(counts: { pending: number; approved: number; rejected: number } | undefined): Record<StatusTab, number> {
  const pending = counts?.pending ?? 0, approved = counts?.approved ?? 0, rejected = counts?.rejected ?? 0;
  return { PENDING: pending, APPROVED: approved, REJECTED: rejected, ALL: pending + approved + rejected };
}

/** The loaded page, with a notification target fetched separately pinned first (never duplicated). */
export function withPinnedTarget(rows: readonly ApiMasterDataAdditionRequest[], pinned: ApiMasterDataAdditionRequest | undefined) {
  return pinned ? [pinned, ...rows.filter(row => row.id !== pinned.id)] : [...rows];
}

export const REQUEST_PAGE_SIZES = [10, 25, 50, 100];
export const DEFAULT_REQUEST_PAGE_SIZE = 25;

export function OpenedFromNotificationPill() {
  return <span className="inline-flex rounded-full border border-brand-blue/30 bg-brand-sky px-2 py-0.5 text-xs font-semibold text-brand-navy">Opened from notification</span>;
}
export const MISSING_TARGET_NOTICE = 'The linked addition request could not be found or is no longer available.';
