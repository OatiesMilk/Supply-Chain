import { useId, useState } from 'react';
import { Truck } from 'lucide-react';
import { ActionDialog } from '@/components/ActionDialog';
import { START_LABEL, recordingForLine } from '@/utils/completionDialog';
import { workflowFieldHintClass, workflowFieldLabelClass, workflowInputClass } from './WorkflowSection';

const field = workflowInputClass.replace('text-sm', 'text-base sm:text-sm');

/** Starts a run: remarks only. A rejected save keeps the dialog open with the server message and the typed remarks. */
function StartTransportForm({ open, company, typeLabel, reference, driver, showRecordingFor = true, timeInNote = true, onConfirm, onClose }: {
  open: boolean;
  company: string;
  typeLabel: string;
  reference: string;
  driver?: string | null;
  showRecordingFor?: boolean;
  /** Says that Time In is recorded on confirm (not used for RMA, which has no Time In). */
  timeInNote?: boolean;
  onConfirm: (remarks: string) => Promise<void>;
  onClose: (reason: 'cancel' | 'success') => void;
}) {
  const id = useId();
  const [remarks, setRemarks] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const missing = !remarks.trim();
  const confirm = async () => {
    if (missing || pending) return;
    setPending(true); setError(null);
    try {
      await onConfirm(remarks.trim());
      setPending(false);
      onClose('success');
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : 'Could not save. Please try again.');
      setPending(false);
    }
  };
  return <ActionDialog open={open} size="lg" icon={Truck} title={START_LABEL} description={`${company} · ${typeLabel} · Ref ${reference || '—'}`}
    confirmLabel={START_LABEL} confirmDisabled={missing} confirmHint={missing ? 'Still needed: remarks' : 'Everything is ready.'}
    pending={pending} error={error} onConfirm={() => void confirm()} onDismiss={() => { if (!pending) onClose('cancel'); }}>
    <div className="space-y-4">
      {showRecordingFor && <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-[#1F3864]">{recordingForLine(driver)}</p>}
      {timeInNote && <p className="text-sm text-slate-600">Time In is recorded when you confirm.</p>}
      <label htmlFor={`${id}-remarks`} className={workflowFieldLabelClass}>Remarks <span className="text-red-600">Required</span>
        <textarea id={`${id}-remarks`} value={remarks} rows={3} className={`${field} resize-y`} disabled={pending} onChange={event => setRemarks(event.target.value)} />
        <span className={workflowFieldHintClass}>Saved with your name in Remarks History.</span>
      </label>
    </div>
  </ActionDialog>;
}

export default function StartTransportDialog(props: React.ComponentProps<typeof StartTransportForm>) {
  return props.open ? <StartTransportForm {...props} /> : null;
}
