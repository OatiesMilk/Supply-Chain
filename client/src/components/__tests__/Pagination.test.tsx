import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import Pagination, { getPaginationItems } from '../Pagination';

describe('Pagination Component', () => {
  it('renders page numbers and highlights the active page', () => {
    const onPageChange = vi.fn();
    render(
      <Pagination
        currentPage={3}
        totalPages={5}
        totalItems={50}
        pageSize={10}
        onPageChange={onPageChange}
      />
    );

    // Should display pages 1 through 5
    for (let p = 1; p <= 5; p++) {
      expect(screen.getByRole('button', { name: `Page ${p}` })).toBeInTheDocument();
    }

    // Active page should be page 3 with aria-current="page"
    const activeBtn = screen.getByRole('button', { name: 'Page 3' });
    expect(activeBtn).toHaveAttribute('aria-current', 'page');
    // Active styling check (brand color and bold)
    expect(activeBtn.className).toContain('bg-[#1F3864]');
    expect(activeBtn.className).toContain('text-white');
    expect(activeBtn.className).toContain('font-bold');

    // Inactive page should not have aria-current="page" and should have inactive styling
    const inactiveBtn = screen.getByRole('button', { name: 'Page 1' });
    expect(inactiveBtn).not.toHaveAttribute('aria-current');
    expect(inactiveBtn.className).toContain('bg-white');

    // Record count indicator
    expect(screen.getByTestId('pagination-records-info')).toHaveTextContent('Showing 21–30 of 50 records');
  });

  it('correctly renders ellipsis (...) when totalPages is large', () => {
    const onPageChange = vi.fn();

    // Case 1: Beginning of page list (page 2 of 20) -> [1, 2, 3, 4, 5, '...', 20]
    const { rerender } = render(
      <Pagination
        currentPage={2}
        totalPages={20}
        totalItems={200}
        pageSize={10}
        onPageChange={onPageChange}
      />
    );

    let ellipses = screen.getAllByTestId('pagination-ellipsis');
    expect(ellipses).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Page 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 5' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Page 6' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 20' })).toBeInTheDocument();

    // Case 2: Middle of page list (page 10 of 20) -> [1, '...', 9, 10, 11, '...', 20]
    rerender(
      <Pagination
        currentPage={10}
        totalPages={20}
        totalItems={200}
        pageSize={10}
        onPageChange={onPageChange}
      />
    );

    ellipses = screen.getAllByTestId('pagination-ellipsis');
    expect(ellipses).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Page 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 9' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 10' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 11' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 20' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Page 2' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Page 19' })).not.toBeInTheDocument();

    // Case 3: Near end of page list (page 19 of 20) -> [1, '...', 16, 17, 18, 19, 20]
    rerender(
      <Pagination
        currentPage={19}
        totalPages={20}
        totalItems={200}
        pageSize={10}
        onPageChange={onPageChange}
      />
    );

    ellipses = screen.getAllByTestId('pagination-ellipsis');
    expect(ellipses).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Page 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 16' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 20' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Page 15' })).not.toBeInTheDocument();
  });

  it('fires onPageChange when clicking page numbers and Prev/Next buttons', () => {
    const onPageChange = vi.fn();
    render(
      <Pagination
        currentPage={3}
        totalPages={5}
        totalItems={50}
        pageSize={10}
        onPageChange={onPageChange}
      />
    );

    // Click page number 4
    fireEvent.click(screen.getByRole('button', { name: 'Page 4' }));
    expect(onPageChange).toHaveBeenCalledWith(4);

    // Click Prev button (3 -> 2)
    fireEvent.click(screen.getByRole('button', { name: /previous/i }));
    expect(onPageChange).toHaveBeenCalledWith(2);

    // Click Next button (3 -> 4)
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it('disables Prev on first page and Next on last page', () => {
    const onPageChange = vi.fn();
    const { rerender } = render(
      <Pagination
        currentPage={1}
        totalPages={5}
        totalItems={50}
        pageSize={10}
        onPageChange={onPageChange}
      />
    );

    const prevBtn = screen.getByRole('button', { name: /previous/i });
    const nextBtn = screen.getByRole('button', { name: /next/i });

    expect(prevBtn).toBeDisabled();
    expect(nextBtn).not.toBeDisabled();

    // Rerender on last page
    rerender(
      <Pagination
        currentPage={5}
        totalPages={5}
        totalItems={50}
        pageSize={10}
        onPageChange={onPageChange}
      />
    );

    expect(prevBtn).not.toBeDisabled();
    expect(nextBtn).toBeDisabled();
  });

  it('meets the touch target / sizing criteria (at least 40px/44px for accessibility)', () => {
    render(
      <Pagination
        currentPage={2}
        totalPages={5}
        totalItems={50}
        pageSize={10}
        onPageChange={vi.fn()}
      />
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(5);

    // Check each button has touch target classes (min 40px base, min 44px on desktop/sm)
    buttons.forEach((btn) => {
      expect(btn.className).toContain('min-w-[40px]');
      expect(btn.className).toContain('min-h-[40px]');
      expect(btn.className).toContain('sm:min-w-[44px]');
      expect(btn.className).toContain('sm:min-h-[44px]');
    });
  });

  it('renders page size selector and calls onPageSizeChange when selected', () => {
    const onPageSizeChange = vi.fn();
    render(
      <Pagination
        currentPage={1}
        totalPages={4}
        totalItems={100}
        pageSize={25}
        onPageChange={vi.fn()}
        onPageSizeChange={onPageSizeChange}
        pageSizeOptions={[10, 25, 50, 100]}
      />
    );

    const select = screen.getByRole('combobox', { name: /rows per page/i });
    expect(select).toBeInTheDocument();
    expect(select).toHaveValue('25');

    fireEvent.change(select, { target: { value: '50' } });
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });

  it('correctly displays indicator when totalItems is 0', () => {
    render(
      <Pagination
        currentPage={1}
        totalPages={0}
        totalItems={0}
        pageSize={10}
        onPageChange={vi.fn()}
      />
    );

    expect(screen.getByTestId('pagination-records-info')).toHaveTextContent('Showing 0 of 0 records');
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });
});

describe('getPaginationItems helper function', () => {
  it('returns all pages when totalPages <= 7', () => {
    expect(getPaginationItems(1, 1)).toEqual([1]);
    expect(getPaginationItems(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(getPaginationItems(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('handles windowing when totalPages > 7', () => {
    // Beginning
    expect(getPaginationItems(1, 10)).toEqual([1, 2, 3, 4, 5, '...', 10]);
    expect(getPaginationItems(4, 10)).toEqual([1, 2, 3, 4, 5, '...', 10]);

    // Middle
    expect(getPaginationItems(5, 20)).toEqual([1, '...', 4, 5, 6, '...', 20]);
    expect(getPaginationItems(6, 12)).toEqual([1, '...', 5, 6, 7, '...', 12]);

    // End
    expect(getPaginationItems(7, 10)).toEqual([1, '...', 6, 7, 8, 9, 10]);
    expect(getPaginationItems(10, 10)).toEqual([1, '...', 6, 7, 8, 9, 10]);
  });
});
