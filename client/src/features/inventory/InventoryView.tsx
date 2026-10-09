import React, { useState, useEffect, useRef } from 'react';
import Pagination, { DEFAULT_PAGE_SIZE } from '@/components/Pagination';
import { Search, Filter } from 'lucide-react';
import { ApiSku } from '@/api';
import SkuWorkspace from '@/features/inventory/SkuWorkspace';
import ExportMenu from '@/components/ExportMenu';
import { SKU_COLUMNS, fmtCurrency } from '@/utils/export';

interface InventoryViewProps {
  skus: ApiSku[];
  currentUserRole: string;
  currentUserName: string;
  onRefresh: () => void;
  selectedProductIdFromDashboard?: string | null;
  clearSelectedProductId: () => void;
}

export default function InventoryView({
  skus,
  currentUserRole,
  currentUserName,
  onRefresh,
  selectedProductIdFromDashboard,
  clearSelectedProductId
}: InventoryViewProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [searchTerm, setSearchTerm] = useState('');
  const [appliedSearchTerm, setAppliedSearchTerm] = useState('');
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [warehouseFilter, setWarehouseFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedSkuId, setSelectedSkuId] = useState<string | null>(
    selectedProductIdFromDashboard ?? null
  );

  useEffect(() => {
    if (searchTerm === appliedSearchTerm) return;

    searchTimeoutRef.current = setTimeout(() => {
      setAppliedSearchTerm(searchTerm);
      setPage(1);
      searchTimeoutRef.current = null;
    }, 300);

    return () => {
      if (searchTimeoutRef.current !== null) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
    };
  }, [searchTerm, appliedSearchTerm]);

  // Sync dashboard navigation into local selection
  useEffect(() => {
    if (selectedProductIdFromDashboard) {
      setSelectedSkuId(selectedProductIdFromDashboard);
    }
  }, [selectedProductIdFromDashboard]);

  const handleBackToList = () => {
    setSelectedSkuId(null);
    clearSelectedProductId();
  };

  const handleNavigateToSku = (id: string) => {
    setSelectedSkuId(id);
  };

  // If a SKU is selected, render the full-page workspace
  if (selectedSkuId) {
    return (
      <SkuWorkspace
        skuId={selectedSkuId}
        allSkuIds={skus.map(s => s.id)}
        currentUserRole={currentUserRole}
        currentUserName={currentUserName}
        onBack={handleBackToList}
        onRefresh={onRefresh}
        onNavigateToSku={handleNavigateToSku}
      />
    );
  }

  // Unique warehouse zone prefixes for filter
  const uniqueBins = Array.from(
    new Set(
      skus
        .filter(s => s.inventory)
        .map(s => s.inventory!.warehouse_location.split('-')[0])
    )
  );

  // Filter SKUs
  const filteredSkus = skus.filter(sku => {
    const matchesSearch =
      sku.sku_code.toLowerCase().includes(appliedSearchTerm.toLowerCase()) ||
      sku.name.toLowerCase().includes(appliedSearchTerm.toLowerCase()) ||
      sku.description.toLowerCase().includes(appliedSearchTerm.toLowerCase());

    const matchesCategory = categoryFilter === 'ALL' || sku.category === categoryFilter;

    const matchesWarehouse =
      warehouseFilter === 'ALL' ||
      (sku.inventory?.warehouse_location ?? '').startsWith(warehouseFilter);

    const atp = sku.inventory?.atp ?? 0;
    const onHand = sku.inventory?.on_hand_qty ?? 0;
    let stockStatus = 'In Stock';
    if (onHand <= 0) {
      stockStatus = 'Out of Stock';
    } else if (atp <= sku.reorder_point) {
      stockStatus = 'Low Stock';
    }
    const matchesStatus = statusFilter === 'ALL' || stockStatus === statusFilter;

    return matchesSearch && matchesCategory && matchesWarehouse && matchesStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filteredSkus.length / pageSize));
  // Keep rows and pagination in sync if refreshed data shrinks the result set.
  const currentPage = Math.max(1, Math.min(page, totalPages));

  return (
    <div className="space-y-4" id="inventory-view-container">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        {/* Filters */}
        <div className="p-4 border-b border-slate-200 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search SKU code, product name, or description..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-[#1F3864] focus:bg-white transition-all font-mono"
              />
            </div>
            {(currentUserRole === 'Admin' || currentUserRole === 'Logistics') && (
              <ExportMenu
                rows={filteredSkus.map(sku => ({
                  sku_code: sku.sku_code,
                  name: sku.name,
                  category: sku.category,
                  unit_cost_fmt: fmtCurrency(sku.unit_cost),
                  unit_price_fmt: fmtCurrency(sku.unit_price),
                  reorder_point: sku.reorder_point,
                  on_hand_qty: sku.inventory?.on_hand_qty ?? 0,
                  allocated_qty: sku.inventory?.allocated_qty ?? 0,
                  atp: sku.inventory?.atp ?? 0,
                  warehouse_location: sku.inventory?.warehouse_location ?? '',
                  description: sku.description,
                  created_by: sku.created_by,
                  modified_by: sku.modified_by,
                }))}
                columns={SKU_COLUMNS}
                sheetName="SKU Master"
                filename="sku-master"
                pdfTitle="SKU Master Report"
                showPdf={true}
                pdfPortrait={false}
                meta={{
                  reportName: 'SKU Master Export',
                  generatedByName: currentUserName,
                  generatedByRole: currentUserRole,
                }}
              />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400 font-bold uppercase tracking-widest text-[9px] flex items-center gap-1 mr-1">
              <Filter className="w-3.5 h-3.5" /> Filters:
            </span>

            <select
              value={categoryFilter}
              onChange={e => { setCategoryFilter(e.target.value); setPage(1); }}
              className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-600 focus:outline-none text-xs font-medium"
            >
              <option value="ALL">All Categories (A / B / C)</option>
              <option value="A">Category A (High Cost)</option>
              <option value="B">Category B (Medium Cost)</option>
              <option value="C">Category C (Consumables)</option>
            </select>

            <select
              value={warehouseFilter}
              onChange={e => { setWarehouseFilter(e.target.value); setPage(1); }}
              className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-600 focus:outline-none text-xs font-medium"
            >
              <option value="ALL">All Bins</option>
              {uniqueBins.map(bin => (
                <option key={bin} value={bin}>Warehouse Zone {bin}</option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-600 focus:outline-none text-xs font-medium"
            >
              <option value="ALL">All Stock Statuses</option>
              <option value="In Stock">In Stock</option>
              <option value="Low Stock">Low Stock</option>
              <option value="Out of Stock">Out of Stock</option>
            </select>

            {(searchTerm || appliedSearchTerm || categoryFilter !== 'ALL' || warehouseFilter !== 'ALL' || statusFilter !== 'ALL') && (
              <button
                onClick={() => {
                  if (searchTimeoutRef.current !== null) {
                    clearTimeout(searchTimeoutRef.current);
                    searchTimeoutRef.current = null;
                  }
                  setSearchTerm('');
                  setAppliedSearchTerm('');
                  setCategoryFilter('ALL');
                  setWarehouseFilter('ALL');
                  setStatusFilter('ALL');
                  setPage(1);
                }}
                className="text-[#1F3864] hover:underline font-bold uppercase text-[10px]"
              >
                Clear All
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                <th className="px-4 py-3">SKU Code</th>
                <th className="px-4 py-3">Product Name</th>
                <th className="px-4 py-3 text-right">On Hand</th>
                <th className="px-4 py-3 text-right">Allocated</th>
                <th className="px-4 py-3 text-right">ATP</th>
                <th className="px-4 py-3 text-right">Reorder Pt</th>
                <th className="px-4 py-3 text-right">Unit Cost</th>
                <th className="px-4 py-3 text-center">Bin</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSkus.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                    No matching SKU inventory entries found. Try adjusting your filters.
                  </td>
                </tr>
              ) : (
                filteredSkus.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(sku => {
                  const inv = sku.inventory;
                  const atp = inv?.atp ?? 0;
                  const onHand = inv?.on_hand_qty ?? 0;

                  let statusLabel = 'In Stock';
                  let statusColor = 'bg-green-50 text-green-700 border-green-200';
                  if (onHand <= 0) {
                    statusLabel = 'Out of Stock';
                    statusColor = 'bg-red-50 text-red-700 border-red-200';
                  } else if (atp <= sku.reorder_point) {
                    statusLabel = 'Low Stock';
                    statusColor = 'bg-amber-50 text-amber-700 border-amber-200';
                  }

                  return (
                    <tr
                      key={sku.id}
                      className="hover:bg-blue-50/40 cursor-pointer transition-all"
                      onClick={() => setSelectedSkuId(sku.id)}
                    >
                      <td className="px-4 py-3.5 font-mono text-slate-500 tracking-tight">{sku.sku_code}</td>
                      <td className="px-4 py-3.5 font-bold text-slate-800 max-w-[160px] sm:max-w-xs truncate">{sku.name}</td>
                      <td className="px-4 py-3.5 text-right text-slate-800 font-semibold tabular-nums">{onHand}</td>
                      <td className="px-4 py-3.5 text-right text-amber-600 font-semibold tabular-nums">{inv?.allocated_qty ?? 0}</td>
                      <td className="px-4 py-3.5 text-right text-slate-800 font-semibold tabular-nums">{atp}</td>
                      <td className="px-4 py-3.5 text-right text-slate-500 tabular-nums">{sku.reorder_point}</td>
                      <td className="px-4 py-3.5 text-right text-slate-600 tabular-nums">₱{sku.unit_cost.toLocaleString()}</td>
                      <td className="px-4 py-3.5 text-center font-mono text-slate-500 text-xs tracking-tight">{inv?.warehouse_location ?? '—'}</td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold tracking-wide inline-block ${statusColor}`}>
                          {statusLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-100">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredSkus.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            pageSizeOptions={[10, 25, 50, 100]}
          />
          <div className="p-3 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-400 flex justify-end">
            <span>Available to Promise (ATP) = On-Hand − Allocated</span>
          </div>
        </div>
      </div>
    </div>
  );
}
