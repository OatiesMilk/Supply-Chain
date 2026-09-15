import { useState, FormEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { Customer, DeliveryRecord } from '../types';
import CustomerWorkspace from './CustomerWorkspace';
import ExportMenu from './ExportMenu';
import { CUSTOMER_COLUMNS } from '../utils/export';

interface CustomersViewProps {
  customers: Customer[];
  deliveryRecords: DeliveryRecord[];
  currentUserRole: string;
  currentUserName: string;
  onNavigate: (screen: string, item_id?: string) => void;
  onCreateCustomer: (data: { name: string; contact_person?: string; email?: string; phone?: string; address?: string; city?: string }) => void;
}

const EMPTY_FORM = { name: '', contact_person: '', email: '', phone: '', address: '', city: '' };

export default function CustomersView({
  customers,
  deliveryRecords,
  currentUserRole,
  currentUserName,
  onNavigate,
  onCreateCustomer
}: CustomersViewProps) {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');

  const canCreate = currentUserRole !== 'TASS';

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError('Customer Name is required');
      return;
    }
    setFormError('');
    onCreateCustomer(form);
    setForm(EMPTY_FORM);
    setShowCreateForm(false);
  };

  const handleBackToList = () => setSelectedCustomerId(null);
  const handleNavigateToCustomer = (id: string) => setSelectedCustomerId(id);

  // If a customer is selected, render the full-page workspace
  if (selectedCustomerId) {
    return (
      <CustomerWorkspace
        customerId={selectedCustomerId}
        allCustomerIds={customers.map(c => c.id)}
        customers={customers}
        deliveryRecords={deliveryRecords}
        currentUserRole={currentUserRole}
        onBack={handleBackToList}
        onNavigate={onNavigate}
        onNavigateToCustomer={handleNavigateToCustomer}
      />
    );
  }

  const exportRows = customers.map(c => ({
    id: c.id,
    name: c.name,
    contact_person: c.contact_person,
    email: c.email,
    phone: c.phone,
    city: c.city,
    address: c.address,
    total_records: deliveryRecords.filter(r => r.customer_id === c.id).length,
  }));

  return (
    <div className="space-y-6" id="customers-view-container">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Merchant Directory &amp; Relations</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Registered merchant accounts used as the validated Company Name lookup on every delivery record.
            Click any row to open the customer workspace.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canCreate && (
            <button
              onClick={() => { setForm(EMPTY_FORM); setFormError(''); setShowCreateForm(true); }}
              className="flex items-center gap-1.5 bg-[#1F3864] hover:bg-blue-900 text-white text-xs font-bold px-3.5 py-2 rounded-lg transition-all shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" /> New Customer
            </button>
          )}
          <ExportMenu
            rows={exportRows}
            columns={CUSTOMER_COLUMNS}
            sheetName="Customers"
            filename="customers"
            pdfTitle="Merchant Customer Registry"
            showPdf={true}
            pdfPortrait={false}
            meta={{
              reportName: 'Merchant Customer Export',
              generatedByName: currentUserName,
              generatedByRole: currentUserRole,
            }}
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="p-4 border-b border-slate-200">
          <h4 className="text-sm sm:text-base font-bold text-slate-800 uppercase tracking-wider">Merchant Customer Registry</h4>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            Total record volume across all categories for each registered merchant
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200 text-xs font-black text-slate-500 uppercase tracking-wider">
                <th className="px-4 py-3">Account ID</th>
                <th className="px-4 py-3">Merchant Customer</th>
                <th className="px-4 py-3">Contact Person</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3 text-center">Records Logged</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers.map(c => {
                const totalRecords = deliveryRecords.filter(r => r.customer_id === c.id).length;
                return (
                  <tr
                    key={c.id}
                    className="hover:bg-blue-50/40 cursor-pointer transition-all"
                    onClick={() => setSelectedCustomerId(c.id)}
                  >
                    <td className="px-4 py-3.5 font-bold text-slate-400">{c.id}</td>
                    <td className="px-4 py-3.5">
                      <div className="font-extrabold text-slate-900 text-sm">{c.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{c.email}</div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-700 font-extrabold">{c.contact_person}</td>
                    <td className="px-4 py-3.5 text-slate-500 font-bold">{c.city}</td>
                    <td className="px-4 py-3.5 text-center font-bold text-slate-800">{totalRecords}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="p-3 bg-slate-50 border-t border-slate-100 text-xs font-bold text-slate-500">
          Showing {customers.length} total registered merchant accounts.
        </div>
      </div>

      {showCreateForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreateForm(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg m-4">
            <div className="px-6 pt-5 pb-4 flex items-center justify-between border-b border-slate-100">
              <h2 className="text-sm font-black text-slate-900">New Customer</h2>
              <button
                onClick={() => setShowCreateForm(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Customer Name <span className="text-red-500">*</span></label>
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
                  Create Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
