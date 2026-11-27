import { Loader2, RefreshCw, ServerOff } from 'lucide-react';

interface Props {
  retrying: boolean;
  onRetry: () => void;
}

export default function ServerUnavailableView({ retrying, onRetry }: Props) {
  return (
    <main className="min-h-screen bg-surface-canvas flex items-center justify-center px-6" aria-labelledby="server-unavailable-title">
      <div className="w-full max-w-md rounded-2xl border border-slate-200/90 bg-white p-8 text-center shadow-xs">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-brand-navy">
          <ServerOff size={28} aria-hidden="true" />
        </div>
        <h1 id="server-unavailable-title" className="text-xl font-semibold tracking-tight text-slate-900">Server unavailable</h1>
        <p className="mt-2.5 text-sm leading-6 text-slate-600">
          We can’t connect to the server right now. Check your internet connection or try again in a moment.
        </p>
        <button type="button" onClick={onRetry} disabled={retrying}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-brand-navy px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-blue cursor-pointer disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue">
          {retrying ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
          {retrying ? 'Checking connection…' : 'Try again'}
        </button>
        <p className="mt-4 text-xs text-slate-500" role="status">We’ll reconnect automatically when the server is available.</p>
      </div>
    </main>
  );
}
