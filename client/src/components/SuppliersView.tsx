import { useState, FormEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { Supplier, DeliveryRecord } from '../types';
import SupplierWorkspace from './SupplierWorkspace';
import ExportMenu from './ExportMenu';
import { SUPPLIER_COLUMNS } from '../utils/export';

const CATEGORY_COLOR: Record<string, string> = {
  'Electronics':  'bg-blue-50 text-blue-700 border-blue-200',
  'Hardware':     'bg-slate-100 text-slate-700 border-slate-200',
  'Consumables':  'bg-amber-50 text-amber-700 border-amber-200',
  'Packaging':    'bg-purple-50 text-purple-700 border-purple-200',
  'Services':     'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const SUPPLIER_CATEGORIES = ['Hardware', 'Consumables', 'Electronics', 'Packaging', 'Services'];

interface Props {
  suppliers: Supplier[];
  deliveryRecords: DeliveryRecord[];
  currentUserRole?: string;
  currentUserName?: string;
  onCreateSupplier: (data: { name: string; contact_person?: string; email?: string; phone?: string; address?: string; city?: string; category?: string }) => void;
}

const EMPTY_FORM = { name: '', contact_person: '', email: '', phone: '', address: '', city: '', category: 'Hardware' };

export default function SuppliersView({ suppliers, deliveryRecords, currentUserRole = '', currentUserName = '', onCreateSupplier }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');

  const canCreate = currentUserRole !== 'TASS';

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError('Supplier Name is required');
      return;
    }
    setFormError('');
    onCreateSupplier(form);
    setForm(EMPTY_FORM);
    setShowCreateForm(false);
  };

  const activeSupplier = suppliers.find(s => s.id === selectedId);

  if (selectedId && activeSupplier) {
    return (
      <SupplierWorkspace
        supplier={activeSupplier}
        allSupplierIds={suppliers.map(s => s.id)}
        deliveryRecords={deliveryRecords}
        onBack={() => setSelectedId(null)}
        onNavigateToSupplier={setSelectedId}
      />
    );
  }

  const exportRows = suppliers.map(s => ({
    id: s.id,
    name: s.name,
    contact_person: s.contact_person,
    email: s.email,
    phone: s.phone,
    city: s.city,
    address: s.address,
    category: s.category,
    pickup_count: deliveryRecords.filter(r =>
      r.category === 'Procurement Pick-up' &&
      (r.item_description.toLowerCase().includes(s.name.toLowerCase()) ||
       r.company_name.toLowerCase().includes(s.name.toLowerCase()))
    ).length,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Supplier Directory</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Registered suppliers linked to Procurement Pick-up records. Click any row to open the supplier workspace.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canCreate && (
            <button
              onClick={() => { setForm(EMPTY_FORM); setFormError(''); setShowCreateForm(true); }}
              className="flex items-center gap-1.5 bg-[#1F3864] hover:bg-blue-900 text-white text-xs font-bold px-3.5 py-2 rounded-lg transition-all shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" /> New Supplier
            </button>
          )}
          <ExportMenu
            rows={exportRows}
            columns={SUPPLIER_COLUMNS}
            sheetName="Suppliers"
            filename="suppliers"
            pdfTitle="Supplier Directory"
            showPdf={true}
            pdfPortrait={false}
            meta={{
              reportName: 'Supplier Directory Export',
              generatedByName: currentUserName,
              generatedByRole: currentUserRole,
            }}
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="p-4 border-b border-slate-200">
          <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Supplier Registry</h4>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            {suppliers.length} registered supplier{suppliers.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200 text-xs font-black text-slate-500 uppercase tracking-wider">
                <th className="px-4 py-3">Supplier ID</th>
                <th className="px-4 py-3">Supplier Name</th>
                <th className="px-4 py-3">Contact Person</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-center">Pick-ups</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {suppliers.map(s => {
                const pickupCount = deliveryRecords.filter(r =>
                  r.category === 'Procurement Pick-up' &&
                  (r.item_description.toLowerCase().includes(s.name.toLowerCase()) ||
                   r.company_name.toLowerCase().includes(s.name.toLowerCase()))
                ).length;

                return (
                  <tr
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    className="hover:bg-blue-50/40 cursor-pointer transition-all"
                  >
                    <td className="px-4 py-3 font-mono font-black text-slate-700 tracking-tight text-xs">{s.id}</td>
                    <td className="px-4 py-3.5">
                      <div className="font-extrabold text-slate-900 text-sm">{s.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{s.email}</div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-700 font-semibold">{s.contact_person}</td>
                    <td className="px-4 py-3.5 text-slate-500 font-semibold">{s.city}</td>
                    <td className="px-4 py-3.5">
                      <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${CATEGORY_COLOR[s.category] ?? 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                        {s.category}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center font-bold text-slate-800">{pickupCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="p-3 bg-slate-50 border-t border-slate-100 text-xs font-bold text-slate-500">
          Showing {suppliers.length} registered suppliers.
        </div>
      </div>

      {showCreateForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreateForm(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg m-4">
            <div className="px-6 pt-5 pb-4 flex items-center justify-between border-b border-slate-100">
              <h2 className="text-sm font-black text-slate-900">New Supplier</h2>
              <button
                onClick={() => setShowCreateForm(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Supplier Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1] ${formError ? 'border-red-500' : 'border-slate-300'}`}
                />
                {formError && <p className="text-red-500 text-[10px] font-semibold">{formError}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block">Contact Person</label>
                  <input type="text" value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]" />
                </div>
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block">Email</label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]" />
                </div>
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block">Phone</label>
                  <input type="text" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]" />
                </div>
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block">City</label>
                  <input type="text" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]" />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <label className="font-bold text-slate-700 block">Address</label>
                  <input type="text" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]" />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <label className="font-bold text-slate-700 block">Category</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]">
                    {SUPPLIER_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-600 hover:bg-slate-50 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#1F3864] hover:bg-[#0078C1] text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                >
                  Create Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
