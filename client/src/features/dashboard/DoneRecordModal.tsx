import { X, Clock, UserCheck, FileText } from 'lucide-react';
import { DeliveryRecord } from '@/types';
import { usePodAttachments } from '@/api/queries/usePodAttachments';

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSize(bytes: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DoneRecordModal({
  record,
  onClose,
}: {
  record: DeliveryRecord;
  onClose: () => void;
}) {
  const { files, readiness } = usePodAttachments(record.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[90dvh] w-full max-w-lg space-y-6 overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Accomplished Run Details</h2>
            <p className="mt-1 font-mono text-xs text-slate-500">{record.reference} · {record.company_name}</p>
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
          <div>
            <h3 className="font-bold text-slate-900 mb-1">Status & Timestamps</h3>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
              <p className="font-bold">Accomplished on {new Date(record.delivery_date).toLocaleDateString()}</p>
              <div className="mt-2 flex flex-col gap-1 text-xs">
                {record.time_in && (
                  <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" /> Time in: {fmtTime(record.time_in)}</span>
                )}
                {record.time_out && (
                  <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" /> Time out: {fmtTime(record.time_out)}</span>
                )}
                {record.received_by && (
                  <span className="flex items-center gap-1.5"><UserCheck className="h-4 w-4" /> Received by: {record.received_by}</span>
                )}
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
            <h3 className="font-bold text-slate-900 mb-2">Proof of Delivery (POD)</h3>
            {readiness.loading ? (
              <p className="text-xs text-slate-500">Loading attachments...</p>
            ) : readiness.loadFailed ? (
              <p className="text-xs text-red-600">Could not load attachments.</p>
            ) : files.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-100">
                {files.map(f => (
                  <div key={f.id} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50">
                    <span className="shrink-0 text-lg">{f.mime_type?.startsWith('image/') ? '🖼️' : '📄'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-slate-800">{f.name}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-slate-400">
                        {f.size ? formatSize(f.size) + ' · ' : ''}
                        {new Date(f.uploaded_at).toLocaleString()}
                      </p>
                    </div>
                    <a
                      href={f.download_url}
                      download={f.name}
                      title="Download"
                      className="rounded p-1.5 text-slate-400 hover:bg-slate-200 hover:text-blue-600"
                    >
                      <FileText className="h-4 w-4" />
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">No attachments found.</p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
