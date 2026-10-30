import type { DeliveryRecord } from '@/types';
import StatusStepper from './StatusStepper';
import { RMA_TRANSPORT_LABELS } from '@/utils/rmaTransport';

type StatusRecord = Pick<DeliveryRecord, 'category' | 'status' | 'is_draft' | 'rma_movement' | 'rma_transport_status' | 'rma_received_at'>;
const tones: Record<string, string> = {
  Draft: 'bg-slate-100 text-slate-700 border-slate-300',
  Scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  'In Transit': 'bg-cyan-50 text-cyan-700 border-cyan-200',
  Delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Complete: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Pending: 'bg-amber-50 text-amber-700 border-amber-200',
  'On-Hold': 'bg-red-50 text-red-700 border-red-200',
  Rescheduled: 'bg-purple-50 text-purple-700 border-purple-200',
};
function Badge({ label, tone }: { label: string; tone: string }) {
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tones[tone] ?? tones.Draft}`}>{label}</span>;
}

/** RMA transport progress and final completion are separate saved states. */
export default function RecordStatus({ record }: { record: StatusRecord }) {
  const draft = record.is_draft === 'Yes' || record.status === 'Draft';
  if (record.category !== 'RMA') return <Badge label={record.status} tone={record.status} />;
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
