import { FormEvent, useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react';
import { ApiError, CustomerEditableField } from '@/api';
import { useUpdateCustomerMutation } from '@/api/queries/useCompaniesQuery';
import { Customer } from '@/types';
import {
  CUSTOMER_FIELD_RULES, REMARKS_MAX, CustomerErrors, changedCustomerFields, customerDraft,
  validateCustomerEdit, validateField, validateRemarks,
} from '@/utils/customerValidation';

interface CustomerEditFormProps {
  customer: Customer;
  onCancel: () => void;
  onSaved: () => void;
  onDirtyChange: (dirty: boolean) => void;
  /** Fetches the latest customer before the form discards its draft. */
  onReloadLatest: () => Promise<Customer>;
}

const LAYOUT: Array<{ field: CustomerEditableField; wide?: boolean; type?: string; autoComplete?: string }> = [
  { field: 'name', wide: true, autoComplete: 'organization' },
  { field: 'contact_person', autoComplete: 'name' },
  { field: 'phone', type: 'tel', autoComplete: 'tel' },
  { field: 'email', type: 'email', autoComplete: 'email' },
  { field: 'city', autoComplete: 'address-level2' },
  { field: 'address', wide: true, autoComplete: 'street-address' },
];

const inputClass = (invalid: boolean) =>
  `w-full rounded-lg border px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 ${
    invalid ? 'border-red-500 focus:border-red-500' : 'border-slate-300 focus:border-[#0078C1]'
  }`;

export default function CustomerEditForm({ customer, onCancel, onSaved, onDirtyChange, onReloadLatest }: CustomerEditFormProps) {
  const formId = useId();
  const mutation = useUpdateCustomerMutation();
  // Keep the captured values and version until a reload succeeds.
  const [base, setBase] = useState(() => ({ draft: customerDraft(customer), modifiedAt: customer.modified_at }));
  const [draft, setDraft] = useState(base.draft);
  const [remarks, setRemarks] = useState('');
  const [errors, setErrors] = useState<CustomerErrors>({});
  const [serverError, setServerError] = useState<{ message: string; stale: boolean } | null>(null);
  const [reloading, setReloading] = useState(false);
  const fieldRefs = useRef<Partial<Record<CustomerEditableField | 'remarks', HTMLInputElement | HTMLTextAreaElement | null>>>({});

  const changed = changedCustomerFields(base.draft, draft);
  const dirty = changed.length > 0 || remarks.trim().length > 0;
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const setFieldError = (key: CustomerEditableField | 'remarks', message: string | undefined) =>
    setErrors(prev => {
      if (prev[key] === message) return prev;
      const next = { ...prev };
      if (message) next[key] = message; else delete next[key];
      return next;
    });

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (mutation.isPending) return;
    setServerError(null);

    const found = validateCustomerEdit(draft, remarks);
    if (!changed.length && !found.name) {
      setServerError({ message: 'Change at least one field before saving.', stale: false });
      return;
    }
    setErrors(found);
    const firstInvalid = ([...LAYOUT.map(l => l.field), 'remarks'] as const).find(key => found[key]);
    if (firstInvalid) { fieldRefs.current[firstInvalid]?.focus(); return; }

    try {
      await mutation.mutateAsync({
        id: customer.id,
        data: {
          ...Object.fromEntries(changed.map(field => [field, draft[field].trim()])),
          remarks: remarks.trim(),
          expected_modified_at: base.modifiedAt,
        },
      });
      onSaved();
    } catch (error) {
      if (error instanceof ApiError) {
        if (Object.keys(error.fields).length) setErrors(prev => ({ ...prev, ...error.fields }));
        setServerError({ message: error.message, stale: error.status === 409 });
      } else {
        setServerError({ message: 'Could not reach the server. Your changes are still here; check your connection and try again.', stale: false });
      }
    }
  };

  const describedBy = (key: string, extra?: string) =>
    [errors[key as keyof CustomerErrors] ? `${formId}-${key}-error` : null, extra].filter(Boolean).join(' ') || undefined;

  return (
    <form id={formId} onSubmit={handleSubmit} noValidate className="space-y-5">
      <section aria-labelledby={`${formId}-title`} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 id={`${formId}-title`} className="text-sm font-bold text-[#1F3864]">Edit customer details</h3>
        <p className="mt-0.5 text-xs text-slate-500">Fields marked * are required.</p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {LAYOUT.map(({ field, wide, type = 'text', autoComplete }) => {
            const { label, max } = CUSTOMER_FIELD_RULES[field];
            const inputId = `${formId}-${field}`;
            const isChanged = changed.includes(field);
            return (
              <div key={field} className={wide ? 'sm:col-span-2' : undefined}>
                <label htmlFor={inputId} className="mb-1.5 flex items-center gap-2 text-xs font-bold text-slate-700">
                  {label}{field === 'name' && <span className="text-red-600" aria-hidden="true">*</span>}
                  {isChanged && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-[#0078C1]">Edited</span>}
                </label>
                <input
                  ref={el => { fieldRefs.current[field] = el; }}
                  id={inputId}
                  type={type}
                  autoComplete={autoComplete}
                  maxLength={max}
                  required={field === 'name'}
                  value={draft[field]}
                  aria-invalid={Boolean(errors[field])}
                  aria-describedby={describedBy(field)}
                  onChange={event => {
                    const value = event.target.value;
                    setDraft(prev => ({ ...prev, [field]: value }));
                    if (errors[field]) setFieldError(field, validateField(field, value));
                  }}
                  onBlur={event => setFieldError(field, validateField(field, event.target.value))}
                  className={inputClass(Boolean(errors[field]))}
                />
                {errors[field] && <p id={`${inputId}-error`} className="mt-1 text-xs font-medium text-red-700">{errors[field]}</p>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <label htmlFor={`${formId}-remarks`} className="block text-xs font-bold text-slate-700">
          Reason for change <span className="text-red-600" aria-hidden="true">*</span>
        </label>
        <p id={`${formId}-remarks-help`} className="mt-0.5 mb-2 text-xs text-slate-500">
          Saved with your name in this customer's Audit Trail.
        </p>
        <textarea
          ref={el => { fieldRefs.current.remarks = el; }}
          id={`${formId}-remarks`}
          rows={3}
          required
          maxLength={REMARKS_MAX}
          value={remarks}
          aria-invalid={Boolean(errors.remarks)}
          aria-describedby={describedBy('remarks', `${formId}-remarks-help`)}
          onChange={event => {
            setRemarks(event.target.value);
            if (errors.remarks) setFieldError('remarks', validateRemarks(event.target.value));
          }}
          onBlur={event => setFieldError('remarks', validateRemarks(event.target.value))}
          placeholder="For example: Updated phone number per client email dated 7 Oct."
          className={inputClass(Boolean(errors.remarks))}
        />
        {errors.remarks && <p id={`${formId}-remarks-error`} className="mt-1 text-xs font-medium text-red-700">{errors.remarks}</p>}
      </section>

      {serverError && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p>{serverError.message}</p>
            {serverError.stale && (
              <button
                type="button"
                disabled={reloading}
                onClick={async () => {
                  setReloading(true);
                  try {
                    const latest = await onReloadLatest();
                    const latestDraft = customerDraft(latest);
                    setBase({ draft: latestDraft, modifiedAt: latest.modified_at });
                    setDraft(latestDraft);
                    setRemarks('');
                    setErrors({});
                    setServerError(null);
                  } catch {
                    setServerError({
                      message: 'Could not load the latest values. Your edits are still here; check your connection and try again.',
                      stale: true,
                    });
                  } finally {
                    setReloading(false);
                  }
                }}
                className="mt-2 inline-flex items-center gap-1.5 font-semibold underline underline-offset-2 hover:text-red-900 disabled:opacity-60"
              >
                <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                {reloading ? 'Loading latest values...' : 'Discard my edits and load the latest values'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Portal convention: primary action bottom-right, secondary to its left. */}
      <div className="sticky bottom-0 z-10 -mx-5 -mb-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur">
        <p aria-live="polite" className="text-xs text-slate-500">
          {changed.length === 0 ? 'No changes yet' : `${changed.length} unsaved ${changed.length === 1 ? 'change' : 'changes'}`}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={mutation.isPending}
            className="min-h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#1F3864] px-4 text-sm font-semibold text-white hover:bg-[#0078C1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:opacity-60 active:scale-[0.98] transition-[background-color,transform] duration-150"
          >
            {mutation.isPending && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
            {mutation.isPending ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>
    </form>
  );
}
