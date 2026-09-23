import React from 'react';
import DataSamplerView from '@/features/admin/DataSamplerView';
import { ApiCompany } from '@/api';

export interface DataSamplerPageProps {
  companies: ApiCompany[];
  currentUserName: string;
  onRefresh: () => Promise<void>;
}

export const DataSamplerPage: React.FC<DataSamplerPageProps> = ({
  companies,
  currentUserName,
  onRefresh,
}) => {
  return (
    <DataSamplerView
      companies={companies}
      currentUserName={currentUserName}
      onRefresh={onRefresh}
    />
  );
};

export default DataSamplerPage;
