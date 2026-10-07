import { useState } from 'react';
import {
  ArrowLeft, ChevronLeft, ChevronRight, Building2,
  Shield, Lock, Phone, Mail, MapPin, User, Paperclip,
  ClipboardList, History, FolderOpen
} from 'lucide-react';
import { Customer } from '@/types';

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
  adminOnly?: boolean;
}

const ALL_TABS: TabDef[] = [
  { id: 'overview',  label: 'Overview',                icon: ClipboardList },
  { id: 'documents', label: 'Documents & Attachments', icon: FolderOpen    },
  { id: 'audit',     label: 'Audit Trail',             icon: History, adminOnly: true },
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
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const customer = customers.find(c => c.id === customerId);

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

  const visibleTabs = ALL_TABS.filter(t => !t.adminOnly || currentUserRole === 'Admin');

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
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-xl font-black text-slate-900">{customer.name}</span>
                    <span className="px-2.5 py-1 rounded-md font-black text-xs border bg-slate-100 text-slate-700 border-slate-200">{customer.id}</span>
                  </div>
                  <p className="text-xs text-slate-500">{customer.city}</p>
                </div>
              </div>
            </div>

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
          </div>
        );

      case 'documents':
        return <ScaffoldTab icon={Paperclip} label="Documents & Attachments" />;

      case 'audit':
        if (currentUserRole !== 'Admin') {
          return (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
              <Lock className="w-8 h-8 text-slate-300" />
              <p className="text-sm">Audit Trail access requires Admin role.</p>
            </div>
          );
        }
        return (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
              <Shield className="w-8 h-8 text-slate-300" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-700">No Server Audit Trail Available</h3>
              <p className="text-sm text-slate-400 mt-1 max-w-sm">
                Customer records are managed client-side and do not yet generate server audit entries.
                Connect the Customers module to the backend to enable audit trail tracking.
              </p>
            </div>
          </div>
        );

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
            onClick={onBack}
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
            onClick={() => prevId && onNavigateToCustomer(prevId)}
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
            onClick={() => nextId && onNavigateToCustomer(nextId)}
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
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 overflow-x-auto">
          <div className="flex items-stretch min-w-max">
            {visibleTabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-5 py-4 text-sm whitespace-nowrap border-b-[3px] transition-all ${
                    isActive
                      ? 'border-[#1F3864] text-[#1F3864] bg-blue-50/70 font-semibold'
                      : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100 font-medium'
                  }`}
                >
                  <Icon className="w-[18px] h-[18px] shrink-0" />
                  {tab.label}
                  {tab.adminOnly && (
                    <span className="text-[9px] font-black text-slate-400 uppercase ml-1">ADMIN</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-5">
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
}
