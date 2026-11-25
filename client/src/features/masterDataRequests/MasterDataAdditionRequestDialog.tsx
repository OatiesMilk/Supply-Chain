import { useId, useState, type Dispatch, type FormEvent, type KeyboardEvent, type SetStateAction } from 'react';
import { Building2, Truck, X } from 'lucide-react';
import type { ApiMasterDataAdditionRequest, MasterDataEntityType } from '@/api';
import { ActionDialog } from '@/components/ActionDialog';
import { useAccountManagersQuery } from '@/api/queries/useAccountManagersQuery';
import { useSupplierCategoriesQuery } from '@/api/queries/useSuppliersQuery';
import { useMasterDataRequestMutations } from '@/api/queries/useMasterDataRequestsQuery';
import { Field, describedBy, inputClass } from '@/features/admin/directory/DirectoryParts';
import {
  emptyRequestForm, entityLabel, requestFormErrors, serverFieldErrors, submitPayload, MAX_COMPANY_SAP_NUMBERS, MAX_SUPPLIER_SAP_NUMBERS, type RequestForm,
} from './requestForm';

const pill = 'inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700 tabular-nums';

/** Company or Supplier fields shared by the TASS request dialog and the Admin approval review. */
export function RequestFieldsEditor({ form, setForm, errors, setErrors, showNotes = true, retainedIds }: {
  form: RequestForm;
  setForm: Dispatch<SetStateAction<RequestForm>>;
  errors: Record<string, string>;
  setErrors: Dispatch<SetStateAction<Record<string, string>>>;
  showNotes?: boolean;
  /** Ids already on the request: kept selectable even if they became inactive. */
  retainedIds?: readonly string[];
}) {
  const ids = { name: useId(), sap: useId(), contact: useId(), phone: useId(), email: useId(), address: useId(), city: useId(), notes: useId(), am: useId(), categories: useId() };
  const company = form.entity_type === 'COMPANY';
  const managers = useAccountManagersQuery(company);
  const categories = useSupplierCategoriesQuery(!company);
  const retained = new Set(retainedIds ?? []);
  const amChoices = (managers.data ?? []).filter(am => am.is_active || retained.has(am.id)).sort((a, b) => a.name.localeCompare(b.name));
  const categoryChoices = (categories.data ?? []).filter(category => category.is_active || retained.has(category.id)).sort((a, b) => a.name.localeCompare(b.name));
  const clear = (key: string) => setErrors(value => { if (!(key in value)) return value; const rest = { ...value }; delete rest[key]; return rest; });
  const set = (key: 'name' | 'pending_sap' | 'contact_person' | 'contact_phone' | 'email' | 'address' | 'city' | 'notes') =>
    (event: { target: { value: string } }) => { clear(key === 'pending_sap' ? 'sap_numbers' : key); setForm(value => ({ ...value, [key]: event.target.value })); };
  const maxSaps = company ? MAX_COMPANY_SAP_NUMBERS : MAX_SUPPLIER_SAP_NUMBERS;

  function addSap() {
    const sap = form.pending_sap.trim();
    if (!sap) return;
    const found = requestFormErrors({ ...form, pending_sap: sap });
    if (found.sap_numbers) { setErrors(value => ({ ...value, sap_numbers: found.sap_numbers })); return; }
    clear('sap_numbers');
    setForm(value => ({ ...value, sap_numbers: [...value.sap_numbers, sap], pending_sap: '' }));
  }
  function onSapKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault(); // Enter adds the SAP number; it never submits a surrounding form.
    addSap();
  }
  const toggle = (key: 'account_manager_ids' | 'supplier_category_ids', id: string, checked: boolean) => {
    clear(key);
    setForm(value => ({ ...value, [key]: checked ? [...value[key], id] : value[key].filter(entry => entry !== id) }));
  };

  return (
    <>
      <Field id={ids.name} label={`${entityLabel(form.entity_type)} name`} required error={errors.name}>
        <input id={ids.name} value={form.name} maxLength={200} autoComplete="organization" className={inputClass} onChange={set('name')} {...describedBy(ids.name, errors.name)} />
      </Field>
      <Field id={ids.sap} label={company ? 'SAP number(s)' : 'SAP / reference number'} error={errors.sap_numbers}
        hint={company ? 'Optional for walk-in clients; add multiple for enterprise accounts.' : `Optional; up to ${maxSaps}.`}>
        {form.sap_numbers.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="SAP numbers to send">
            {form.sap_numbers.map(sap => (
              <li key={sap} className={pill}>
                {sap}
                <button type="button" aria-label={`Remove SAP number ${sap}`} className="rounded-full p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
                  onClick={() => setForm(value => ({ ...value, sap_numbers: value.sap_numbers.filter(entry => entry !== sap) }))}>
                  <X aria-hidden="true" className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input id={ids.sap} value={form.pending_sap} maxLength={50} autoComplete="off" placeholder="e.g., SAP-88231" className={`${inputClass} tabular-nums`}
            onChange={set('pending_sap')} onKeyDown={onSapKey} {...describedBy(ids.sap, errors.sap_numbers, 'hint')} />
          <button type="button" onClick={addSap} disabled={!form.pending_sap.trim()}
            className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Add</button>
        </div>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={ids.contact} label="Contact person" error={errors.contact_person}>
          <input id={ids.contact} value={form.contact_person} maxLength={200} autoComplete="off" className={inputClass} onChange={set('contact_person')} {...describedBy(ids.contact, errors.contact_person)} />
        </Field>
        <Field id={ids.phone} label={company ? 'Contact phone' : 'Phone'} error={errors.contact_phone}>
          <input id={ids.phone} value={form.contact_phone} maxLength={50} autoComplete="off" inputMode="tel" className={inputClass} onChange={set('contact_phone')} {...describedBy(ids.phone, errors.contact_phone)} />
        </Field>
      </div>
      {!company && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={ids.email} label="Email" error={errors.email}>
            <input id={ids.email} type="email" value={form.email} maxLength={254} autoComplete="off" className={inputClass} onChange={set('email')} {...describedBy(ids.email, errors.email)} />
          </Field>
          <Field id={ids.city} label="City" error={errors.city}>
            <input id={ids.city} value={form.city} maxLength={250} autoComplete="off" className={inputClass} onChange={set('city')} {...describedBy(ids.city, errors.city)} />
          </Field>
        </div>
      )}
      <Field id={ids.address} label="Address" error={errors.address}>
        <textarea id={ids.address} value={form.address} maxLength={1000} rows={2} className={inputClass} onChange={set('address')} {...describedBy(ids.address, errors.address)} />
      </Field>
      {company ? (
        <fieldset disabled={managers.isPending || !!managers.error} className="space-y-1.5" aria-describedby={`${ids.am}-hint`} aria-invalid={errors.account_manager_ids ? true : undefined}>
          <legend className="block text-xs font-bold text-slate-700">Account Manager(s)</legend>
          <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
            {amChoices.map(am => (
              <label key={am.id} className="flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" className="mt-0.5" checked={form.account_manager_ids.includes(am.id)} onChange={event => toggle('account_manager_ids', am.id, event.target.checked)} />
                <span className="break-words">{am.name}{!am.is_active && <span className="ml-1 text-xs font-semibold text-amber-700">(inactive)</span>}</span>
              </label>
            ))}
            {!amChoices.length && <p className="text-xs text-slate-500">{managers.isPending ? 'Loading Account Managers…' : 'No active Account Managers.'}</p>}
          </div>
          {errors.account_manager_ids
            ? <p className="text-xs font-semibold text-red-700">{errors.account_manager_ids}</p>
            : <p id={`${ids.am}-hint`} className="text-xs text-slate-500">{managers.error ? 'Could not load Account Managers.' : 'Optional. Select every Account Manager who handles this client.'}</p>}
        </fieldset>
      ) : (
        <fieldset disabled={categories.isPending || !!categories.error} className="space-y-1.5" aria-describedby={`${ids.categories}-hint`} aria-invalid={errors.supplier_category_ids ? true : undefined}>
          <legend className="block text-xs font-bold text-slate-700">Categories</legend>
          <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
            {categoryChoices.map(category => (
              <label key={category.id} className="flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" className="mt-0.5" checked={form.supplier_category_ids.includes(category.id)} onChange={event => toggle('supplier_category_ids', category.id, event.target.checked)} />
                <span className="break-words">{category.name}{!category.is_active && <span className="ml-1 text-xs font-semibold text-amber-700">(inactive)</span>}</span>
              </label>
            ))}
            {!categoryChoices.length && <p className="text-xs text-slate-500">{categories.isPending ? 'Loading categories…' : 'No active categories.'}</p>}
          </div>
          {errors.supplier_category_ids
            ? <p className="text-xs font-semibold text-red-700">{errors.supplier_category_ids}</p>
            : <p id={`${ids.categories}-hint`} className="text-xs text-slate-500">{categories.error ? 'Could not load categories.' : 'Optional. Leave blank if unsure; the Admin can choose.'}</p>}
        </fieldset>
      )}
      {showNotes && (
        <Field id={ids.notes} label="Notes for Admin" error={errors.notes} hint="Optional, e.g. walk-in repair or case number.">
          <textarea id={ids.notes} value={form.notes} maxLength={1000} rows={2} className={inputClass} onChange={set('notes')} {...describedBy(ids.notes, errors.notes, 'hint')} />
        </Field>
      )}
    </>
  );
}

/** TASS: ask an Admin to add a missing Company or Supplier. In-progress record forms are untouched. */
export default function MasterDataAdditionRequestDialog({ initialEntityType = 'COMPANY', initialName = '', allowedTypes = ['COMPANY', 'SUPPLIER'], onClose }: {
  initialEntityType?: MasterDataEntityType;
  initialName?: string;
  allowedTypes?: readonly MasterDataEntityType[];
  onClose: (submitted?: ApiMasterDataAdditionRequest) => void;
}) {
  const formId = useId();
  const { submit } = useMasterDataRequestMutations();
  const startType = allowedTypes.includes(initialEntityType) ? initialEntityType : allowedTypes[0] ?? 'COMPANY';
  const [form, setForm] = useState<RequestForm>(() => emptyRequestForm(startType, initialName.trim()));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const switchType = (entity_type: MasterDataEntityType) => {
    if (entity_type === form.entity_type) return;
    setErrors({}); setServerError(null);
    // Keep what applies to both; drop picks that belong to the other directory.
    setForm(value => ({ ...emptyRequestForm(entity_type, value.name), sap_numbers: value.sap_numbers.slice(0, entity_type === 'SUPPLIER' ? MAX_SUPPLIER_SAP_NUMBERS : MAX_COMPANY_SAP_NUMBERS),
      contact_person: value.contact_person, contact_phone: value.contact_phone, address: value.address, notes: value.notes }));
  };

  async function send(event?: FormEvent) {
    event?.preventDefault();
    event?.stopPropagation(); // Never reaches a record form this dialog is opened from.
    const found = requestFormErrors(form);
    setErrors(found); setServerError(null);
    if (Object.keys(found).length) return;
    try {
      const created = await submit.mutateAsync(submitPayload(form));
      onClose(created);
    } catch (error) {
      const mapped = serverFieldErrors(error);
      setErrors(mapped.fields); setServerError(mapped.message);
    }
  }

  return (
    <ActionDialog open size="lg" icon={form.entity_type === 'COMPANY' ? Building2 : Truck} pending={submit.isPending} error={serverError}
      title={`Request to add ${entityLabel(form.entity_type).toLowerCase()}`}
      description="An Admin reviews the request and adds it to the directory. You will be notified when it is approved or rejected."
      confirmLabel="Send request" onConfirm={() => void send()} onDismiss={() => onClose()}>
      <form id={formId} noValidate onSubmit={event => void send(event)} className="space-y-4">
        {allowedTypes.length > 1 && (
          <div role="radiogroup" aria-label="What to add" className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {allowedTypes.map(type => (
              <button key={type} type="button" role="radio" aria-checked={form.entity_type === type} onClick={() => switchType(type)}
                className={`rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-blue ${
                  form.entity_type === type ? 'bg-white text-brand-blue shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {entityLabel(type)}
              </button>
            ))}
          </div>
        )}
        <RequestFieldsEditor form={form} setForm={setForm} errors={errors} setErrors={setErrors} />
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </ActionDialog>
  );
}
