import React from 'react';
import InventoryView from '@/features/inventory/InventoryView';
import { UserRole } from '@/types';
import { ApiSku } from '@/api';

export interface InventoryPageProps {
  skus: ApiSku[];
  currentUserRole: UserRole;
  currentUserName: string;
  onRefresh: () => Promise<void>;
  selectedProductIdFromDashboard: string | null;
  clearSelectedProductId: () => void;
}

export const InventoryPage: React.FC<InventoryPageProps> = ({
  skus,
  currentUserRole,
  currentUserName,
  onRefresh,
  selectedProductIdFromDashboard,
  clearSelectedProductId,
}) => {
  return (
    <InventoryView
      skus={skus}
      currentUserRole={currentUserRole}
      currentUserName={currentUserName}
      onRefresh={onRefresh}
      selectedProductIdFromDashboard={selectedProductIdFromDashboard}
      clearSelectedProductId={clearSelectedProductId}
    />
  );
};

export default InventoryPage;
