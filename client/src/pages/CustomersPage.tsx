import React from 'react';
import CustomersView from '@/features/customers/CustomersView';
import { Customer, DeliveryRecord, UserRole } from '@/types';
import { ApiCustomer } from '@/api';

export interface CustomersPageProps {
  customers: ApiCustomer[];
  deliveryRecords: DeliveryRecord[];
  currentUserRole: UserRole;
  currentUserName: string;
  onNavigate: (screen: string, item_id?: string) => void;
  onCreateCustomer: (data: {
    name: string;
    contact_person?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
  }) => Promise<void>;
}

export const CustomersPage: React.FC<CustomersPageProps> = ({
  customers,
  deliveryRecords,
  currentUserRole,
  currentUserName,
  onNavigate,
  onCreateCustomer,
}) => {
  return (
    <CustomersView
      customers={customers as unknown as Customer[]}
      deliveryRecords={deliveryRecords}
      currentUserRole={currentUserRole}
      currentUserName={currentUserName}
      onNavigate={onNavigate}
      onCreateCustomer={onCreateCustomer}
    />
  );
};

export default CustomersPage;
