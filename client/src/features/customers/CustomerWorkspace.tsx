import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, ChevronLeft, ChevronRight, Building2,
  Lock, Phone, Mail, MapPin, User, Paperclip,
  ClipboardList, History, FolderOpen, Pencil, CheckCircle2
} from 'lucide-react';
import { Customer } from '@/types';
import { ActionDialog } from '@/components/ActionDialog';
import { CUSTOMERS_QUERY_KEY } from '@/api/queries/useCompaniesQuery';
import CustomerEditForm from './CustomerEditForm';
import CustomerAuditTrail from './CustomerAuditTrail';

// Roles allowed to edit customers and read their audit trail; the server
// enforces the same list on PUT /customers/:id and GET /customers/:id/audit.
const CUSTOMER_EDITOR_ROLES = ['Sales Coordinator', 'Logistics', 'Admin'];

// Customers are a merchant directory, separate from the Company a record
// belongs to, so this workspace has no record history (see TSK-102).
interface CustomerWorkspaceProps {
  customerId: string;
  allCustomerIds: string[];
  customers: Customer[];
  currentUserRole: string;
  onBack: () => void;
  onNavigateToCustomer: (id: string) => void;
}

type TabId = 'overview' | 'documents' | 'audit';

interface TabDef {
  id: TabId;
  label: string;
  icon: typeof Building2;
  roles?: string[];
}

const ALL_TABS: TabDef[] = [
  { id: 'overview',  label: 'Overview',                icon: ClipboardList },
  { id: 'documents', label: 'Documents & Attachments', icon: FolderOpen    },
  { id: 'audit',     label: 'Audit Trail',             icon: History, roles: CUSTOMER_EDITOR_ROLES },
];

function formatTs(ts: string): string {
  return new Date(ts).toLocaleString('en-PH', {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

function ScaffoldTab({ icon: Icon, label, detail }: { icon: typeof Building2; label: string; detail?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
        <Icon className="w-8 h-8 text-slate-300" />
      </div>
      <div>
        <h3 className="text-base font-bold text-slate-700">{label}</h3>
        <p className="text-sm text-slate-400 mt-1 max-w-sm">
          {detail ?? `This section is under development. ${label} data will appear here once the module is connected.`}
        </p>
      </div>
    </div>
  );
}

export default function CustomerWorkspace({
  customerId,
  allCustomerIds,
  customers,
  currentUserRole,
  onBack,
  onNavigateToCustomer
}: CustomerWorkspaceProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [savedNotice, setSavedNotice] = useState(false);
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  const handleDirtyChange = useCallback((value: boolean) => setDirty(value), []);

  const canEdit = CUSTOMER_EDITOR_ROLES.includes(currentUserRole);
  const customer = customers.find(c => c.id === customerId);

  useEffect(() => { setEditing(false); setSavedNotice(false); }, [customerId]);
  useEffect(() => {
    if (!savedNotice) return;
    const timer = window.setTimeout(() => setSavedNotice(false), 5000);
    return () => window.clearTimeout(timer);
  }, [savedNotice]);

  // Leaving the edit form with unsaved changes asks first.
  const guard = (action: () => void) => {
    if (editing && dirty) { setPendingLeave(() => action); return; }
    setEditing(false);
    action();
  };

  const currentIndex = allCustomerIds.indexOf(customerId);
  const prevId = currentIndex > 0 ? allCustomerIds[currentIndex - 1] : null;
  const nextId = currentIndex < allCustomerIds.length - 1 ? allCustomerIds[currentIndex + 1] : null;

  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-slate-400 space-y-2">
        <p className="text-sm">Customer not found.</p>
        <button onClick={onBack} className="text-sm text-[#0078C1] hover:underline">← Back to Customers</button>
      </div>
    );
  }

  const visibleTabs = ALL_TABS.filter(t => !t.roles || t.roles.includes(currentUserRole));

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div className="space-y-5">
            {/* Hero card */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#1F3864] to-[#0078C1] flex items-center justify-center shrink-0">
                  <Building2 className="w-7 h-7 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-xl font-black text-slate-900">{customer.name}</span>
                    <span className="px-2.5 py-1 rounded-md font-black text-xs border bg-slate-100 text-slate-700 border-slate-200">{customer.id}</span>
                  </div>
                  <p className="text-xs text-slate-500">{customer.city}</p>
                </div>
                {canEdit && !editing && (
                  <button
                    type="button"
                    onClick={() => { setSavedNotice(false); setEditing(true); }}
                    className="inline-flex min-h-9 shrink-0 items-center gap-1.5 self-start rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition-colors hover:border-[#0078C1] hover:text-[#0078C1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                  >
                    <Pencil aria-hidden="true" className="h-3.5 w-3.5" /> Edit customer
                  </button>
                )}
              </div>
            </div>

            <div role="status" aria-live="polite">
              {savedNotice && (
                <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                  <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0" />
                  Changes saved. The reason was added to the Audit Trail.
                </p>
              )}
            </div>

            {editing ? (
              <CustomerEditForm
                key={`${customer.id}-${formKey}`}
                customer={customer}
                onDirtyChange={handleDirtyChange}
                onCancel={() => guard(() => {})}
                onSaved={() => { setEditing(false); setDirty(false); setSavedNotice(true); }}
                onReloadLatest={async () => {
                  await queryClient.refetchQueries({ queryKey: CUSTOMERS_QUERY_KEY });
                  setFormKey(k => k + 1);
                }}
              />
            ) : (<>
            {/* Contact grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {([
                { label: 'Contact Person', value: customer.contact_person, Icon: User },
                { label: 'Phone',          value: customer.phone,          Icon: Phone },
                { label: 'Email',          value: customer.email,          Icon: Mail },
                { label: 'City',           value: customer.city,           Icon: MapPin },
              ] as const).map(row => (
                <div key={row.label} className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm flex items-start gap-3">
                  <row.Icon className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-0.5">{row.label}</p>
                    <p className="text-sm font-semibold text-slate-800">{row.value}</p>
                  </div>
                </div>
              ))}

              <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm flex items-start gap-3 sm:col-span-2">
                <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-0.5">Address</p>
                  <p className="text-sm font-semibold text-slate-800">{customer.address}, {customer.city}</p>
                </div>
              </div>
            </div>

            {/* Audit fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: 'Created By',   value: customer.created_by },
                { label: 'Created At',   value: formatTs(customer.created_at) },
                { label: 'Modified By',  value: customer.modified_by },
                { label: 'Modified At',  value: formatTs(customer.modified_at) },
              ].map(row => (
                <div key={row.label} className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-0.5">{row.label}</p>
                  <p className="text-sm font-semibold text-slate-800">{row.value}</p>
                </div>
              ))}
            </div>
            </>)}
          </div>
        );

      case 'documents':
        return <ScaffoldTab icon={Paperclip} label="Documents & Attachments" />;

      case 'audit':
        if (!canEdit) {
          return (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
              <Lock className="w-8 h-8 text-slate-300" />
              <p className="text-sm">The Audit Trail is available to Sales Coordinators, Logistics and Admins.</p>
            </div>
          );
        }
        return <CustomerAuditTrail customerId={customer.id} />;

      default:
        return null;
    }
  };

  return (
    <div className="space-y-4" id="customer-workspace">
      {/* Navigation bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => guard(onBack)}
            className="flex items-center gap-1.5 text-[#0078C1] hover:text-[#1F3864] text-xs font-semibold transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Customers
          </button>
          <span className="text-slate-300">/</span>
          <span className="font-bold text-slate-700 text-sm truncate">{customer.name}</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => prevId && guard(() => onNavigateToCustomer(prevId))}
            disabled={!prevId}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-semibold text-slate-600"
            title="Previous Customer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Prev
          </button>
          <span className="text-[11px] text-slate-400 px-1 hidden sm:inline">
            {currentIndex + 1} / {allCustomerIds.length}
          </span>
          <button
            onClick={() => nextId && guard(() => onNavigateToCustomer(nextId))}
            disabled={!nextId}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-semibold text-slate-600"
            title="Next Customer"
          >
            Next
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tab Navigation + Content */}
      {/* overflow-clip keeps the rounded corners without breaking the sticky save bar */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-clip">
        <div className="border-b border-slate-200 overflow-x-auto">
          <div className="flex items-stretch min-w-max">
            {visibleTabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => { if (tab.id !== activeTab) guard(() => setActiveTab(tab.id)); }}
                  className={`flex items-center gap-2 px-5 py-4 text-sm whitespace-nowrap border-b-[3px] transition-all ${
                    isActive
                      ? 'border-[#1F3864] text-[#1F3864] bg-blue-50/70 font-semibold'
                      : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100 font-medium'
                  }`}
                >
                  <Icon className="w-[18px] h-[18px] shrink-0" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-5">
          {renderTabContent()}
        </div>
      </div>

      <ActionDialog
        open={pendingLeave !== null}
        title="Discard unsaved changes?"
        description="Your edits to this customer haven't been saved. If you leave now, they'll be lost."
        confirmLabel="Discard changes"
        destructive
        onDismiss={() => setPendingLeave(null)}
        onConfirm={() => {
          const action = pendingLeave;
          setPendingLeave(null);
          setEditing(false);
          setDirty(false);
          action?.();
        }}
      />
    </div>
  );
}
