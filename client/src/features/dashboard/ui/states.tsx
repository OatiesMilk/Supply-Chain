import type { ReactNode } from 'react';
import { AlertCircle, ShieldCheck } from 'lucide-react';

export function EmptyState({ title, description, icon }: { title: string; description?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <span className="mb-2 text-emerald-600" aria-hidden="true">{icon ?? <ShieldCheck className="h-9 w-9" />}</span>
      <p className="text-base font-semibold text-slate-800">{title}</p>
      {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
    </div>
  );
}

export function PanelError({ message = 'This section could not be loaded.', onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-3 py-8 text-center">
      <AlertCircle className="h-8 w-8 text-red-700" aria-hidden="true" />
      <p className="text-sm font-medium text-slate-800">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F3864]">
          Try again
        </button>
      )}
    </div>
  );
}

/** Placeholder lines. Pulses only when the user has not asked for reduced motion. */
export function TileSkeleton({ lines = 2 }: { lines?: number }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="space-y-2">
      <span className="sr-only">Loading</span>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className={`h-4 rounded bg-slate-200 motion-safe:animate-pulse ${i === 0 ? 'w-1/2' : 'w-3/4'}`} />
      ))}
    </div>
  );
}
