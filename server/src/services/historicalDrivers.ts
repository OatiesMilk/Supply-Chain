export function planHistoricalDrivers(
  managed: { name: string; type: string }[],
  records: { driver: string; driverAssistants: string }[],
) {
  const key = (name: string, type: string) => `${type}:${name.trim().toLowerCase()}`;
  // Inactive entries count as existing; never replace or reactivate them.
  const known = new Set(managed.map(d => key(d.name, d.type)));
  const entries: { name: string; type: string; isActive: boolean; coverageAreas: string; createdBy: string; modifiedBy: string }[] = [];
  const add = (name: unknown, type: string) => {
    if (typeof name !== 'string' || !name.trim() || known.has(key(name, type))) return;
    known.add(key(name, type));
    entries.push({ name: name.trim(), type, isActive: false, coverageAreas: '[]', createdBy: 'historical-import', modifiedBy: 'historical-import' });
  };
  for (const record of records) {
    add(record.driver, 'DRIVER');
    try {
      const assistants: unknown = JSON.parse(record.driverAssistants);
      if (Array.isArray(assistants)) assistants.forEach(name => add(name, 'ASSISTANT'));
    } catch { /* Ignore malformed legacy lists. */ }
  }
  return entries;
}
