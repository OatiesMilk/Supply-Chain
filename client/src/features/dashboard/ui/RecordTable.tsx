import type { ReactNode } from 'react';

export interface RecordColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: 'left' | 'center';
  /** Hide the label in the stacked (phone) layout. */
  hideLabelWhenStacked?: boolean;
}

interface Props<T> {
  rows: readonly T[];
  columns: readonly RecordColumn<T>[];
  rowKey: (row: T) => string;
  /** Opens the row. The first column renders as a real button; clicking anywhere on a row also opens it. */
  onOpen?: (row: T) => void;
  /** Rows that return false render without a button or row click. Defaults to every row. */
  canOpen?: (row: T) => boolean;
  /** Accessible name for the first-cell button, e.g. "Open RMA record RMA-1". */
  openLabel?: (row: T) => string;
  caption: string;
}

const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F3864]';

/**
 * Table from `md` up and a stacked list below it, so phones never scroll sideways.
 * The first column is the row's keyboard target; mouse users can click the whole row.
 */
export default function RecordTable<T>({ rows, columns, rowKey, onOpen, canOpen, openLabel, caption }: Props<T>) {
  const [first, ...rest] = columns;
  const openable = (row: T) => !!onOpen && (canOpen?.(row) ?? true);
  const rowClick = (row: T) => (openable(row) ? () => onOpen?.(row) : undefined);
  const lead = (row: T) => openable(row)
    ? <button type="button" onClick={event => { event.stopPropagation(); onOpen?.(row); }} aria-label={openLabel?.(row)}
        className={`text-left font-mono font-semibold text-[#1F3864] underline-offset-2 hover:underline ${focus} rounded-sm`}>{first.render(row)}</button>
    : first.render(row);
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
              {columns.map(column => <th key={column.key} scope="col" className={`px-3 py-2.5 ${column.align === 'center' ? 'text-center' : ''}`}>{column.header}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(row => (
              <tr key={rowKey(row)} onClick={rowClick(row)}
                className={`focus-within:bg-slate-50 ${openable(row) ? 'cursor-pointer hover:bg-slate-50' : ''}`}>
                <td className="px-3 py-2.5 whitespace-nowrap">{lead(row)}</td>
                {rest.map(column => <td key={column.key} className={`px-3 py-2.5 text-slate-800 ${column.align === 'center' ? 'text-center' : ''}`}>{column.render(row)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-slate-100 md:hidden" aria-label={caption}>
        {rows.map(row => (
          <li key={rowKey(row)} className="space-y-2 py-3" onClick={rowClick(row)}>
            <div>{lead(row)}</div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
              {rest.map(column => (
                <div key={column.key} className="min-w-0">
                  {!column.hideLabelWhenStacked && <dt className="text-xs font-semibold text-slate-600">{column.header}</dt>}
                  <dd className="break-words text-slate-800">{column.render(row)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
