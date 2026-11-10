import { AlertTriangle, Clock } from 'lucide-react';
import { ageTone, manilaDaysSince } from '@/utils/manilaDays';

interface Props {
  /** ISO timestamp the age counts from, normally `submitted_at`. */
  since: string | null | undefined;
  now?: Date;
}

/** Manila-day age. Amber and red always carry an icon and words, never colour alone. */
export default function AgeIndicator({ since, now }: Props) {
  const days = manilaDaysSince(since, now);
  if (days === null) return <span className="text-slate-500">Not available</span>;
  const label = days === 0 ? 'Today' : `${days}d`;
  const tone = ageTone(days);
  if (tone === 'normal') return <span className="font-semibold tabular-nums text-slate-700" aria-label={days === 0 ? 'Open since today' : `Open ${days} days`}>{label}</span>;
  const critical = tone === 'critical';
  const Icon = critical ? AlertTriangle : Clock;
  return (
    <span
      className={`inline-flex items-center gap-1 font-semibold tabular-nums ${critical ? 'text-red-700' : 'text-amber-800'}`}
      aria-label={`Open ${days} days, ${critical ? 'over 7 days' : 'getting old'}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {label}
      <span className="text-xs font-medium">{critical ? 'Over 7 days' : 'Getting old'}</span>
    </span>
  );
}
