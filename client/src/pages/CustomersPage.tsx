import React from 'react';
import CustomersView from '@/features/customers/CustomersView';
import { Customer, UserRole } from '@/types';
import { ApiCustomer } from '@/api';

export interface CustomersPageProps {
  customers: ApiCustomer[];
  currentUserRole: UserRole;
  currentUserName: string;
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
  currentUserRole,
  currentUserName,
  onCreateCustomer,
}) => {
  return (
    <CustomersView
      customers={customers as unknown as Customer[]}
      currentUserRole={currentUserRole}
      currentUserName={currentUserName}
      onCreateCustomer={onCreateCustomer}
    />
  );
};

export default CustomersPage;
