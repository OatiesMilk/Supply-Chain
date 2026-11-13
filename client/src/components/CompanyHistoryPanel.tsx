import RecordStatus from '@/components/RecordStatus';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { History, Loader2, Lock, X } from 'lucide-react';
import { DeliveryCategory, DeliveryRecord } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { usePermissions } from '@/hooks/usePermissions';
import { useCompanyRecordsQuery } from '@/api/queries/useCompanyRecordsQuery';
import { companyRecords, historyCategories, recordScreen } from '@/utils/companyHistory';
import { recordLabel } from '../utils/recordLabel';

interface CompanyHistoryPanelProps {
  open: boolean;
  companyId: string;
  companyName: string;
  /** The record the panel was opened from; shown as the current row. */
  currentRecordId?: string;
  onClose: () => void;
  onOpenRecord: (screen: string, recordId: string) => void;
}

// The rail colour is the only per-category accent, so rows stay quiet and
// the category reads at a glance down the list.
const CATEGORY_RAIL: Record<DeliveryCategory, string> = {
  'Deliveries':            'bg-blue-500',
  'RMA':                   'bg-violet-500',
  'Accounting Collection': 'bg-emerald-500',
  'Procurement Pick-up':   'bg-amber-500',
  'Sales Orders':          'bg-slate-400',
};


function RowBody({ record, note }: { record: DeliveryRecord; note?: string }) {
  return (
    <>
      <span aria-hidden="true" className={`w-1 shrink-0 self-stretch rounded-full ${CATEGORY_RAIL[record.category] ?? 'bg-slate-300'}`} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-3">
          <span className="font-mono text-sm font-bold text-slate-900">{recordLabel(record)}</span>
          <RecordStatus record={record} />
        </span>
        <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
          <span className="font-semibold text-slate-700">{record.category}</span>
          {record.reference && <span>Ref {record.reference}</span>}
          {record.delivery_date && <span>{record.delivery_date}</span>}
        </span>
        {note && (
          <span className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-slate-500">
            {note === 'No access to this module' && <Lock aria-hidden="true" className="h-3 w-3" />}
            {note}
          </span>
        )}
      </span>
    </>
  );
}

interface CompanyHistoryButtonProps {
  companyId: string;
  companyName: string;
  currentRecordId?: string;
  disabled?: boolean;
  className?: string;
  /** Called after the drawer closes; wrap it in any unsaved-changes guard. */
  onOpenRecord: (screen: string, recordId: string) => void;
}

/** Renders a company name that opens its history drawer. */
export function CompanyHistoryButton({
  companyId, companyName, currentRecordId, disabled, className = '', onOpenRecord,
}: CompanyHistoryButtonProps) {
  const [open, setOpen] = useState(false);
  if (!companyId) return <span className={className}>{companyName}</span>;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-haspopup="dialog"
        title="View company history"
        className={`inline-flex items-center gap-1 rounded text-left underline decoration-slate-300 decoration-dotted underline-offset-4 transition-colors hover:text-[#0078C1] hover:decoration-[#0078C1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:no-underline ${className}`}
      >
        {companyName}
        <History aria-hidden="true" className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </button>
      {/* Portalled so the dialog never nests inside inline or paragraph markup. */}
      {createPortal(
        <CompanyHistoryPanel
          open={open}
          companyId={companyId}
          companyName={companyName}
          currentRecordId={currentRecordId}
          onClose={() => setOpen(false)}
          onOpenRecord={(screen, recordId) => { setOpen(false); onOpenRecord(screen, recordId); }}
        />,
        document.body,
      )}
    </>
  );
}

/**
 * Side drawer listing every record that belongs to one Company and that the
 * signed-in user is allowed to see. The server applies the role scope; rows
 * link to their own module only when the user can open that module.
 */
export default function CompanyHistoryPanel({
  open, companyId, companyName, currentRecordId, onClose, onOpenRecord,
}: CompanyHistoryPanelProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const authUser = useAuthStore(s => s.authUser);
  const { canAccess } = usePermissions(authUser);
  const [category, setCategory] = useState<DeliveryCategory | 'All'>('All');

  const query = useCompanyRecordsQuery(companyId, category, open);
  const records = companyRecords(query.data?.pages.flat() ?? [], companyId);
  const categories = historyCategories(canAccess);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    return () => { if (dialog.open) dialog.close(); };
  }, [open]);

  useEffect(() => { setCategory('All'); }, [companyId]);

  const emptyMessage = category === 'All'
    ? 'No records for this company yet.'
    : `No ${category} records for this company.`;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
      className="company-history-drawer fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-full max-w-md overflow-hidden border-l border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/40"
    >
      <div className="flex h-full flex-col">
        <header className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
          <span aria-hidden="true" className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1F3864] text-white">
            <History className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-base font-bold leading-6 text-[#1F3864]">{companyName || 'Company'}</h2>
            <p id={descriptionId} className="text-xs leading-5 text-slate-500">Company history, newest first. Only records you have access to are shown.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close company history"
            className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </header>

        {categories.length > 1 && (
          <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-1.5 border-b border-slate-100 px-5 py-3">
            {(['All', ...categories] as const).map(option => (
              <button
                key={option}
                type="button"
                aria-pressed={category === option}
                onClick={() => setCategory(option)}
                className={`shrink-0 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${
                  category === option
                    ? 'border-[#0078C1] bg-[#0078C1] text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-[#0078C1] hover:text-[#0078C1]'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-3 py-3" aria-busy={query.isPending}>
          {query.isPending ? (
            <ul aria-label="Loading records" className="space-y-2">
              {[0, 1, 2].map(i => (
                <li key={i} className="flex gap-3 rounded-xl border border-slate-100 p-3">
                  <span className="w-1 self-stretch rounded-full bg-slate-200" />
                  <span className="flex-1 space-y-2">
                    <span className="block h-3.5 w-24 animate-pulse rounded bg-slate-200" />
                    <span className="block h-3 w-40 animate-pulse rounded bg-slate-100" />
                  </span>
                </li>
              ))}
            </ul>
          ) : query.isError ? (
            <div role="alert" className="mx-2 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <p>Company history could not be loaded. {query.error.message}</p>
              <button type="button" onClick={() => query.refetch()} className="mt-2 font-semibold underline underline-offset-2 hover:text-red-900">
                Try again
              </button>
            </div>
          ) : records.length === 0 ? (
            <p className="px-4 py-16 text-center text-sm text-slate-500">{emptyMessage}</p>
          ) : (
            <ul className="space-y-2">
              {records.map(record => {
                const screen = recordScreen(record, canAccess);
                const isCurrent = record.id === currentRecordId;
                const rowClass = 'flex w-full gap-3 rounded-xl border p-3 text-left';
                return (
                  <li key={record.id}>
                    {isCurrent ? (
                      <div aria-current="true" className={`${rowClass} border-[#0078C1]/40 bg-blue-50/60`}>
                        <RowBody record={record} note="You are viewing this record" />
                      </div>
                    ) : screen ? (
                      <button
                        type="button"
                        onClick={() => onOpenRecord(screen, record.id)}
                        className={`${rowClass} history-row border-slate-200 bg-white hover:border-[#0078C1]/50 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700`}
                      >
                        <RowBody record={record} />
                      </button>
                    ) : (
                      <div className={`${rowClass} border-slate-200 bg-slate-50/60`}>
                        <RowBody record={record} note="No access to this module" />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {!query.isPending && !query.isError && records.length > 0 && (
          <footer className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 text-xs text-slate-500">
            <span>{records.length} {records.length === 1 ? 'record' : 'records'}{query.hasNextPage ? ' loaded' : ''}</span>
            {query.hasNextPage && (
              <button
                type="button"
                onClick={() => query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
              >
                {query.isFetchingNextPage && <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />}
                {query.isFetchingNextPage ? 'Loading...' : 'Load more'}
              </button>
            )}
          </footer>
        )}
      </div>
    </dialog>
  );
}
