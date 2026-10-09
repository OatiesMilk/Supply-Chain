import { useEffect, useId, useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { returnToDraftConsequences } from '@/utils/recordLifecycle';
import type { DeliveryRecord } from '@/types';

interface ReturnToDraftDialogProps {
  record: Pick<DeliveryRecord, 'driver' | 'category'>;
  open: boolean;
  onDismiss: () => void;
  /** Saves the status change; reject with an Error to keep the dialog (and the typed reason) open. */
  onSubmit: (reason: string) => Promise<void>;
}

/** One confirmation shared by every Return to Draft entry point (Overview, Admin Dispatch, Accounting Collection). */
export function ReturnToDraftDialog({ record, open, onDismiss, onSubmit }: ReturnToDraftDialogProps) {
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reasonId = useId();

  useEffect(() => { if (open) { setReason(''); setError(null); } }, [open]);

  const confirm = async () => {
    if (pending || !reason.trim()) return;
    setPending(true);
    setError(null);
    try {
      await onSubmit(reason.trim());
      onDismiss();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not return the record to Draft.');
    } finally {
      setPending(false);
    }
  };

  return (
    <ActionDialog
      open={open}
      title="Return this record to Draft?"
      description="This takes the record back out of dispatch:"
      confirmLabel="Return to Draft"
      cancelLabel="Keep as is"
      confirmDisabled={!reason.trim()}
      dismissOnBackdrop
      pending={pending}
      error={error}
      onConfirm={confirm}
      onDismiss={onDismiss}
    >
      <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">
        {returnToDraftConsequences(record).map(line => <li key={line}>{line}</li>)}
      </ul>
      <div className="space-y-1.5">
        <label htmlFor={reasonId} className="block text-sm font-semibold text-slate-800">Reason (required)</label>
        <textarea
          id={reasonId}
          autoFocus
          rows={3}
          value={reason}
          disabled={pending}
          onChange={e => setReason(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]"
          placeholder="Why is this record going back to Draft?"
        />
        <p className="text-xs text-slate-500">The reason is saved with your name in Remarks History.</p>
      </div>
    </ActionDialog>
  );
}
