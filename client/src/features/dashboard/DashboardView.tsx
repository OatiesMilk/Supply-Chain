import type { Product, InventoryItem, DeliveryRecord } from '@/types';
import type { ApiDashboardStats } from '@/api';
import type { DashboardFilterId } from '@/utils/dashboardFilters';
import OperationalDashboard from './OperationalDashboard';

interface DashboardViewProps {
  products: Product[];
  inventory: InventoryItem[];
  deliveryRecords: DeliveryRecord[];
  dashboardStats?: ApiDashboardStats | null;
  onNavigate: (screen: string, item_id?: string, dashboardFilterId?: DashboardFilterId) => void;
  currentUserRole: string;
  onRefresh?: () => void;
}

export default function DashboardView({ onNavigate }: DashboardViewProps) {
  return <OperationalDashboard onNavigate={onNavigate} />;
}
