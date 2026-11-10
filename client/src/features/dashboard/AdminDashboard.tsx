import { Banknote, ClipboardList, ShieldAlert, Users } from 'lucide-react';
import type { ApiDashboardOverview, ApiDashboardStats } from '@/api';
import type { DashboardFilterId } from '@/utils/dashboardFilters';
import { formatManilaTimestamp } from '@/utils/manilaTimestamp';
import DashboardStatusChart from './DashboardStatusChart';
import { DashboardPage, DashboardPanel, EmptyState, KpiRow, KpiTile, TileSkeleton } from './ui';

type AdminStats = Extract<ApiDashboardStats, { role: 'ADMIN' }>;

interface Props {
  /** null while the server numbers load. Tiles and panels show skeletons, never locally counted guesses. */
  stats: AdminStats | null;
  /** Only supplies the unverified collections amount and the "Updated" time. */
  overview?: ApiDashboardOverview;
  onNavigate: (screen: string, item_id?: string, dashboardFilterId?: DashboardFilterId) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  canAccess?: (screen: string) => boolean;
}

const ACTION_BADGE: Record<string, string> = {
  CREATE: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  UPDATE: 'bg-blue-50 text-blue-800 border-blue-200',
  DELETE: 'bg-red-50 text-red-800 border-red-200',
};

const ROLE_LABELS: Record<string, string> = {
  SALES_COORDINATOR: 'Sales Coordinator',
  LOGISTICS: 'Logistics',
  TASS: 'TASS',
  ADMIN: 'Admin',
};

const linkClass = 'rounded-sm text-sm font-semibold text-[#1F3864] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F3864]';

export default function AdminDashboard({ stats, overview, onNavigate, onRefresh, refreshing, canAccess = () => true }: Props) {
  const open = (screen: string, filter?: DashboardFilterId) => (canAccess(screen) ? () => onNavigate(screen, undefined, filter) : undefined);
  const breakdown = Object.entries(stats?.user_breakdown ?? {}).map(([role, count]) => `${count} ${ROLE_LABELS[role] ?? role}`).join(', ');
  const unverified = stats?.unverified_collections;
  const amount = overview?.unverified_collections_amount ?? 0;
  const unverifiedContext = unverified === undefined ? undefined
    : unverified === 0 ? 'Nothing to verify'
    : amount > 0 ? `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })} across ${unverified} record${unverified !== 1 ? 's' : ''}`
    : 'Awaiting TASS';
  const byStatus = stats?.records_by_status ?? [];
  const recentAudit = stats?.recent_audit ?? [];

  return (
    <DashboardPage title="Admin dashboard" id="admin-dashboard" updatedAt={overview?.generated_at} onRefresh={onRefresh} refreshing={refreshing}>
      <KpiRow count={4}>
        <KpiTile label="Active users" unit="users" icon={Users} value={stats?.total_active_users}
          context={stats ? (breakdown || 'No active users') : undefined} onOpen={open('admin', 'admin-active-users')} />
        <KpiTile label="Records this week" unit="records" icon={ClipboardList} value={stats?.records_this_week}
          context={stats ? 'All modules' : undefined} onOpen={open('transactions', 'admin-records-this-week')} />
        <KpiTile label="Unverified collections" unit="collections" icon={Banknote} tone="warning" value={unverified}
          context={unverifiedContext} onOpen={open('accounting_collection', 'admin-unverified-collections')} />
        <KpiTile label="Audit events today" unit="events" icon={ShieldAlert} value={stats?.audit_events_today}
          context={stats ? 'System activity' : undefined} onOpen={open('admin', 'admin-audit-today')} />
      </KpiRow>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <DashboardPanel title="Records by status">
          {!stats ? <TileSkeleton lines={4} /> : byStatus.length === 0
            ? <EmptyState title="No records found" />
            : (
              <>
                <p className="mb-3 text-sm text-slate-600">All modules, system-wide</p>
                <div className="h-56"><DashboardStatusChart data={byStatus} /></div>
              </>
            )}
        </DashboardPanel>

        <div className="lg:col-span-2">
          <DashboardPanel title="Recent system activity"
            actions={canAccess('admin') ? <button type="button" className={linkClass} onClick={() => onNavigate('admin')}>View full log</button> : undefined}>
            {!stats ? <TileSkeleton lines={4} /> : recentAudit.length === 0
              ? <EmptyState title="No activity recorded today" />
              : (
                <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto">
                  {recentAudit.map(entry => (
                    <li key={entry.id}>
                      <button type="button" onClick={canAccess('admin') ? () => onNavigate('admin') : undefined} disabled={!canAccess('admin')}
                        className="flex w-full items-center gap-3 rounded-md px-1 py-2.5 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F3864] disabled:cursor-default disabled:hover:bg-transparent">
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${ACTION_BADGE[entry.action] ?? 'border-slate-200 bg-slate-50 text-slate-700'}`}>{entry.action}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-slate-800">
                            <span className="font-semibold">{entry.changed_by}</span>
                            <span className="text-slate-600"> · {entry.record_type} </span>
                            <span className="font-mono">{entry.record_id.slice(0, 12)}{entry.record_id.length > 12 ? '…' : ''}</span>
                          </span>
                          <span className="block text-xs text-slate-600">{formatManilaTimestamp(entry.timestamp)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
          </DashboardPanel>
        </div>
      </div>
    </DashboardPage>
  );
}
