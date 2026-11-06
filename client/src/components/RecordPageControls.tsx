import Pagination from './Pagination';

export default function RecordPageControls({ page, total, limit = 25, onPageChange, loading, error, retry }: {
  page: number; total: number; limit?: number; onPageChange: (page: number) => void;
  loading?: boolean; error?: Error | null; retry?: () => void;
}) {
  return <div className="space-y-2 rounded-lg border border-slate-200 bg-white">
    {loading && <p role="status" className="px-4 pt-3 text-sm text-slate-600">Loading records…</p>}
    {error && <p role="alert" className="px-4 pt-3 text-sm text-red-700">Could not load records. <button type="button" onClick={retry} className="underline">Retry</button></p>}
    <Pagination currentPage={page} totalPages={Math.max(1, Math.ceil(total / limit))} totalItems={total}
      pageSize={limit} onPageChange={onPageChange} />
  </div>;
}
