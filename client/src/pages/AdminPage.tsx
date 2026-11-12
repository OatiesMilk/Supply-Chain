import React from 'react';
import AdminPanel from '@/features/admin/AdminPanel';
import { DashboardFilterId } from '@/utils/dashboardFilters';

interface AdminPageProps {
  dashboardFilterId: DashboardFilterId | null;
  clearDashboardFilter: () => void;
}

export const AdminPage: React.FC<AdminPageProps> = ({ dashboardFilterId, clearDashboardFilter }) => {
  return <AdminPanel dashboardFilterId={dashboardFilterId} clearDashboardFilter={clearDashboardFilter} />;
};

export default AdminPage;
