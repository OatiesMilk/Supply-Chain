import type { ReactNode } from 'react';

/** Equal-height tiles: 1 column on phones, 2 from `sm`, then 4 (or 3 + 2 when there are 5) from `lg`. */
export default function KpiRow({ children, count = 4 }: { children: ReactNode; count?: 3 | 4 | 5 }) {
  const wide = count === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3';
  return <div className={`grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 ${wide}`}>{children}</div>;
}
