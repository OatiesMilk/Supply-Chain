import { X, Clock, UserCheck } from 'lucide-react';
import { DeliveryRecord } from '@/types';
import { usePodAttachments } from '@/api/queries/usePodAttachments';
import { PodAttachmentList } from '@/components/PodAttachmentPreview';
import { formatManilaTime, formatManilaTimestamp } from '@/utils/manilaTimestamp';
import { recordLabel as recordNumber } from '../../utils/recordLabel';

export default function DoneRecordModal({
  record,
  onClose,
}: {
  record: DeliveryRecord;
  onClose: () => void;
}) {
  const { files, readiness } = usePodAttachments(record.id);
  const isRma = record.category === 'RMA';
  const isRmaTransportHandoff = isRma && record.status !== 'Delivered' && record.rma_transport_status === 'COMPLETED';
  const waitingForTassReceipt = isRmaTransportHandoff && !record.rma_received_at;
  const completedAt = formatManilaTimestamp(isRmaTransportHandoff
    ? record.rma_transport_completed_at ?? record.rma_completed_at
    : isRma ? record.rma_completed_at : record.time_out);
  const completedLabel = isRmaTransportHandoff ? 'Transport completed on' : isRma ? 'RMA completed on' : 'Accomplished on';
  const recordLabel = isRma ? record.rma_reference || record.reference || recordNumber(record) : record.reference;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="accomplished-run-details-title"
        className="max-h-[90dvh] w-full max-w-lg space-y-6 overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 id="accomplished-run-details-title" className="text-lg font-bold text-slate-900">Accomplished {isRmaTransportHandoff ? 'RMA Transport' : isRma ? 'RMA' : 'Run'} Details</h2>
            <p className="mt-1 font-mono text-xs text-slate-500">{recordLabel} · {record.company_name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 text-sm text-slate-700">
          {isRmaTransportHandoff && <p role="status" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-blue-900">
            {waitingForTassReceipt ? 'Driver transport is complete; awaiting TASS physical receipt.' : 'Physical receipt is confirmed; awaiting final TASS RMA completion.'}
          </p>}
          <div>
            <h3 className="font-bold text-slate-900 mb-1">{isRma ? 'RMA status & timestamps' : 'Status & Timestamps'}</h3>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
              <p className="font-bold">{completedAt === '—' ? 'Completion date unavailable' : `${completedLabel} ${completedAt}`}</p>
              <div className="mt-2 flex flex-col gap-1 text-xs">
                {isRma ? <>
                  {record.rma_transport_started_at && <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" /> Transport started: {formatManilaTime(record.rma_transport_started_at)}</span>}
                  {record.rma_transport_completed_at && <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" /> Transport completed: {formatManilaTime(record.rma_transport_completed_at)}</span>}
                  {record.rma_received_at && <span className="flex items-center gap-1.5"><UserCheck className="h-4 w-4" /> Physical receipt: {formatManilaTime(record.rma_received_at)}{record.rma_recipient ? ` · ${record.rma_recipient}` : ''}</span>}
                </> : <>
                  {record.time_in && <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" /> Time in: {formatManilaTime(record.time_in)}</span>}
                  {record.time_out && <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" /> Time out: {formatManilaTime(record.time_out)}</span>}
                  {record.received_by && <span className="flex items-center gap-1.5"><UserCheck className="h-4 w-4" /> Received by: {record.received_by}</span>}
                </>}
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-bold text-slate-900 mb-1">Remarks</h3>
            <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-600">
              {record.remarks || <span className="italic text-slate-400">No remarks provided.</span>}
            </p>
          </div>

          <div>
            <h3 className="font-bold text-slate-900 mb-2">{isRma ? 'Return transport proof (POD)' : 'Proof of Delivery (POD)'}</h3>
            {readiness.loading ? (
              <p className="text-xs text-slate-500">Loading attachments...</p>
            ) : readiness.loadFailed ? (
              <p className="text-xs text-red-600">Could not load attachments.</p>
            ) : files.length > 0 ? (
              <PodAttachmentList files={files} />
            ) : (
              <p className="text-xs text-slate-500 italic">No attachments found.</p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
