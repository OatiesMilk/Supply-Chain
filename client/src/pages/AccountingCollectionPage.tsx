import React from 'react';
import AccountingCollectionView from '@/features/accounting/AccountingCollectionView';
import { DeliveryRecord, UserRole } from '@/types';
import { ApiCompany } from '@/api';

export interface AccountingCollectionPageProps {
  records: DeliveryRecord[];
  companies: ApiCompany[];
  currentUserRole: UserRole;
  currentUserName: string;
  onCreateRecord: (data: any) => Promise<void>;
  onUpdateRecord: (id: string, updates: Partial<DeliveryRecord>) => Promise<void>;
  onVerifyCollection: (id: string) => Promise<void>;
  selectedRecordIdFromDashboard: string | null;
  clearSelectedRecordId: () => void;
}

export const AccountingCollectionPage: React.FC<AccountingCollectionPageProps> = ({
  records,
  companies,
  currentUserRole,
  currentUserName,
  onCreateRecord,
  onUpdateRecord,
  onVerifyCollection,
  selectedRecordIdFromDashboard,
  clearSelectedRecordId,
}) => {
  const collectionRecords = records.filter(r => r.category === 'Accounting Collection');

  return (
    <AccountingCollectionView
      records={collectionRecords}
      companies={companies}
      currentUserRole={currentUserRole}
      currentUserName={currentUserName}
      onCreateRecord={onCreateRecord}
      onUpdateRecord={onUpdateRecord}
      onVerifyCollection={onVerifyCollection}
      selectedRecordIdFromDashboard={selectedRecordIdFromDashboard}
      clearSelectedRecordId={clearSelectedRecordId}
    />
  );
};

export default AccountingCollectionPage;
