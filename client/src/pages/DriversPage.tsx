import React, { useEffect } from 'react';
import { DriverPage, DriverPageProps } from './DriverPage';
import { DriverBoardPage } from './DriverBoardPage';
import { DriverManagerPage, DriverManagerPageProps } from './DriverManagerPage';
import { DRIVER_TABS, rememberDriverTab } from '@/routes/screenRouting';

export interface DriversPageProps extends DriverPageProps, DriverManagerPageProps {
  activeScreen: string;
  canAccess: (screen: string) => boolean;
}

// Shell for the driver screens: one tab per granted screen. The active tab is
// the current screen key, so deep links and per-screen permissions still apply.
export const DriversPage: React.FC<DriversPageProps> = ({
  activeScreen,
  canAccess,
  records,
  onUpdateRecord,
  currentUserName,
  currentUserRole,
  outputActionConfigs,
  onNavigate,
  drivers,
  onCreateDriver,
  onUpdateDriver,
  onDeleteDriver,
}) => {
  useEffect(() => rememberDriverTab(activeScreen), [activeScreen]);

  const tabs = DRIVER_TABS.filter(tab => canAccess(tab.screen));

  return (
    <div className="space-y-4" id="drivers-page">
      {tabs.length > 1 && (
        <nav aria-label="Driver sections" className="flex gap-5 overflow-x-auto border-b border-slate-200">
          {tabs.map(tab => {
            const active = tab.screen === activeScreen;
            return (
              <button
                key={tab.screen}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => onNavigate(tab.screen)}
                className={`min-h-10 shrink-0 border-b-2 pb-2 text-sm font-semibold cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${active ? 'border-blue-700 text-blue-800' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      )}

      {activeScreen === 'driver' && (
        <DriverPage
          records={records}
          onUpdateRecord={onUpdateRecord}
          currentUserName={currentUserName}
          outputActionConfigs={outputActionConfigs}
          onNavigate={onNavigate}
        />
      )}
      {activeScreen === 'driver_board' && (
        <DriverBoardPage
          records={records}
          onNavigate={onNavigate}
          onUpdateRecord={onUpdateRecord}
          currentUserName={currentUserName}
        />
      )}
      {activeScreen === 'driver_manager' && (
        <DriverManagerPage
          drivers={drivers}
          currentUserRole={currentUserRole}
          currentUserName={currentUserName}
          onCreateDriver={onCreateDriver}
          onUpdateDriver={onUpdateDriver}
          onDeleteDriver={onDeleteDriver}
        />
      )}
    </div>
  );
};

export default DriversPage;
