import { Plus, X } from 'lucide-react';
import type { RmaContact } from '@/types';
import { formatRmaContacts } from '@/utils/rma';
import { focusRingBrandClass } from '@/utils/uiClasses';

interface RmaContactsEditorProps {
  idPrefix: string;
  contacts: RmaContact[];
  onChange: (contacts: RmaContact[]) => void;
  error?: string;
}

// Matches the #357 create-form focus treatment so keyboard focus is always visible.
const inputClass = 'px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/25';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const invalidEmail = (email: string | null | undefined) => {
  const value = (email ?? '').trim();
  return !!value && !EMAIL_PATTERN.test(value);
};

/** Repeatable contact person rows (name, phone, optional email) with a live formatted preview. */
export function RmaContactsEditor({ idPrefix, contacts, onChange, error }: RmaContactsEditorProps) {
  const update = (index: number, patch: Partial<RmaContact>) => onChange(contacts.map((contact, i) => i === index ? { ...contact, ...patch } : contact));
  const preview = formatRmaContacts({ rma_contacts: contacts });
  const errorId = `${idPrefix}-error`;
  const describedBy = error ? errorId : undefined;
  return (
    <fieldset className="space-y-2 md:col-span-2" aria-describedby={describedBy}>
      <div className="flex items-center justify-between">
        <legend className="font-bold text-slate-700">Contact Person(s) <span className="text-xs font-normal text-slate-400">(optional)</span></legend>
        <button type="button" onClick={() => onChange([...contacts, { name: '', phone: '', email: '' }])}
          className={`flex items-center gap-1 rounded text-xs font-bold text-brand-blue hover:text-brand-navy cursor-pointer ${focusRingBrandClass}`}>
          <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Add Contact
        </button>
      </div>
      {contacts.map((contact, index) => {
        const nameId = `${idPrefix}-name-${index}`;
        const phoneId = `${idPrefix}-phone-${index}`;
        const emailId = `${idPrefix}-email-${index}`;
        // The editor's only field error is an invalid email; flag the row(s) that cause it.
        const emailInvalid = !!error && invalidEmail(contact.email);
        return (
          <div key={index} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
            <div>
              <label htmlFor={nameId} className="sr-only">Contact {index + 1} name</label>
              <input id={nameId} type="text" placeholder="Name" value={contact.name}
                onChange={e => update(index, { name: e.target.value })} className={`w-full ${inputClass} border-slate-300`} />
            </div>
            <div>
              <label htmlFor={phoneId} className="sr-only">Contact {index + 1} phone</label>
              <input id={phoneId} type="tel" placeholder="Phone" value={contact.phone ?? ''}
                onChange={e => update(index, { phone: e.target.value })} className={`w-full ${inputClass} border-slate-300`} />
            </div>
            <div>
              <label htmlFor={emailId} className="sr-only">Contact {index + 1} email</label>
              <input id={emailId} type="email" placeholder="Email (optional)" value={contact.email ?? ''}
                onChange={e => update(index, { email: e.target.value })} aria-invalid={emailInvalid || undefined}
                aria-describedby={emailInvalid ? describedBy : undefined}
                className={`w-full ${inputClass} ${emailInvalid ? 'border-red-500' : 'border-slate-300'}`} />
            </div>
            <button type="button" aria-label={`Remove contact ${index + 1}`} onClick={() => onChange(contacts.filter((_, i) => i !== index))}
              className={`p-1 rounded text-slate-400 hover:text-red-500 cursor-pointer justify-self-start ${focusRingBrandClass}`}>
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        );
      })}
      {contacts.length === 0 && <p className="text-xs text-slate-400 italic">No contacts added.</p>}
      {preview && <p className="text-xs text-slate-500">Shown as: <span className="font-semibold text-slate-700">{preview}</span></p>}
      {error && <p id={errorId} role="alert" className="text-red-500 text-xs font-semibold">{error}</p>}
    </fieldset>
  );
}

/** Contacts as sent to the API: trimmed, fully blank rows dropped. */
export function cleanRmaContacts(contacts: readonly RmaContact[]): RmaContact[] {
  return contacts
    .map(c => ({ name: c.name.trim(), phone: (c.phone ?? '').trim() || null, email: (c.email ?? '').trim() || null }))
    .filter(c => c.name || c.phone || c.email);
}
