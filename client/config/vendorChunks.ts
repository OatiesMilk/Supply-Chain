/** Match package boundaries, including nested and pnpm node_modules paths. */
export function vendorChunk(id: string): string | undefined {
  const normalized = id.replaceAll('\\', '/');
  const packageName = normalized.split('/node_modules/').at(-1);
  if (packageName === normalized || !packageName) return undefined;
  const segments = packageName.split('/');
  const name = segments[0].startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
  if (['react', 'react-dom', 'scheduler'].includes(name)) return 'vendor-react';
  if (['@tanstack/react-query', '@tanstack/query-core'].includes(name)) return 'vendor-query';
  if (name === 'lucide-react') return 'vendor-lucide';
  if (name === 'recharts' || name.startsWith('d3-')) return 'vendor-charts';
  return undefined;
}
