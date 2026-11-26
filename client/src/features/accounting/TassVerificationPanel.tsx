import { CheckCircle2, Clock } from 'lucide-react';
import type { DeliveryRecord } from '@/types';
import { formatManilaTimestamp } from '@/utils/manilaTimestamp';

/** Read-only collection verification panel (Logistics verifies) rendered in the Verification tab. */
export default function TassVerificationPanel({ record }: { record: DeliveryRecord }) {
  const verified = Boolean(record.collection_verified);
  if (record.status !== 'Delivered' && !verified) return null;

  const formattedAmount = record.amount != null
    ? record.amount.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })
    : null;

  return (
    <section
      aria-labelledby="tass-verification-title"
      className={`rounded-xl border bg-white p-4 shadow-sm sm:p-5 ${
        verified ? 'border-emerald-200' : 'border-amber-200'
      }`}
    >
      <div className="flex items-start gap-3">
        {verified
          ? <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          : <Clock aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />}
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h3 id="tass-verification-title" className="font-bold text-slate-900">
              {verified ? 'Collection verification complete' : 'Awaiting collection verification'}
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              {verified
                ? 'Logistics has verified that this billing collection is complete.'
                : 'Sales verification is complete. Waiting for Logistics to review and verify this collection.'}
            </p>
          </div>

          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold text-slate-500">Verification status</dt>
              <dd className={`font-semibold ${verified ? 'text-emerald-700' : 'text-amber-700'}`}>
                {verified ? 'Verified' : 'Pending verification'}
              </dd>
            </div>
            {verified && (
              <div>
                <dt className="text-xs font-semibold text-slate-500">Verified by</dt>
                <dd className="font-semibold text-slate-800">{record.collection_verified_by || 'Logistics'}</dd>
              </div>
            )}
            {verified && (
              <div>
                <dt className="text-xs font-semibold text-slate-500">Verified at</dt>
                <dd className="font-semibold text-slate-800">
                  {record.collection_verified_at ? formatManilaTimestamp(record.collection_verified_at) : 'Not recorded'}
                </dd>
              </div>
            )}
            {formattedAmount && (
              <div>
                <dt className="text-xs font-semibold text-slate-500">Collection amount</dt>
                <dd className="font-semibold text-slate-800">{formattedAmount}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>
    </section>
  );
}
