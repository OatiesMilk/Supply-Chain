import React from 'react';
import SuppliersView from '@/features/suppliers/SuppliersView';
import { DeliveryRecord, UserRole, CreateSupplierInput } from '@/types';
import { ApiSupplier } from '@/api';

export interface SuppliersPageProps {
  suppliers: ApiSupplier[];
  deliveryRecords: DeliveryRecord[];
  currentUserRole: UserRole;
  currentUserName: string;
  onCreateSupplier: (data: CreateSupplierInput) => Promise<void>;
  /** Addition request opened from a notification or ?request= link (Feature 4b). */
  selectedAdditionRequestId?: string | null;
  clearSelectedAdditionRequestId?: () => void;
}

export const SuppliersPage: React.FC<SuppliersPageProps> = ({
  suppliers,
  deliveryRecords,
  currentUserRole,
  currentUserName,
  onCreateSupplier,
  selectedAdditionRequestId = null,
  clearSelectedAdditionRequestId,
}) => {
  return (
    <SuppliersView
      suppliers={suppliers}
      deliveryRecords={deliveryRecords}
      currentUserRole={currentUserRole}
      currentUserName={currentUserName}
      onCreateSupplier={onCreateSupplier}
      selectedAdditionRequestId={selectedAdditionRequestId}
      clearSelectedAdditionRequestId={clearSelectedAdditionRequestId}
    />
  );
};

export default SuppliersPage;
