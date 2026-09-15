import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ApiSku } from '../api';
import WarehouseWorkspace from './WarehouseWorkspace';
import ExportMenu from './ExportMenu';
import { WAREHOUSE_COLUMNS } from '../utils/export';

interface BinLocation {
  bin_code: string;
  zone: string;
  skus: ApiSku[];
}

interface Props {
  skus: ApiSku[];
  currentUserRole?: string;
  currentUserName?: string;
}

function buildBins(skus: ApiSku[]): BinLocation[] {
  const map = new Map<string, ApiSku[]>();
  for (const sku of skus) {
    if (!sku.inventory) continue;
    const bin = sku.inventory.warehouse_location;
    if (!map.has(bin)) map.set(bin, []);
    map.get(bin)!.push(sku);
  }
  return Array.from(map.entries())
    .map(([bin_code, binSkus]) => ({
      bin_code,
      zone: bin_code.split('-')[1]?.[0] ?? '?',
      skus: binSkus,
    }))
    .sort((a, b) => a.bin_code.localeCompare(b.bin_code));
}

export default function WarehousesView({ skus, currentUserRole = '', currentUserName = '' }: Props) {
  const bins = buildBins(skus);
  const [selectedBin, setSelectedBin] = useState<string | null>(null);

  const activeBin = bins.find(b => b.bin_code === selectedBin);

  if (selectedBin && activeBin) {
    return (
      <WarehouseWorkspace
        bin={activeBin}
        allBinCodes={bins.map(b => b.bin_code)}
        onBack={() => setSelectedBin(null)}
        onNavigateToBin={setSelectedBin}
      />
    );
  }

  const zones = Array.from(new Set(bins.map(b => b.zone))).sort();
  const totalLowStock = skus.filter(s => s.inventory && s.inventory.atp <= s.reorder_point).length;

  const exportRows = bins.flatMap(bin =>
    bin.skus.map(sku => ({
      bin_code: bin.bin_code,
      zone: bin.zone,
      sku_code: sku.sku_code,
      sku_name: sku.name,
      category: sku.category,
      on_hand_qty: sku.inventory?.on_hand_qty ?? 0,
      allocated_qty: sku.inventory?.allocated_qty ?? 0,
      atp: sku.inventory?.atp ?? 0,
      reorder_point: sku.reorder_point,
      low_stock: sku.inventory && sku.inventory.atp <= sku.reorder_point ? 'Yes' : 'No',
    }))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Warehouse & Inventory Locations</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Stock levels by bin location derived from SKU Master inventory. Click any bin to open the location workspace.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {totalLowStock > 0 && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs font-bold shrink-0">
              <AlertTriangle className="w-3.5 h-3.5" />
              {totalLowStock} low-stock SKU{totalLowStock !== 1 ? 's' : ''}
            </div>
          )}
          <ExportMenu
            rows={exportRows}
            columns={WAREHOUSE_COLUMNS}
            sheetName="Warehouse Inventory"
            filename="warehouse-inventory"
            pdfTitle="Warehouse & Inventory Locations"
            showPdf={false}
            meta={{
              reportName: 'Warehouse Inventory Export',
              generatedByName: currentUserName,
              generatedByRole: currentUserRole,
            }}
          />
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Bin Locations', value: bins.length },
          { label: 'Warehouse Zones',     value: zones.length },
          { label: 'Total SKUs Stored',   value: skus.filter(s => s.inventory).length },
          { label: 'Low Stock Alerts',    value: totalLowStock },
        ].map(stat => (
          <div key={stat.label} className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-0.5">{stat.label}</p>
            <p className={`text-2xl font-black ${stat.label === 'Low Stock Alerts' && stat.value > 0 ? 'text-red-600' : 'text-slate-800'}`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Bin table per zone */}
      {zones.map(zone => {
        const zoneBins = bins.filter(b => b.zone === zone);
        return (
          <div key={zone} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-[#1F3864] text-white flex items-center justify-center text-xs font-black">{zone}</span>
              <div>
                <h4 className="text-sm font-bold text-slate-800">Zone {zone}</h4>
                <p className="text-xs text-slate-500">{zoneBins.length} bin location{zoneBins.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                    <th className="px-4 py-3">Bin Code</th>
                    <th className="px-4 py-3 text-center">SKUs</th>
                    <th className="px-4 py-3 text-right">On Hand</th>
                    <th className="px-4 py-3 text-right">Allocated</th>
                    <th className="px-4 py-3 text-right">ATP</th>
                    <th className="px-4 py-3 text-center">Alerts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {zoneBins.map(bin => {
                    const lowCount = bin.skus.filter(s => s.inventory && s.inventory.atp <= s.reorder_point).length;
                    const totalOnHand = bin.skus.reduce((sum, s) => sum + (s.inventory?.on_hand_qty ?? 0), 0);
                    const totalAlloc = bin.skus.reduce((sum, s) => sum + (s.inventory?.allocated_qty ?? 0), 0);
                    const totalAtp   = bin.skus.reduce((sum, s) => sum + (s.inventory?.atp ?? 0), 0);
                    return (
                      <tr
                        key={bin.bin_code}
                        onClick={() => setSelectedBin(bin.bin_code)}
                        className={`cursor-pointer transition-all hover:bg-blue-50/40 ${lowCount > 0 ? 'bg-red-50/20' : ''}`}
                      >
                        <td className="px-4 py-3.5 font-mono font-black text-slate-900 text-sm tracking-tight">{bin.bin_code}</td>
                        <td className="px-4 py-3.5 text-center font-bold text-slate-700 text-sm">{bin.skus.length}</td>
                        <td className="px-4 py-3.5 text-right font-black text-slate-900 tabular-nums">{totalOnHand}</td>
                        <td className="px-4 py-3.5 text-right font-black text-amber-600 tabular-nums">{totalAlloc}</td>
                        <td className={`px-4 py-3.5 text-right font-black tabular-nums text-base ${lowCount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{totalAtp}</td>
                        <td className="px-4 py-3.5 text-center">
                          {lowCount > 0 ? (
                            <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full text-[11px] font-black">
                              <AlertTriangle className="w-3 h-3" /> {lowCount}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-xs font-semibold">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
