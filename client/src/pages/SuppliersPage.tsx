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
}

export const SuppliersPage: React.FC<SuppliersPageProps> = ({
  suppliers,
  deliveryRecords,
  currentUserRole,
  currentUserName,
  onCreateSupplier,
}) => {
  return (
    <SuppliersView
      suppliers={suppliers}
      deliveryRecords={deliveryRecords}
      currentUserRole={currentUserRole}
      currentUserName={currentUserName}
      onCreateSupplier={onCreateSupplier}
    />
  );
};

export default SuppliersPage;
