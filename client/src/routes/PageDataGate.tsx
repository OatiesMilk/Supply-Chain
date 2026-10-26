import { createContext, type ReactNode } from 'react';
import { PageLoading } from './PageLoading';

export const PageDataContext = createContext<{ loading: boolean; error: string | null; onRetry: () => Promise<void> } | null>(null);

export function PageDataGate({ loading, error, onRetry, children }: {
  loading: boolean; error: string | null; onRetry: () => Promise<void>; children: ReactNode;
}) {
  if (error) return <div role="alert" className="flex flex-col items-center gap-3 py-16 text-slate-700">
    <p>Unable to load page data: {error}</p>
    <button className="rounded bg-blue-800 px-4 py-2 text-white" onClick={() => void onRetry()}>Try again</button>
  </div>;
  if (loading) return <PageLoading />;
  return children;
}
