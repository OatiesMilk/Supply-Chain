import React from 'react';
import SuppliersView from '@/features/suppliers/SuppliersView';
import { Supplier, DeliveryRecord, UserRole } from '@/types';
import { ApiSupplier } from '@/api';

export interface SuppliersPageProps {
  suppliers: ApiSupplier[];
  deliveryRecords: DeliveryRecord[];
  currentUserRole: UserRole;
  currentUserName: string;
  onCreateSupplier: (data: {
    name: string;
    contact_person?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    category?: string;
  }) => Promise<void>;
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
      suppliers={suppliers as unknown as Supplier[]}
      deliveryRecords={deliveryRecords}
      currentUserRole={currentUserRole}
      currentUserName={currentUserName}
      onCreateSupplier={onCreateSupplier}
    />
  );
};

export default SuppliersPage;
