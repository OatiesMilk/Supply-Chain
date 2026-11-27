import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList } from 'recharts';

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Scheduled', IN_TRANSIT: 'In Transit', TRANSPORT_COMPLETE: 'Transport Complete', ACCOMPLISHED: 'Complete', DELIVERED: 'Complete',
  ON_HOLD: 'On-Hold', RESCHEDULED: 'Rescheduled', PENDING: 'Pending', DRAFT: 'Draft',
};
const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: '#0078C1', IN_TRANSIT: '#1F3864', TRANSPORT_COMPLETE: '#5279A5', ACCOMPLISHED: '#4B8A83', DELIVERED: '#4B8A83',
  ON_HOLD: '#64748B', RESCHEDULED: '#7A93B5', PENDING: '#94A3B8', DRAFT: '#CBD5E1',
};

/** Shared presentation for role dashboards; callers retain their own data scope. */
export default function DashboardStatusChart({ data }: { data: ReadonlyArray<{ status: string; count: number }> }) {
  const rows = data.map(row => {
    const key = row.status.trim().toUpperCase().replace(/[ -]+/g, '_');
    return { name: STATUS_LABELS[key] ?? row.status, count: row.count, fill: STATUS_COLORS[key] ?? '#94A3B8' };
  });
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 48, left: 5, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
        <XAxis type="number" allowDecimals={false} stroke="#64748B" fontSize={12} tickLine={false} style={{ fontFamily: 'var(--font-sans)' }} />
        <YAxis dataKey="name" type="category" stroke="#64748B" fontSize={12} tickLine={false} width={88} style={{ fontFamily: 'var(--font-sans)' }} />
        <Tooltip
          cursor={{ fill: '#F8FAFC' }}
          formatter={value => [`${value} records`, 'Total']}
          contentStyle={{ backgroundColor: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', fontFamily: 'var(--font-sans)', fontSize: '12px' }}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={18} fill="#0078C1">
          <LabelList dataKey="count" position="right" offset={8} fill="#334155" fontSize={12} fontWeight={600} style={{ fontFamily: 'var(--font-sans)' }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
