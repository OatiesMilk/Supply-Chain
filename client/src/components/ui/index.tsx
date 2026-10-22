import { forwardRef, useId, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

const classes = (...values: (string | undefined | false)[]) => values.filter(Boolean).join(' ');

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
}

/** Explicit opt-in to submission keeps toolbar and dialog actions safe in forms. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'primary', loading = false, disabled, type = 'button', className, children, ...props }, ref) {
  return <button {...props} ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || props['aria-busy']} className={classes('mg-button', `mg-button--${variant}`, className)}>
    {loading && <Loader2 aria-hidden="true" className="mg-spinner" />}{children}
  </button>;
});

export interface IconButtonProps extends ButtonProps { label: string }
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({ label, variant = 'ghost', className, ...props }, ref) {
  return <Button {...props} ref={ref} variant={variant} aria-label={label} className={classes('mg-icon-button', className)} />;
});

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input {...props} ref={ref} className={classes('mg-control', className)} />;
});
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...props }, ref) {
  return <select {...props} ref={ref} className={classes('mg-control', className)} />;
});
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea {...props} ref={ref} className={classes('mg-control', 'mg-textarea', className)} />;
});

export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  'aria-required'?: true;
}
export interface FieldProps {
  id?: string;
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: (control: FieldControlProps) => ReactNode;
}
/** Associates visible labels/help/errors without imposing form validation rules. */
export function Field({ id, label, description, error, required, className, children }: FieldProps) {
  const generatedId = useId();
  const controlId = id || generatedId;
  const describedBy = [description ? `${controlId}-help` : undefined, error ? `${controlId}-error` : undefined].filter(Boolean).join(' ') || undefined;
  return <div className={classes('mg-field', className)}>
    <label htmlFor={controlId} className="mg-field__label">{label}{required && <span aria-hidden="true"> *</span>}</label>
    {children({ id: controlId, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined, 'aria-required': required ? true : undefined })}
    {description && <p id={`${controlId}-help`} className="mg-field__description">{description}</p>}
    {error && <p id={`${controlId}-error`} role="alert" className="mg-field__error">{error}</p>}
  </div>;
}

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export function StatusBadge({ tone = 'neutral', className, children, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: StatusTone; children: ReactNode }) {
  return <span {...props} className={classes('mg-badge', `mg-badge--${tone}`, className)}>{children}</span>;
}

export function Card({ as: Element = 'div', className, ...props }: HTMLAttributes<HTMLElement> & { as?: 'div' | 'section' }) {
  return <Element {...props} className={classes('mg-card', className)} />;
}
export function PageHeader({ title, description, actions, className, ...props }: Omit<HTMLAttributes<HTMLElement>, 'title'> & { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return <header {...props} className={classes('mg-page-header', className)}>
    <div className="min-w-0"><h1 className="mg-page-title">{title}</h1>{description && <p className="mg-page-description">{description}</p>}</div>
    {actions && <div className="mg-page-actions">{actions}</div>}
  </header>;
}
export function EmptyState({ title, description, action, className, ...props }: Omit<HTMLAttributes<HTMLDivElement>, 'title'> & { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return <div {...props} role="status" className={classes('mg-empty-state', className)}>
    <p className="mg-state-title">{title}</p>{description && <p>{description}</p>}{action}
  </div>;
}
export function ErrorState({ title, children, action, tone = 'danger', className, ...props }: Omit<HTMLAttributes<HTMLDivElement>, 'title'> & { title?: ReactNode; action?: ReactNode; tone?: 'danger' | 'warning' }) {
  return <div {...props} role="alert" className={classes('mg-error-state', `mg-error-state--${tone}`, className)}>
    {title && <p className="mg-state-title">{title}</p>}{children && <div>{children}</div>}{action}
  </div>;
}
