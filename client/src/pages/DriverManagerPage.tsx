import React from 'react';
import DriverManagerView from '@/features/drivers/DriverManagerView';
import { UserRole } from '@/types';
import { ApiDriver } from '@/api';
import { useDriversQuery } from '@/api/queries/useDriversQuery';

export interface DriverManagerPageProps {
  drivers: ApiDriver[];
  currentUserRole: UserRole;
  currentUserName: string;
  onCreateDriver: (data: { name: string; type: 'DRIVER' | 'ASSISTANT'; coverage_areas?: string[] }) => Promise<void>;
  onUpdateDriver: (id: string, data: Partial<{ name: string; type: string; coverage_areas: string[]; is_active: boolean }>) => Promise<void>;
  onDeleteDriver: (id: string) => Promise<void>;
}

export const DriverManagerPage: React.FC<DriverManagerPageProps> = ({
  drivers,
  currentUserRole,
  currentUserName,
  onCreateDriver,
  onUpdateDriver,
  onDeleteDriver,
}) => {
  const roster = useDriversQuery();
  if (roster.isPending) return <div role="status">Loading driver directory...</div>;
  if (roster.isError) return (
    <div role="alert" className="p-4 text-red-700">
      Could not load the driver directory: {roster.error.message}
      <button className="ml-3 underline" onClick={() => void roster.refetch()}>Retry</button>
    </div>
  );
  return (
    <DriverManagerView
      drivers={drivers}
      currentUserRole={currentUserRole}
      currentUserName={currentUserName}
      onCreateDriver={onCreateDriver}
      onUpdateDriver={onUpdateDriver}
      onDeleteDriver={onDeleteDriver}
    />
  );
};

export default DriverManagerPage;
