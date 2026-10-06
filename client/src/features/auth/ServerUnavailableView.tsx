import { Loader2, RefreshCw, ServerOff } from 'lucide-react';

interface Props {
  retrying: boolean;
  onRetry: () => void;
}

export default function ServerUnavailableView({ retrying, onRetry }: Props) {
  return (
    <main className="min-h-screen bg-[#F8F9FB] flex items-center justify-center px-6" aria-labelledby="server-unavailable-title">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-[#1F3864]">
          <ServerOff size={32} aria-hidden="true" />
        </div>
        <h1 id="server-unavailable-title" className="text-2xl font-semibold text-slate-900">Server unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          We can’t connect to the server right now. Check your internet connection or try again in a moment.
        </p>
        <button type="button" onClick={onRetry} disabled={retrying}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-[#1F3864] px-5 py-3 text-sm font-medium text-white hover:bg-[#162947] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F3864]">
          {retrying ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
          {retrying ? 'Checking connection…' : 'Try again'}
        </button>
        <p className="mt-4 text-xs text-slate-500" role="status">We’ll reconnect automatically when the server is available.</p>
      </div>
    </main>
  );
}
