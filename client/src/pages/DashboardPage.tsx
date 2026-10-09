import React from 'react';
import DashboardView from '@/features/dashboard/DashboardView';
import { Product, InventoryItem, DeliveryRecord, UserRole } from '@/types';
import { ApiSku, ApiDashboardStats } from '@/api';
import { DashboardFilterId } from '@/utils/dashboardFilters';

export interface DashboardPageProps {
  products: ApiSku[];
  deliveryRecords: DeliveryRecord[];
  dashboardStats: ApiDashboardStats | null;
  onNavigate: (screen: string, item_id?: string, dashboardFilterId?: DashboardFilterId) => void;
  currentUserRole: UserRole;
  onRefresh: () => Promise<void>;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  products,
  deliveryRecords,
  dashboardStats,
  onNavigate,
  currentUserRole,
  onRefresh,
}) => {
  const legacyProducts: Product[] = products.map(sku => ({
    id: sku.id,
    sku_code: sku.sku_code,
    name: sku.name,
    category: sku.category as 'A' | 'B' | 'C',
    unit_cost: sku.unit_cost,
    unit_price: sku.unit_price,
    reorder_point: sku.reorder_point,
    description: sku.description,
    created_by: sku.created_by,
    created_at: sku.created_at,
    modified_by: sku.modified_by,
    modified_at: sku.updated_at,
  }));

  const legacyInventory: InventoryItem[] = products
    .filter(sku => sku.inventory !== null)
    .map(sku => ({
      product_id: sku.id,
      warehouse_location: sku.inventory!.warehouse_location,
      on_hand_qty: sku.inventory!.on_hand_qty,
      allocated_qty: sku.inventory!.allocated_qty,
    }));

  return (
    <DashboardView
      products={legacyProducts}
      inventory={legacyInventory}
      deliveryRecords={deliveryRecords}
      dashboardStats={dashboardStats}
      onNavigate={onNavigate}
      currentUserRole={currentUserRole}
      onRefresh={onRefresh}
    />
  );
};

export default DashboardPage;
