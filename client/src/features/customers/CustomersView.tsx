import { usePermissions } from '@/hooks/usePermissions';
import { useState, useMemo, FormEvent } from 'react';
import { Plus, Search, Users, X } from 'lucide-react';
import { Customer } from '@/types';
import CustomerWorkspace from '@/features/customers/CustomerWorkspace';
import ExportMenu from '@/components/ExportMenu';
import Pagination, { DEFAULT_PAGE_SIZE } from '@/components/Pagination';
import { CUSTOMER_COLUMNS } from '@/utils/export';
import {
  btnPrimaryClass,
  cardClass,
  fieldInputClass,
  fieldLabelClass,
  tableHeaderRowClass,
  tableLeadButtonClass,
  tableRowClass,
} from '@/utils/uiClasses';
import { EmptyState, SectionHeader } from '@/components/UiPrimitives';

interface CustomersViewProps {
  customers: Customer[];
  currentUserRole: string;
  currentUserName: string;
  onCreateCustomer: (data: { name: string; contact_person?: string; email?: string; phone?: string; address?: string; city?: string }) => Promise<void>;
}

const EMPTY_FORM = { name: '', contact_person: '', email: '', phone: '', address: '', city: '' };

export default function CustomersView({
  customers,
  currentUserRole,
  currentUserName,
  onCreateCustomer
}: CustomersViewProps) {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q) ||
      (c.contact_person ?? '').toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.city ?? '').toLowerCase().includes(q)
    );
  }, [customers, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, page), totalPages);

  const access = usePermissions();
  const canCreate = currentUserRole !== 'TASS' && access.canResource('customers', 'CREATE');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    if (!form.name.trim()) {
      setFormError('Customer Name is required');
      return;
    }
    setFormError('');
    setSaveError('');
    setIsSaving(true);
    try {
      await onCreateCustomer(form);
      setForm(EMPTY_FORM);
      setShowCreateForm(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save customer. Please try again.');
    } finally {
      setIsSaving(false);
    }
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
        currentUserRole={currentUserRole}
        onBack={handleBackToList}
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
  }));

  return (
    <div className="space-y-4" id="customers-view-container">
      <div className={`${cardClass} overflow-hidden`}>
        <div className="p-4 border-b border-slate-200/80 space-y-3">
          <SectionHeader
            title="Merchant customer registry"
            subtitle="Total record volume across all categories for each registered merchant"
            actions={
              <>
                {canCreate && (
                  <button
                    type="button"
                    onClick={() => { setForm(EMPTY_FORM); setFormError(''); setSaveError(''); setShowCreateForm(true); }}
                    className={btnPrimaryClass}
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
              </>
            }
          />
          <div className="relative max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
              placeholder="Search customers by name, ID, contact, or city..."
              aria-label="Search customers"
              className="w-full h-9 pl-9 pr-3 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 bg-white focus:outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className={tableHeaderRowClass}>
                <th className="px-4 py-3">Account ID</th>
                <th className="px-4 py-3">Merchant Customer</th>
                <th className="px-4 py-3">Contact Person</th>
                <th className="px-4 py-3">City</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <EmptyState
                      compact
                      icon={Users}
                      title="No matching customers"
                      description={searchQuery ? `No customers matched "${searchQuery}".` : 'No customers have been registered yet.'}
                    />
                  </td>
                </tr>
              ) : filteredCustomers.slice((safeCurrentPage - 1) * pageSize, safeCurrentPage * pageSize).map(c => {
                return (
                  <tr
                    key={c.id}
                    className={`${tableRowClass} cursor-pointer`}
                    onClick={() => setSelectedCustomerId(c.id)}
                  >
                    <td className="px-4 py-3.5 tabular-nums text-xs text-slate-500">{c.id}</td>
                    <td className="px-4 py-3.5">
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); setSelectedCustomerId(c.id); }}
                        aria-label={`Open customer ${c.name}`}
                        className={`${tableLeadButtonClass} text-sm font-semibold text-slate-900`}
                      >
                        {c.name}
                      </button>
                      {c.email && <div className="text-xs text-slate-500 mt-0.5">{c.email}</div>}
                    </td>
                    <td className="px-4 py-3.5 font-medium text-slate-700">{c.contact_person}</td>
                    <td className="px-4 py-3.5 text-slate-600">{c.city}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-200/80">
          <Pagination
            currentPage={safeCurrentPage}
            totalPages={totalPages}
            totalItems={filteredCustomers.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setPage(1);
            }}
            pageSizeOptions={[10, 25, 50, 100]}
          />
        </div>
      </div>

      {showCreateForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-[2px]"
          onClick={(e) => { if (e.target === e.currentTarget && !isSaving) setShowCreateForm(false); }}
        >
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xl w-full max-w-lg m-4">
            <div className="px-6 pt-5 pb-4 flex items-center justify-between border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">New customer</h2>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                disabled={isSaving}
                aria-label="Close"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
              <div className="space-y-1">
                <label className={fieldLabelClass}>Customer Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className={`${fieldInputClass} ${formError ? 'border-red-500' : ''}`}
                />
                {formError && <p className="text-red-600 text-xs font-medium">{formError}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className={fieldLabelClass}>Contact Person</label>
                  <input type="text" value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))}
                    className={fieldInputClass} />
                </div>
                <div className="space-y-1">
                  <label className={fieldLabelClass}>Email</label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className={fieldInputClass} />
                </div>
                <div className="space-y-1">
                  <label className={fieldLabelClass}>Phone</label>
                  <input type="text" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue" />
                </div>
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block">City</label>
                  <input type="text" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue" />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <label className="font-bold text-slate-700 block">Address</label>
                  <input type="text" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue" />
                </div>
              </div>
              {saveError && <p role="alert" className="text-red-600 font-semibold">{saveError}</p>}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  disabled={isSaving}
                  className="px-4 py-2 border border-slate-300 text-slate-600 hover:bg-slate-50 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-brand-navy hover:bg-brand-blue text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                >
                  {isSaving ? 'Saving...' : 'Create Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
