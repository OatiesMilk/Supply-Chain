import { useId, useState } from 'react';
import { CircleCheck } from 'lucide-react';
import { ActionDialog } from '@/components/ActionDialog';
import PodUploader from '@/components/PodUploader';
import { usePodAttachments } from '@/api/queries/usePodAttachments';
import { completionLabels, completionNeeds, recordingForLine, stillNeededLine } from '@/utils/completionDialog';
import type { DeliveryCategory } from '@/types';
import { workflowFieldHintClass, workflowFieldLabelClass, workflowInputClass } from './WorkflowSection';

const field = workflowInputClass.replace('text-sm', 'text-base sm:text-sm');

export type CompletionValues = { receivedBy: string; remarks: string };

/** Completes a run: proof photo, Received by and remarks in one dialog. A rejected save keeps the dialog open with the
 *  server message and the typed values; Cancel and Escape save nothing and clear the form (staged photos stay staged). */
function MarkDeliveredForm({ open, recordId, category, company, typeLabel, reference, driver, showRecordingFor = true, rma = false, onConfirm, onClose }: {
  open: boolean;
  recordId: string;
  category: DeliveryCategory;
  company: string;
  typeLabel: string;
  reference: string;
  driver?: string | null;
  /** True when the signed-in user records the run for the driver (Logistics, Admin). */
  showRecordingFor?: boolean;
  rma?: boolean;
  /** Called after staged photos upload. Throw to keep the dialog open with the message. */
  onConfirm: (values: CompletionValues) => Promise<void>;
  onClose: (reason: 'cancel' | 'success') => void;
}) {
  const id = useId();
  const labels = completionLabels(category);
  const { readiness, uploadStaged } = usePodAttachments(recordId);
  const [receivedBy, setReceivedBy] = useState('');
  const [remarks, setRemarks] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needs = completionNeeds({ ...readiness, receivedBy, remarks });
  const description = `${company} · ${typeLabel} · Ref ${reference || '—'}${rma ? '\nThis completes the transport. TASS still confirms receipt and completes the RMA.' : ''}`;
  const confirm = async () => {
    if (needs.length || pending) return;
    setPending(true); setError(null);
    try {
      await uploadStaged(undefined);
      await onConfirm({ receivedBy: receivedBy.trim(), remarks: remarks.trim() });
      setPending(false);
      onClose('success');
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : 'Could not save. Please try again.');
      setPending(false);
    }
  };

  return <ActionDialog open={open} size="lg" icon={CircleCheck} title={labels.title} description={description}
    confirmLabel={labels.button} confirmDisabled={needs.length > 0} confirmHint={stillNeededLine(needs)}
    pending={pending} error={error} onConfirm={() => void confirm()} onDismiss={() => { if (!pending) onClose('cancel'); }}>
    <div className="space-y-4">
      {showRecordingFor && <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-[#1F3864]">{recordingForLine(driver)}</p>}
      <PodUploader recordId={recordId} required disabled={pending} purpose={rma ? 'transport' : 'delivery'} />
      <label htmlFor={`${id}-received-by`} className={workflowFieldLabelClass}>Received by <span className="text-red-600">Required</span>
        <input id={`${id}-received-by`} value={receivedBy} className={field} disabled={pending} autoComplete="off" placeholder="Who received it" onChange={event => setReceivedBy(event.target.value)} />
      </label>
      <label htmlFor={`${id}-remarks`} className={workflowFieldLabelClass}>Remarks <span className="text-red-600">Required</span>
        <textarea id={`${id}-remarks`} value={remarks} rows={3} className={`${field} resize-y`} disabled={pending} onChange={event => setRemarks(event.target.value)} />
        <span className={workflowFieldHintClass}>Saved with your name in Remarks History.</span>
      </label>
    </div>
  </ActionDialog>;
}

/** Mounted only while open, so a closed dialog adds no requests, uploader or typed state to the page. */
export default function MarkDeliveredDialog(props: React.ComponentProps<typeof MarkDeliveredForm>) {
  return props.open ? <MarkDeliveredForm {...props} /> : null;
}
