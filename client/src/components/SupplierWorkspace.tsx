import { useState } from 'react';
import {
  ArrowLeft, ChevronLeft, ChevronRight,
  FileText, Package, Truck, Building2, ClipboardList
} from 'lucide-react';
import { Supplier, DeliveryRecord } from '../types';

function formatTs(ts: string) {
  return new Date(ts).toLocaleString('en-PH', {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

const CATEGORY_COLOR: Record<string, string> = {
  'Electronics':  'bg-blue-50 text-blue-700 border-blue-200',
  'Hardware':     'bg-slate-100 text-slate-700 border-slate-200',
  'Consumables':  'bg-amber-50 text-amber-700 border-amber-200',
  'Packaging':    'bg-purple-50 text-purple-700 border-purple-200',
  'Services':     'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const STATUS_DOT: Record<string, string> = {
  Delivered:   'bg-emerald-500',
  Scheduled:   'bg-blue-500',
  Pending:     'bg-amber-500',
  'On-Hold':   'bg-red-500',
  Rescheduled: 'bg-purple-500',
};

interface Props {
  supplier: Supplier;
  allSupplierIds: string[];
  deliveryRecords: DeliveryRecord[];
  onBack: () => void;
  onNavigateToSupplier: (id: string) => void;
}

type TabId = 'general' | 'pickups';

export default function SupplierWorkspace({
  supplier, allSupplierIds, deliveryRecords, onBack, onNavigateToSupplier,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('general');

  const currentIndex = allSupplierIds.indexOf(supplier.id);
  const prevId = currentIndex > 0 ? allSupplierIds[currentIndex - 1] : null;
  const nextId = currentIndex < allSupplierIds.length - 1 ? allSupplierIds[currentIndex + 1] : null;

  // Procurement pick-ups related to this supplier (by name match in item_description / company_name)
  const relatedPickups = deliveryRecords.filter(r =>
    r.category === 'Procurement Pick-up' &&
    (r.item_description.toLowerCase().includes(supplier.name.toLowerCase()) ||
     r.company_name.toLowerCase().includes(supplier.name.toLowerCase()))
  );

  const tabs: { id: TabId; label: string; icon: typeof FileText }[] = [
    { id: 'general', label: 'General',         icon: ClipboardList },
    { id: 'pickups', label: `Procurement Pick-ups (${relatedPickups.length})`, icon: Truck },
  ];

  return (
    <div className="space-y-4">
      {/* Navigation bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-[#0078C1] hover:text-[#1F3864] text-xs font-semibold transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Suppliers
          </button>
          <span className="text-slate-300">/</span>
          <span className="font-mono font-black text-slate-700 text-sm truncate">{supplier.id}</span>
          <span className="text-slate-400 text-xs truncate hidden sm:inline">— {supplier.name}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => prevId && onNavigateToSupplier(prevId)}
            disabled={!prevId}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-semibold text-slate-600"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Prev
          </button>
          <span className="text-[11px] text-slate-400 px-1 hidden sm:inline">
            {currentIndex + 1} / {allSupplierIds.length}
          </span>
          <button
            onClick={() => nextId && onNavigateToSupplier(nextId)}
            disabled={!nextId}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-semibold text-slate-600"
          >
            Next <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tabs + Content */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 overflow-x-auto">
          <div className="flex items-stretch min-w-max">
            {tabs.map(tab => {
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
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-5">
          {activeTab === 'general' && (
            <div className="space-y-5 max-w-xl">
              {/* Header card */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="font-mono font-black text-lg text-slate-900">{supplier.id}</span>
                  <span className={`px-2.5 py-1 rounded-full border text-[10px] font-semibold ${CATEGORY_COLOR[supplier.category] ?? 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                    {supplier.category}
                  </span>
                </div>
                <p className="text-base font-extrabold text-slate-800">{supplier.name}</p>
              </div>

              {/* Contact details */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Contact Information</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-xs">
                  {[
                    { label: 'Contact Person', value: supplier.contact_person },
                    { label: 'Email',          value: supplier.email },
                    { label: 'Phone',          value: supplier.phone },
                    { label: 'City',           value: supplier.city },
                    { label: 'Address',        value: supplier.address },
                  ].map(row => (
                    <div key={row.label} className="flex flex-col gap-0.5 col-span-1">
                      <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">{row.label}</span>
                      <span className="font-semibold text-slate-800">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Audit */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { label: 'Created By',  value: supplier.created_by },
                  { label: 'Created At',  value: formatTs(supplier.created_at) },
                  { label: 'Modified By', value: supplier.modified_by },
                  { label: 'Updated At',  value: formatTs(supplier.modified_at) },
                ].map(row => (
                  <div key={row.label} className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-0.5">{row.label}</p>
                    <p className="text-sm font-semibold text-slate-800">{row.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'pickups' && (
            <div className="space-y-4">
              {relatedPickups.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                  <Package className="w-10 h-10 text-slate-200" />
                  <p className="text-sm text-slate-400">No procurement pick-ups linked to this supplier yet.</p>
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="divide-y divide-slate-100">
                    {relatedPickups.map(r => (
                      <div key={r.id} className="flex items-start gap-3 px-4 py-3.5">
                        <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[r.status] ?? 'bg-slate-300'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-0.5">
                            <span className="font-mono font-black text-xs text-slate-900">{r.id}</span>
                            <span className="text-[10px] text-slate-500">{r.status}</span>
                          </div>
                          <p className="text-xs font-semibold text-slate-700 truncate">{r.item_description}</p>
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {r.delivery_date} · {r.reference} · {r.driver || 'No driver'}
                          </p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold shrink-0 ${
                          r.priority === '3 - High' ? 'bg-red-50 text-red-700 border-red-200' :
                          r.priority === '2 - Moderate' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          'bg-slate-100 text-slate-600 border-slate-200'
                        }`}>{r.priority}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
