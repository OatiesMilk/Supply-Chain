export type DriverQueue = 'active' | 'completed';

interface Props {
  queue: DriverQueue;
  onChange: (queue: DriverQueue) => void;
  /** From the driver overview. Left out while loading, so no number is shown that later changes. */
  counts?: { active: number; done: number };
  /** Id of the list this switch controls. */
  controls?: string;
}

const LABELS: Record<DriverQueue, string> = { active: 'Active', completed: 'Done today' };

/** Two equal segments, side by side at every width. */
export default function DriverQueueSwitch({ queue, onChange, counts, controls }: Props) {
  return <div className="space-y-2">
    <nav className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1" aria-label="Run queues" data-queue-switch>
      {(['active', 'completed'] as const).map(value => {
        const count = counts ? (value === 'active' ? counts.active : counts.done) : null;
        const selected = queue === value;
        return <button key={value} type="button" aria-pressed={selected} aria-controls={controls}
          onClick={() => { if (!selected) onChange(value); }}
          className={`min-h-11 rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F3864] ${selected ? 'bg-[#1F3864] text-white shadow-sm' : 'text-slate-700 hover:bg-white hover:text-slate-900'}`}>
          {LABELS[value]}{count !== null && <span className={`ml-1 tabular-nums ${selected ? 'text-white/80' : 'text-slate-500'}`}>({count})</span>}
        </button>;
      })}
    </nav>
    {queue === 'completed' && <p className="px-1 text-xs text-slate-600" data-queue-hint>Includes RMA items waiting for TASS receipt.</p>}
  </div>;
}
