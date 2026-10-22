import React from 'react';
import { Lock } from 'lucide-react';
import AccountManagerDirectory from '@/features/admin/AccountManagerDirectory';
import { DeliveryRecord } from '@/types';

export interface AccountManagerDirectoryPageProps {
  records: DeliveryRecord[];
  onNavigate: (screen: string, item_id?: string) => void;
  canAccess: boolean;
}

export const AccountManagerDirectoryPage: React.FC<AccountManagerDirectoryPageProps> = ({
  records,
  onNavigate,
  canAccess,
}) => {
  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-3">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
          <Lock className="w-6 h-6 text-red-400" />
        </div>
        <h2 className="text-base font-bold text-slate-700">Access Denied</h2>
        <p className="text-xs text-slate-400 max-w-xs">
          Account Managers is not available for your account. Contact your administrator if you need access.
        </p>
      </div>
    );
  }

  return (
    <AccountManagerDirectory
      records={records}
      onNavigate={onNavigate}
    />
  );
};

export default AccountManagerDirectoryPage;
