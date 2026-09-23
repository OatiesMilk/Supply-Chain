import React from 'react';
import StatisticalReportView from '@/features/admin/StatisticalReportView';
import { UserRole } from '@/types';

export interface StatisticalReportsPageProps {
  currentUserName: string;
  currentUserRole: UserRole;
}

export const StatisticalReportsPage: React.FC<StatisticalReportsPageProps> = ({
  currentUserName,
  currentUserRole,
}) => {
  return (
    <StatisticalReportView
      currentUserName={currentUserName}
      currentUserRole={currentUserRole}
    />
  );
};

export default StatisticalReportsPage;
