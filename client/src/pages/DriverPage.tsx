import React from 'react';
import DriverView from '@/features/drivers/DriverView';
import { DeliveryRecord, OutputActionConfig, OutputActionTrigger } from '@/types';

export interface DriverPageProps {
  records: DeliveryRecord[];
  onUpdateRecord: (id: string, updates: Partial<DeliveryRecord>) => Promise<void>;
  currentUserName: string;
  outputActionConfigs: Record<OutputActionTrigger, OutputActionConfig>;
  onNavigate: (screen: string, item_id?: string) => void;
}

export const DriverPage: React.FC<DriverPageProps> = ({
  records,
  onUpdateRecord,
  currentUserName,
  outputActionConfigs,
  onNavigate,
}) => {
  return (
    <DriverView
      records={records}
      onUpdateRecord={onUpdateRecord}
      currentUserName={currentUserName}
      outputActionConfigs={outputActionConfigs}
      onNavigate={onNavigate}
    />
  );
};

export default DriverPage;
