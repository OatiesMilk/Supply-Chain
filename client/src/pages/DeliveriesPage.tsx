import React from 'react';
import DeliveryRecordsView from '@/features/deliveries/DeliveryRecordsView';
import {
  DeliveryRecord,
  DeliveryCategory,
  UserRole,
  OutputActionConfig,
  OutputActionTrigger,
} from '@/types';
import { ApiCompany } from '@/api';

export interface DeliveriesPageProps {
  category?: DeliveryCategory;
  records: DeliveryRecord[];
  companies: ApiCompany[];
  currentUserRole: UserRole;
  currentUserName: string;
  onCreateRecord: (data: any) => Promise<void>;
  onUpdateRecord: (id: string, updates: Partial<DeliveryRecord>) => Promise<void>;
  onVerifyCollection?: (id: string) => Promise<void>;
  outputActionConfigs: Record<OutputActionTrigger, OutputActionConfig>;
  onUpdateOutputActionConfig: (trigger: OutputActionTrigger, patch: Partial<OutputActionConfig>) => void;
  selectedRecordIdFromDashboard: string | null;
  clearSelectedRecordId: () => void;
  onRefresh: () => Promise<void>;
}

const TITLE_MAP: Record<string, { title: string; subtitle: string }> = {
  'Deliveries': {
    title: 'Deliveries (Delivery Scheduling)',
    subtitle: 'Schedule and track outbound deliveries to merchant customers.',
  },
  'RMA': {
    title: 'RMA (Returns / Pull-out)',
    subtitle: 'Manage returns, defective unit pull-outs, and replacement drop-offs.',
  },
  'Accounting Collection': {
    title: 'Accounting Collection',
    subtitle: 'Track billing statement and payment collection runs.',
  },
  'Procurement Pick-up': {
    title: 'Procurement Pick-up',
    subtitle: 'Track supplier pick-up runs feeding inbound stock.',
  },
  'Sales Orders': {
    title: 'Sales Orders',
    subtitle: 'B2B merchant sales orders queued for fulfillment.',
  },
};

export const DeliveriesPage: React.FC<DeliveriesPageProps> = ({
  category = 'Deliveries',
  records,
  companies,
  currentUserRole,
  currentUserName,
  onCreateRecord,
  onUpdateRecord,
  onVerifyCollection,
  outputActionConfigs,
  onUpdateOutputActionConfig,
  selectedRecordIdFromDashboard,
  clearSelectedRecordId,
  onRefresh,
}) => {
  const baseMeta = TITLE_MAP[category] || {
    title: 'Deliveries',
    subtitle: 'Outbound order operations',
  };

  const meta =
    category === 'RMA' && currentUserRole === 'Logistics'
      ? {
          title: 'RMA (Returns / Pull-out)',
          subtitle:
            'View returns and pull-out records (read-only — driver assignment not available for Logistics on this screen).',
        }
      : baseMeta;

  return (
    <DeliveryRecordsView
      category={category}
      title={meta.title}
      subtitle={meta.subtitle}
      records={records}
      companies={companies}
      currentUserRole={currentUserRole}
      currentUserName={currentUserName}
      onCreateRecord={onCreateRecord}
      onUpdateRecord={onUpdateRecord}
      onVerifyCollection={onVerifyCollection}
      outputActionConfigs={outputActionConfigs}
      onUpdateOutputActionConfig={onUpdateOutputActionConfig}
      selectedRecordIdFromDashboard={selectedRecordIdFromDashboard}
      clearSelectedRecordId={clearSelectedRecordId}
      onRefresh={onRefresh}
    />
  );
};

export default DeliveriesPage;
