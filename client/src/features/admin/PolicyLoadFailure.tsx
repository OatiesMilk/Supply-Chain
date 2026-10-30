import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { missingPermissionFoundation } from './policyPresentation';

export default function PolicyLoadFailure({ error, busy, onRetry }: { error: unknown; busy: boolean; onRetry: () => void }) {
  const setup = missingPermissionFoundation(error);
  return <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
    <div className="flex items-start gap-3">
      <AlertCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0 space-y-2">
        <h3 className="font-semibold">{setup ? 'Permission setup is incomplete' : 'Could not load permission policies'}</h3>
        <p>{setup ? 'Role policies have not been prepared for this environment. Your deployment operator needs to complete the approved permission setup before these policies can be viewed or edited.' : error instanceof Error ? error.message : String(error)}</p>
        {setup && <p className="text-xs">Retry only reloads the policy. It does not initialize policies or change access.</p>}
        <button type="button" disabled={busy} onClick={onRetry} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 font-semibold disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
          <RefreshCw aria-hidden="true" className="h-4 w-4" />{busy ? 'Retrying…' : 'Retry loading policies'}
        </button>
      </div>
    </div>
  </div>;
}
