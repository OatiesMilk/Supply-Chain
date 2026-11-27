import React from 'react';
import AdminPanel from '@/features/admin/AdminPanel';
import { DashboardFilterId } from '@/utils/dashboardFilters';

interface AdminPageProps {
  dashboardFilterId: DashboardFilterId | null;
  clearDashboardFilter: () => void;
  /** Addition request opened from a notification or ?request= link (Feature 4b). */
  selectedAdditionRequestId?: string | null;
  clearSelectedAdditionRequestId?: () => void;
}

export const AdminPage: React.FC<AdminPageProps> = ({ dashboardFilterId, clearDashboardFilter, selectedAdditionRequestId = null, clearSelectedAdditionRequestId }) => {
  return <AdminPanel dashboardFilterId={dashboardFilterId} clearDashboardFilter={clearDashboardFilter}
    selectedAdditionRequestId={selectedAdditionRequestId} clearSelectedAdditionRequestId={clearSelectedAdditionRequestId} />;
};

export default AdminPage;
