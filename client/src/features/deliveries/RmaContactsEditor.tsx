import { Plus, X } from 'lucide-react';
import type { RmaContact } from '@/types';
import { formatRmaContacts } from '@/utils/rma';

interface RmaContactsEditorProps {
  idPrefix: string;
  contacts: RmaContact[];
  onChange: (contacts: RmaContact[]) => void;
  error?: string;
}

/** Repeatable contact person rows (name, phone, optional email) with a live formatted preview. */
export function RmaContactsEditor({ idPrefix, contacts, onChange, error }: RmaContactsEditorProps) {
  const update = (index: number, patch: Partial<RmaContact>) => onChange(contacts.map((contact, i) => i === index ? { ...contact, ...patch } : contact));
  const preview = formatRmaContacts({ rma_contacts: contacts });
  return (
    <fieldset className="space-y-2 md:col-span-2" aria-describedby={error ? `${idPrefix}-error` : undefined}>
      <div className="flex items-center justify-between">
        <legend className="font-bold text-slate-700">Contact Person(s) <span className="text-xs font-normal text-slate-400">(optional)</span></legend>
        <button type="button" onClick={() => onChange([...contacts, { name: '', phone: '', email: '' }])}
          className="flex items-center gap-1 text-xs font-bold text-brand-blue hover:text-brand-navy cursor-pointer">
          <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Add Contact
        </button>
      </div>
      {contacts.map((contact, index) => (
        <div key={index} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
          <input id={`${idPrefix}-name-${index}`} aria-label={`Contact ${index + 1} name`} type="text" placeholder="Name" value={contact.name}
            onChange={e => update(index, { name: e.target.value })} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          <input id={`${idPrefix}-phone-${index}`} aria-label={`Contact ${index + 1} phone`} type="tel" placeholder="Phone" value={contact.phone ?? ''}
            onChange={e => update(index, { phone: e.target.value })} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          <input id={`${idPrefix}-email-${index}`} aria-label={`Contact ${index + 1} email`} type="email" placeholder="Email (optional)" value={contact.email ?? ''}
            onChange={e => update(index, { email: e.target.value })} aria-invalid={!!error}
            className={`px-3 py-2 border rounded-lg text-sm ${error ? 'border-red-500' : 'border-slate-300'}`} />
          <button type="button" aria-label={`Remove contact ${index + 1}`} onClick={() => onChange(contacts.filter((_, i) => i !== index))}
            className="p-1 text-slate-400 hover:text-red-500 cursor-pointer justify-self-start">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      ))}
      {contacts.length === 0 && <p className="text-xs text-slate-400 italic">No contacts added.</p>}
      {preview && <p className="text-xs text-slate-500">Shown as: <span className="font-semibold text-slate-700">{preview}</span></p>}
      {error && <p id={`${idPrefix}-error`} role="alert" className="text-red-500 text-xs font-semibold">{error}</p>}
    </fieldset>
  );
}

/** Contacts as sent to the API: trimmed, fully blank rows dropped. */
export function cleanRmaContacts(contacts: readonly RmaContact[]): RmaContact[] {
  return contacts
    .map(c => ({ name: c.name.trim(), phone: (c.phone ?? '').trim() || null, email: (c.email ?? '').trim() || null }))
    .filter(c => c.name || c.phone || c.email);
}
