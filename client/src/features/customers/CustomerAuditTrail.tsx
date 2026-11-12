import { History } from 'lucide-react';
import { useCustomerAuditQuery } from '@/api/queries/useCompaniesQuery';

function formatWhen(ts: string): string {
  return new Date(ts).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

/** Change history for one Customer: who changed what, when, and why. */
export default function CustomerAuditTrail({ customerId }: { customerId: string }) {
  const query = useCustomerAuditQuery(customerId);

  if (query.isPending) {
    return (
      <ul aria-label="Loading audit trail" className="space-y-3">
        {[0, 1].map(i => (
          <li key={i} className="space-y-2 rounded-xl border border-slate-100 p-4">
            <span className="block h-3.5 w-48 animate-pulse rounded bg-slate-200" />
            <span className="block h-3 w-72 animate-pulse rounded bg-slate-100" />
          </li>
        ))}
      </ul>
    );
  }

  if (query.isError) {
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        <p>The audit trail could not be loaded. {query.error.message}</p>
        <button type="button" onClick={() => query.refetch()} className="mt-2 font-semibold underline underline-offset-2 hover:text-red-900">
          Try again
        </button>
      </div>
    );
  }

  if (query.data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <History aria-hidden="true" className="h-8 w-8 text-slate-300" />
        <p className="text-sm text-slate-500">No edits yet. Each saved change will appear here with who made it and why.</p>
      </div>
    );
  }

  return (
    <ol className="space-y-3">
      {query.data.map(entry => (
        <li key={entry.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-slate-900">{entry.changed_by}</span>
              {entry.action === 'CREATE' ? ' created this customer' : ' edited this customer'}
            </p>
            <time dateTime={entry.timestamp} className="text-xs text-slate-500">{formatWhen(entry.timestamp)}</time>
          </div>

          {entry.remarks && (
            <p className="mt-2 border-l-2 border-[#0078C1] pl-3 text-sm text-slate-700">
              <span className="sr-only">Reason: </span>{entry.remarks}
            </p>
          )}

          {entry.changes.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-left text-xs">
                <caption className="sr-only">{entry.action === 'CREATE' ? 'Initial values' : 'Fields changed'}</caption>
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th scope="col" className="py-1.5 pr-3 font-semibold">Field</th>
                    {entry.action !== 'CREATE' && <th scope="col" className="py-1.5 pr-3 font-semibold">Before</th>}
                    <th scope="col" className="py-1.5 font-semibold">{entry.action === 'CREATE' ? 'Value' : 'After'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {entry.changes.map(change => (
                    <tr key={change.field}>
                      <th scope="row" className="py-1.5 pr-3 font-semibold text-slate-700">{change.label}</th>
                      {entry.action !== 'CREATE' && (
                        <td className="py-1.5 pr-3 text-slate-500 line-through decoration-slate-300">{change.from || <span className="italic no-underline">Empty</span>}</td>
                      )}
                      <td className="py-1.5 text-slate-900">{change.to || <span className="italic text-slate-500">Empty</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
