import type { DeliveryRecord } from '@/types';
import StatusStepper from './StatusStepper';
import { RMA_TRANSPORT_LABELS } from '@/utils/rmaTransport';
import { statusBadgeClass } from '@/utils/statusTheme';

type StatusRecord = Pick<DeliveryRecord, 'category' | 'status' | 'is_draft' | 'rma_movement' | 'rma_transport_status' | 'rma_received_at'>;

function Badge({ label, tone }: { label: string; tone: string }) {
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(tone)}`}>{label}</span>;
}

/** RMA transport progress and final completion are separate saved states. */
export default function RecordStatus({ record, compact = false }: { record: StatusRecord; compact?: boolean }) {
  const draft = record.is_draft === 'Yes' || record.status === 'Draft';
  if (record.category !== 'RMA') return <Badge label={record.status === 'Delivered' ? 'Complete' : record.status} tone={record.status === 'Delivered' ? 'Complete' : record.status} />;
  if (compact) {
    const status = draft ? 'Draft' : record.status === 'Delivered' ? 'Complete'
      : record.rma_received_at ? 'Received'
      : ['On-Hold', 'Rescheduled'].includes(record.status) ? record.status
      : record.rma_movement === 'LOGISTICS_TRANSPORT' && record.rma_transport_status === 'COMPLETED' ? 'Transport Complete'
      : record.rma_movement === 'LOGISTICS_TRANSPORT' && record.rma_transport_status === 'IN_TRANSIT' ? 'In Transit'
      : record.status;
    return <Badge label={status} tone={status === 'Transport Complete' || status === 'Received' ? 'Complete' : status} />;
  }
  const transport = !draft && record.rma_movement === 'LOGISTICS_TRANSPORT' && record.rma_transport_status
    ? RMA_TRANSPORT_LABELS[record.rma_transport_status] : null;
  return <span className="inline-flex flex-wrap items-center gap-1" aria-label="RMA status">
    {transport && <Badge label={`Transport: ${transport}`} tone={transport} />}
    {record.rma_received_at && <Badge label="Receipt: Confirmed" tone="Complete" />}
    <Badge label={`RMA: ${draft ? 'Draft' : record.status === 'Delivered' ? 'Complete' : record.status}`} tone={draft ? 'Draft' : record.status} />
  </span>;
}

export function RecordStatusProgress({ record }: { record: StatusRecord }) {
  if (record.category !== 'RMA') return <StatusStepper status={record.status} />;
  const submitted = record.is_draft !== 'Yes' && record.status !== 'Draft';
  const transportDone = record.rma_movement !== 'LOGISTICS_TRANSPORT' || record.rma_transport_status === 'COMPLETED';
  const awaiting = submitted && record.status !== 'Delivered'
    ? record.rma_received_at ? 'Awaiting final RMA completion by TASS.'
      : record.rma_movement && transportDone ? 'Awaiting physical receipt confirmation by TASS.' : null
    : null;
  return <div className="space-y-2"><RecordStatus record={record} />{awaiting && <p className="text-xs text-slate-600">{awaiting}</p>}</div>;
}
