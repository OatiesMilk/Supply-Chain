import Pagination from './Pagination';

export default function RecordPageControls({ page, total, limit = 25, onPageChange, loading, error, retry, collapseSinglePage = false }: {
  page: number; total: number; limit?: number; onPageChange: (page: number) => void;
  loading?: boolean; error?: Error | null; retry?: () => void;
  /** With one page, show only the "Showing x of y records" line instead of page buttons. */
  collapseSinglePage?: boolean;
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  if (collapseSinglePage && totalPages === 1 && !loading && !error) {
    if (total === 0) return null;
    return <p data-testid="pagination-records-info" className="px-4 py-3 text-center text-xs text-slate-500">
      Showing <span className="font-bold text-slate-700">1–{total}</span> of <span className="font-bold text-slate-700">{total}</span> records
    </p>;
  }
  return <div className="space-y-2 rounded-lg border border-slate-200 bg-white">
    {loading && <p role="status" className="px-4 pt-3 text-sm text-slate-600">Loading records…</p>}
    {error && <p role="alert" className="px-4 pt-3 text-sm text-red-700">Could not load records. <button type="button" onClick={retry} className="underline">Retry</button></p>}
    <Pagination currentPage={page} totalPages={totalPages} totalItems={total}
      pageSize={limit} onPageChange={onPageChange} />
  </div>;
}
