import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { usePagedRecordsQuery } from '@/api/queries/useRecordsQuery';
import RecordPageControls from '@/components/RecordPageControls';
import { screenKeyForCategory } from '@/routes/screenRouting';
import type { DeliveryRecord } from '@/types';
import { recordCompletedAt } from '@/utils/dashboardFilters';
import { jobTypeLabel } from '@/utils/driverJobs';
import { recordLabel } from '@/utils/recordLabel';
import { EmptyState, PanelError, RecordTable, TileSkeleton, formatDateTime, type RecordColumn } from './ui';

const PAGE_SIZE = 25;
const columns: RecordColumn<DeliveryRecord>[] = [
  { key: 'record', header: 'Record', render: recordLabel },
  { key: 'category', header: 'Type', render: record => jobTypeLabel(record.category) },
  { key: 'company', header: 'Company', render: record => record.company_name },
  { key: 'completed', header: 'Completed (Manila time)', render: record => formatDateTime(recordCompletedAt(record)) },
];

export default function CompletedTodayDialog({ onClose, onOpenRecord, canAccess }: {
  onClose: () => void;
  onOpenRecord: (screen: string, id: string) => void;
  canAccess: (screen: string) => boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [page, setPage] = useState(1);
  const { data, isPending, isError, refetch } = usePagedRecordsQuery({
    dashboard_filter: 'log-completed-today', page, limit: PAGE_SIZE,
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);

  useEffect(() => {
    if (data) setPage(current => Math.min(current, Math.max(1, Math.ceil(data.total / PAGE_SIZE))));
  }, [data]);

  return (
    <dialog ref={dialogRef} aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); onClose(); }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-slate-950/55">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <h2 id={titleId} className="text-lg font-semibold text-slate-900">Records completed today</h2>
        <button type="button" onClick={onClose} aria-label="Close completed records"
          className="rounded-md p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-[#1F3864]">
          <X aria-hidden="true" className="h-5 w-5" />
        </button>
      </header>
      <div className="space-y-3 p-4">
        {isError ? <PanelError message="Completed records could not be loaded." onRetry={() => void refetch()} />
          : isPending ? <TileSkeleton lines={4} />
          : data.total === 0 ? <EmptyState title="No records completed today" />
          : <>
            <RecordTable rows={data.rows} columns={columns} rowKey={record => record.id} caption="Records completed today"
              canOpen={record => canAccess(screenKeyForCategory(record.category))}
              onOpen={record => onOpenRecord(screenKeyForCategory(record.category), record.id)}
              openLabel={record => `Open ${jobTypeLabel(record.category)} ${recordLabel(record)}`} />
            <RecordPageControls page={page} total={data.total} limit={PAGE_SIZE} onPageChange={setPage} collapseSinglePage />
          </>}
      </div>
    </dialog>
  );
}
