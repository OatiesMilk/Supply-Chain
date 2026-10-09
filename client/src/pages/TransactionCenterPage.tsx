import React from 'react';
import TransactionCenter from '@/features/transactions/TransactionCenter';
import { UserRole } from '@/types';
import { DashboardFilterId } from '@/utils/dashboardFilters';

export interface TransactionCenterPageProps {
  currentUserRole: UserRole;
  currentUserName: string;
  dashboardFilterId: DashboardFilterId | null;
  clearDashboardFilter: () => void;
}

export const TransactionCenterPage: React.FC<TransactionCenterPageProps> = ({
  currentUserRole,
  currentUserName,
  dashboardFilterId,
  clearDashboardFilter,
}) => {
  return (
    <TransactionCenter
      currentUserRole={currentUserRole}
      currentUserName={currentUserName}
      dashboardFilterId={dashboardFilterId}
      clearDashboardFilter={clearDashboardFilter}
    />
  );
};

export default TransactionCenterPage;
