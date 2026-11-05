import { usePermissions } from '@/hooks/usePermissions';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { Supplier, DeliveryRecord, CreateSupplierInput } from '@/types';
import SupplierWorkspace from './SupplierWorkspace';
import CreateSupplierForm from './CreateSupplierForm';
import { SupplierCategoryTags, SupplierCategoryManager, useCanManageSupplierCategories } from './SupplierCategories';
import { useSupplierCategoriesQuery } from '@/api/queries/useSuppliersQuery';
import ExportMenu from '@/components/ExportMenu';
import Pagination, { DEFAULT_PAGE_SIZE } from '@/components/Pagination';
import { SUPPLIER_COLUMNS } from '@/utils/export';
import { api } from '@/api';
import { useSupplierPickupCountsQuery } from '@/api/queries/useOperationalViews';

interface Props {
  suppliers: Supplier[];
  deliveryRecords: DeliveryRecord[];
  currentUserRole?: string;
  currentUserName?: string;
  onCreateSupplier: (data: CreateSupplierInput) => Promise<void>;
}
export function filterSuppliers(suppliers: Supplier[], categoryId: string) {
  return categoryId ? suppliers.filter(supplier => categoryId === '__uncategorized'
    ? !supplier.categories.length : supplier.categories.some(category => category.id === categoryId)) : suppliers;
}
export function supplierExportRows(suppliers: Supplier[], counts: Map<string, number>) {
  return suppliers.map(supplier => ({ id: supplier.id, name: supplier.name, contact_person: supplier.contact_person,
    email: supplier.email, phone: supplier.phone, city: supplier.city, address: supplier.address,
    categories: supplier.categories.map(category => category.name).join('; ') || supplier.category,
    pickup_count: counts.get(supplier.id) ?? null }));
}
export default function SuppliersView({ suppliers, currentUserRole = '', currentUserName = '', onCreateSupplier }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const access = usePermissions();
  const canManage = useCanManageSupplierCategories();
  const categories = useSupplierCategoriesQuery(access.canResource('suppliers'));
  const filtered = filterSuppliers(suppliers, categoryId);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageSuppliers = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const counts = useSupplierPickupCountsQuery(access.canResource('records') ? pageSuppliers.map(supplier => supplier.id) : []);
  const pickupCounts = new Map(counts.data?.map(row => [row.id, row.count]));
  const canCreate = currentUserRole !== 'TASS' && access.canWrite('suppliers') && access.canResource('suppliers', 'CREATE');
  const activeSupplier = suppliers.find(supplier => supplier.id === selectedId);
  if (selectedId && activeSupplier) return <SupplierWorkspace key={selectedId} supplier={activeSupplier}
    allSupplierIds={filtered.map(supplier => supplier.id)} deliveryRecords={[]} pickupCount={pickupCounts.get(activeSupplier.id)}
    onBack={() => setSelectedId(null)} onNavigateToSupplier={setSelectedId} />;
  return <div className="space-y-4">
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div><h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Supplier Registry</h4>
          <p className="text-xs text-slate-500 mt-1">{filtered.length} of {suppliers.length} suppliers</p></div>
        <div className="flex flex-wrap items-center gap-2">
          {canManage && <button type="button" onClick={() => setShowCategories(true)} className="border border-slate-300 text-xs font-bold px-3 py-2 rounded-lg">Manage Categories</button>}
          {canCreate && <button type="button" onClick={() => setShowCreate(true)} className="flex items-center gap-1 bg-[#1F3864] text-white text-xs font-bold px-3 py-2 rounded-lg"><Plus className="w-4 h-4" />New Supplier</button>}
          <ExportMenu rows={supplierExportRows(filtered, pickupCounts)} totalCount={filtered.length}
            fetchExportData={async () => {
              const all = new Map<string, number>();
              if (access.canResource('records')) for (let offset = 0; offset < filtered.length; offset += 100) {
                for (const row of await api.getSupplierPickupCounts(filtered.slice(offset, offset + 100).map(supplier => supplier.id))) all.set(row.id, row.count);
              }
              return { rows: supplierExportRows(filtered, all) };
            }} columns={SUPPLIER_COLUMNS} sheetName="Suppliers" filename="suppliers" pdfTitle="Supplier Directory" showPdf pdfPortrait={false}
            meta={{ reportName: `Supplier Directory Export — ${categories.data?.find(category => category.id === categoryId)?.name ?? (categoryId ? 'Uncategorized' : 'All categories')}`,
              generatedByName: currentUserName, generatedByRole: currentUserRole }} />
        </div>
      </div>
      <div className="p-4"><label className="text-xs font-semibold">Filter by category
        <select className="ml-2 border border-slate-300 rounded-lg p-2" value={categoryId} onChange={event => { setCategoryId(event.target.value); setPage(1); }}>
          <option value="">All categories</option><option value="__uncategorized">Uncategorized</option>
          {categories.data?.map(category => <option key={category.id} value={category.id}>{category.name}{category.is_active ? '' : ' (inactive)'}</option>)}
        </select></label>
        {categories.error && <p role="alert" className="text-sm text-red-700">Category catalog unavailable. <button type="button" onClick={() => void categories.refetch()}>Retry</button></p>}
      </div>
      {counts.error && <p role="alert" className="px-4 py-2 text-sm text-red-700">Pick-up counts unavailable. <button type="button" className="underline" onClick={() => void counts.refetch()}>Retry</button></p>}
      <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr className="bg-slate-100 border-b border-slate-200 text-xs text-slate-500 uppercase">
          {['Supplier ID', 'Supplier Name', 'Contact Person', 'City', 'Categories', 'Pick-ups'].map(label => <th key={label} className="px-4 py-3">{label}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-slate-100">{pageSuppliers.map(supplier => <tr key={supplier.id} className="hover:bg-blue-50/40">
          <td className="px-4 py-3 font-mono text-xs">{supplier.id}</td>
          <td className="px-4 py-3"><button type="button" onClick={() => setSelectedId(supplier.id)} className="font-semibold text-[#0078C1] text-left hover:underline">{supplier.name}</button><div className="text-xs text-slate-500">{supplier.email}</div></td>
          <td className="px-4 py-3">{supplier.contact_person}</td><td className="px-4 py-3">{supplier.city}</td>
          <td className="px-4 py-3"><SupplierCategoryTags supplier={supplier} /></td><td className="px-4 py-3">{pickupCounts.get(supplier.id) ?? '—'}</td>
        </tr>)}{!pageSuppliers.length && <tr><td colSpan={6} className="p-8 text-center text-slate-500">No suppliers match this category.</td></tr>}</tbody>
      </table></div>
      <Pagination currentPage={safePage} totalPages={totalPages} totalItems={filtered.length} pageSize={pageSize} onPageChange={setPage}
        onPageSizeChange={size => { setPageSize(size); setPage(1); }} pageSizeOptions={[10, 25, 50, 100]} />
    </div>
    {showCreate && <CreateSupplierForm onSave={onCreateSupplier} onClose={() => setShowCreate(false)} />}
    {showCategories && canManage && <SupplierCategoryManager onClose={() => setShowCategories(false)} />}
  </div>;
}
