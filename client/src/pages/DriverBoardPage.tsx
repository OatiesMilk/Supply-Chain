import React from 'react';
import DriverBoard from '@/features/drivers/DriverBoard';
import { DeliveryRecord } from '@/types';

export interface DriverBoardPageProps {
  records: DeliveryRecord[];
  onNavigate: (screen: string, item_id?: string) => void;
  onUpdateRecord: (id: string, updates: Partial<DeliveryRecord>) => Promise<void>;
  currentUserName: string;
}

export const DriverBoardPage: React.FC<DriverBoardPageProps> = ({
  records,
  onNavigate,
  onUpdateRecord,
  currentUserName,
}) => {
  return (
    <DriverBoard
      serverPaging
      records={records}
      onNavigate={onNavigate}
      onUpdateRecord={onUpdateRecord}
      currentUserName={currentUserName}
    />
  );
};

export default DriverBoardPage;
