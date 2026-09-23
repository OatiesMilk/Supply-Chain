import React from 'react';
import TransactionCenter from '@/features/transactions/TransactionCenter';
import { UserRole } from '@/types';

export interface TransactionCenterPageProps {
  currentUserRole: UserRole;
  currentUserName: string;
}

export const TransactionCenterPage: React.FC<TransactionCenterPageProps> = ({
  currentUserRole,
  currentUserName,
}) => {
  return (
    <TransactionCenter
      currentUserRole={currentUserRole}
      currentUserName={currentUserName}
    />
  );
};

export default TransactionCenterPage;
