import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems: number;
  pageSize: number;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}

export type PaginationItem = number | '...';

/**
 * Computes the windowed array of page numbers and ellipsis tokens.
 * Symmetrical algorithm ensuring first and last pages are always visible,
 * with up to 5 contiguous pages around the current page when large.
 */
export function getPaginationItems(currentPage: number, totalPages: number): PaginationItem[] {
  const safeTotal = Math.max(1, totalPages);
  const safeCurrent = Math.max(1, Math.min(currentPage, safeTotal));

  if (safeTotal <= 7) {
    return Array.from({ length: safeTotal }, (_, i) => i + 1);
  }

  // Near the beginning: 1 2 3 4 5 ... totalPages
  if (safeCurrent <= 4) {
    return [1, 2, 3, 4, 5, '...', safeTotal];
  }

  // Near the end: 1 ... (totalPages-4) ... totalPages
  if (safeCurrent >= safeTotal - 3) {
    return [
      1,
      '...',
      safeTotal - 4,
      safeTotal - 3,
      safeTotal - 2,
      safeTotal - 1,
      safeTotal,
    ];
  }

  // In the middle: 1 ... (curr-1) curr (curr+1) ... totalPages
  return [1, '...', safeCurrent - 1, safeCurrent, safeCurrent + 1, '...', safeTotal];
}

export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50],
}: PaginationProps) {
  const safeTotalPages = Math.max(1, totalPages);
  const safeCurrentPage = Math.max(1, Math.min(currentPage, safeTotalPages));

  const startItem = totalItems === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const endItem = Math.min(safeCurrentPage * pageSize, totalItems);

  const paginationItems = getPaginationItems(safeCurrentPage, safeTotalPages);

  return (
    <div
      className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 px-4 py-3 bg-white text-xs select-none"
      aria-label="Pagination"
      data-testid="pagination-container"
    >
      {/* Left: Record summary & Page size selector */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-slate-500">
        <span data-testid="pagination-records-info" className="text-xs text-slate-500">
          Showing{' '}
          <span className="font-bold text-slate-700">
            {totalItems === 0 ? '0' : `${startItem}–${endItem}`}
          </span>{' '}
          of <span className="font-bold text-slate-700">{totalItems}</span> records
        </span>

        {onPageSizeChange && (
          <div className="flex items-center gap-1.5 sm:gap-2">
            <label
              htmlFor="pagination-page-size"
              className="text-xs text-slate-500 whitespace-nowrap"
            >
              Rows per page:
            </label>
            <select
              id="pagination-page-size"
              aria-label="Rows per page"
              value={pageSize}
              onChange={(e) => {
                const newSize = Number(e.target.value);
                onPageSizeChange(newSize);
              }}
              className="h-9 sm:h-10 px-2.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-[#1F3864]/20 focus:border-[#1F3864] cursor-pointer"
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Right: Page navigation buttons */}
      <nav
        aria-label="Pagination Navigation"
        className="flex items-center gap-1 sm:gap-1.5 flex-wrap justify-center"
      >
        {/* Previous page button */}
        <button
          type="button"
          onClick={() => onPageChange(safeCurrentPage - 1)}
          disabled={safeCurrentPage <= 1}
          aria-label="Previous page"
          className="min-w-[40px] min-h-[40px] sm:min-w-[44px] sm:min-h-[44px] px-2.5 sm:px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold border border-slate-200 bg-white text-slate-700 inline-flex items-center justify-center gap-1 transition-all hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-slate-700 cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">Previous</span>
        </button>

        {/* Page numbers and ellipsis */}
        {paginationItems.map((item, index) => {
          if (item === '...') {
            const ellipsisKey = index === 1 ? 'ellipsis-start' : 'ellipsis-end';
            return (
              <span
                key={ellipsisKey}
                data-testid="pagination-ellipsis"
                aria-hidden="true"
                className="min-w-[40px] min-h-[40px] sm:min-w-[44px] sm:min-h-[44px] inline-flex items-center justify-center text-slate-400 font-bold select-none text-xs sm:text-sm"
              >
                ...
              </span>
            );
          }

          const isActive = item === safeCurrentPage;
          return (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={`Page ${item}`}
              className={`min-w-[40px] min-h-[40px] sm:min-w-[44px] sm:min-h-[44px] px-3 py-2 rounded-lg text-xs sm:text-sm transition-all inline-flex items-center justify-center cursor-pointer ${
                isActive
                  ? 'bg-[#1F3864] text-white font-bold border-2 border-[#1F3864] shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 border border-slate-200 font-medium'
              }`}
            >
              {item}
            </button>
          );
        })}

        {/* Next page button */}
        <button
          type="button"
          onClick={() => onPageChange(safeCurrentPage + 1)}
          disabled={safeCurrentPage >= safeTotalPages || totalItems === 0}
          aria-label="Next page"
          className="min-w-[40px] min-h-[40px] sm:min-w-[44px] sm:min-h-[44px] px-2.5 sm:px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold border border-slate-200 bg-white text-slate-700 inline-flex items-center justify-center gap-1 transition-all hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-slate-700 cursor-pointer"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="w-4 h-4 shrink-0" />
        </button>
      </nav>
    </div>
  );
}
