import { useState } from 'react';
import {
  ArrowLeft, ChevronLeft, ChevronRight,
  Package, Warehouse, AlertTriangle
} from 'lucide-react';
import { ApiSku } from '../api';

interface BinLocation {
  bin_code: string;
  zone: string;
  skus: ApiSku[];
}

interface Props {
  bin: BinLocation;
  allBinCodes: string[];
  onBack: () => void;
  onNavigateToBin: (code: string) => void;
}

type TabId = 'inventory' | 'alerts';

export default function WarehouseWorkspace({ bin, allBinCodes, onBack, onNavigateToBin }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('inventory');

  const currentIndex = allBinCodes.indexOf(bin.bin_code);
  const prevCode = currentIndex > 0 ? allBinCodes[currentIndex - 1] : null;
  const nextCode = currentIndex < allBinCodes.length - 1 ? allBinCodes[currentIndex + 1] : null;

  const lowStockSkus = bin.skus.filter(s => s.inventory && s.inventory.atp <= s.reorder_point);

  const tabs: { id: TabId; label: string; icon: typeof Package }[] = [
    { id: 'inventory', label: `Inventory (${bin.skus.length})`, icon: Package },
    { id: 'alerts',    label: `Low Stock Alerts (${lowStockSkus.length})`, icon: AlertTriangle },
  ];

  const totalOnHand  = bin.skus.reduce((sum, s) => sum + (s.inventory?.on_hand_qty ?? 0), 0);
  const totalAtp     = bin.skus.reduce((sum, s) => sum + (s.inventory?.atp ?? 0), 0);
  const totalAlloced = bin.skus.reduce((sum, s) => sum + (s.inventory?.allocated_qty ?? 0), 0);

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
            Warehouses
          </button>
          <span className="text-slate-300">/</span>
          <span className="font-mono font-black text-slate-700 text-sm">{bin.bin_code}</span>
          <span className="text-slate-400 text-xs hidden sm:inline">— Zone {bin.zone}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => prevCode && onNavigateToBin(prevCode)}
            disabled={!prevCode}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-semibold text-slate-600"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Prev
          </button>
          <span className="text-[11px] text-slate-400 px-1 hidden sm:inline">
            {currentIndex + 1} / {allBinCodes.length}
          </span>
          <button
            onClick={() => nextCode && onNavigateToBin(nextCode)}
            disabled={!nextCode}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-semibold text-slate-600"
          >
            Next <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'SKUs in Bin',    value: bin.skus.length,  color: 'text-slate-800' },
          { label: 'Total On Hand',  value: totalOnHand,      color: 'text-slate-800' },
          { label: 'Total Allocated',value: totalAlloced,     color: 'text-amber-600' },
          { label: 'Total ATP',      value: totalAtp,         color: lowStockSkus.length > 0 ? 'text-red-600' : 'text-emerald-600' },
        ].map(stat => (
          <div key={stat.label} className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-0.5">{stat.label}</p>
            <p className={`text-2xl font-black ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
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
                  <Icon className={`w-[18px] h-[18px] shrink-0 ${tab.id === 'alerts' && lowStockSkus.length > 0 ? 'text-red-500' : ''}`} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-5">
          {activeTab === 'inventory' && (
            bin.skus.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <Package className="w-10 h-10 text-slate-200" />
                <p className="text-sm text-slate-400">No SKUs assigned to this bin location.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                      <th className="px-4 py-3">SKU Code</th>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3 text-center">Cat</th>
                      <th className="px-4 py-3 text-right">On Hand</th>
                      <th className="px-4 py-3 text-right">Allocated</th>
                      <th className="px-4 py-3 text-right">ATP</th>
                      <th className="px-4 py-3 text-right">Reorder Pt.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bin.skus.map(sku => {
                      const isLow = sku.inventory && sku.inventory.atp <= sku.reorder_point;
                      return (
                        <tr key={sku.id} className={isLow ? 'bg-red-50/40' : ''}>
                          <td className="px-4 py-3.5 font-mono font-black text-slate-900 tracking-tight">{sku.sku_code}</td>
                          <td className="px-4 py-3.5 text-slate-700 font-medium max-w-[220px] truncate">{sku.name}</td>
                          <td className="px-4 py-3.5 text-center">
                            <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-bold">{sku.category}</span>
                          </td>
                          <td className="px-4 py-3.5 text-right font-black text-slate-900 tabular-nums">{sku.inventory?.on_hand_qty ?? '—'}</td>
                          <td className="px-4 py-3.5 text-right font-black text-amber-600 tabular-nums">{sku.inventory?.allocated_qty ?? '—'}</td>
                          <td className={`px-4 py-3.5 text-right font-black tabular-nums text-base ${isLow ? 'text-red-600' : 'text-emerald-600'}`}>
                            {sku.inventory?.atp ?? '—'}
                          </td>
                          <td className="px-4 py-3.5 text-right text-slate-500 font-semibold tabular-nums">{sku.reorder_point}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}

          {activeTab === 'alerts' && (
            lowStockSkus.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <Package className="w-10 h-10 text-slate-200" />
                <p className="text-sm text-slate-400">No low-stock alerts for this bin. All ATP levels are above reorder points.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-500 font-semibold">
                  {lowStockSkus.length} SKU{lowStockSkus.length !== 1 ? 's' : ''} at or below reorder point
                </p>
                {lowStockSkus.map(sku => (
                  <div key={sku.id} className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-black text-xs text-red-800">{sku.sku_code}</span>
                        <span className="text-xs text-red-700 font-semibold truncate">{sku.name}</span>
                      </div>
                      <p className="text-[10px] text-red-600 mt-0.5">
                        ATP: <strong>{sku.inventory?.atp}</strong> · Reorder Point: <strong>{sku.reorder_point}</strong> · On Hand: {sku.inventory?.on_hand_qty}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
