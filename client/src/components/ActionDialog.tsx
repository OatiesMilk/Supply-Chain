import { useEffect, useId, useRef, type ReactNode } from 'react';
import { AlertCircle, AlertTriangle, Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

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
  /** Dialog width: `md` (default) or `lg` for forms with several fields. */
  size?: 'md' | 'lg';
  /** Header icon; defaults to the alert icon (or the warning icon for destructive and info dialogs). */
  icon?: LucideIcon;
  /** Text above the buttons, linked to Confirm with aria-describedby and announced politely. */
  confirmHint?: string;
}

/** A styled native modal: the browser keeps the page inert and focus inside it. */
export function ActionDialog({
  open, title, description, confirmLabel = 'Confirm', cancelLabel = 'Cancel', confirmDisabled = false, dismissOnBackdrop = false, children, destructive = false,
  pending = false, error, onConfirm, onDismiss, size = 'md', icon: Icon, confirmHint,
}: ActionDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const hintId = useId();

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
      className={`m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] ${size === 'lg' ? 'max-w-lg' : 'max-w-md'} overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/55 backdrop:backdrop-blur-[2px]`}
    >
      <div className="space-y-5 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${destructive ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`} aria-hidden="true">
            {Icon ? <Icon className="h-5 w-5" /> : destructive || !onConfirm ? <AlertTriangle className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold leading-6">{title}</h2>
            <p id={descriptionId} className="mt-1 whitespace-pre-line break-words text-sm leading-6 text-slate-600">{description}</p>
          </div>
        </div>

        {children}

        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

        {confirmHint && <p id={hintId} role="status" aria-live="polite" className="text-sm font-medium text-slate-700">{confirmHint}</p>}

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          {onConfirm && (
            <button type="button" disabled={pending} onClick={onDismiss}
              className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:opacity-50">
              {cancelLabel}
            </button>
          )}
          <button type="button" disabled={pending || (!!onConfirm && confirmDisabled)} onClick={onConfirm ?? onDismiss} aria-describedby={onConfirm && confirmHint ? hintId : undefined}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 ${destructive ? 'bg-red-700 hover:bg-red-800 focus-visible:outline-red-700' : 'bg-[#1F3864] hover:bg-[#0078C1] focus-visible:outline-blue-700'}`}>
            {pending && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
            {pending ? 'Working...' : onConfirm ? confirmLabel : 'Close'}
          </button>
        </div>
      </div>
    </dialog>
  );
}
