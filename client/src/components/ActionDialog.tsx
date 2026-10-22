import { useEffect, useId, useRef, type ReactNode } from 'react';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { Button, ErrorState } from './ui';

interface ActionDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
  /** Close when the backdrop is clicked (off by default so existing dialogs keep their behaviour). */
  dismissOnBackdrop?: boolean;
  /** Extra content (e.g. an input) shown between the description and the buttons. */
  children?: ReactNode;
  destructive?: boolean;
  pending?: boolean;
  error?: string | null;
  onConfirm?: () => void;
  onDismiss: () => void;
}

/** A styled native modal: the browser keeps the page inert and focus inside it. */
export function ActionDialog({
  open, title, description, confirmLabel = 'Confirm', cancelLabel = 'Cancel', confirmDisabled = false, dismissOnBackdrop = false, children, destructive = false,
  pending = false, error, onConfirm, onDismiss,
}: ActionDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    return () => { if (dialog.open) dialog.close(); };
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={event => { event.preventDefault(); if (!pending) onDismiss(); }}
      onClick={event => { if (dismissOnBackdrop && event.target === event.currentTarget && !pending) onDismiss(); }}
      className="mg-dialog"
    >
      <div className="space-y-5 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${destructive ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`} aria-hidden="true">
            {destructive || !onConfirm ? <AlertTriangle className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold leading-6">{title}</h2>
            <p id={descriptionId} className="mt-1 whitespace-pre-line break-words text-sm leading-6 text-slate-600">{description}</p>
          </div>
        </div>

        {children}

        {error && <ErrorState>{error}</ErrorState>}

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          {onConfirm && (
            <Button type="button" variant="secondary" disabled={pending} onClick={onDismiss}>
              {cancelLabel}
            </Button>
          )}
          <Button type="button" variant={destructive ? 'danger' : 'primary'} loading={pending} disabled={pending || (!!onConfirm && confirmDisabled)} onClick={onConfirm ?? onDismiss}>
            {pending ? 'Working...' : onConfirm ? confirmLabel : 'Close'}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
