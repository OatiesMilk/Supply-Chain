import { CheckCircle2, AlertTriangle, RefreshCw, PauseCircle } from 'lucide-react';
import { statusBadgeClass } from '@/utils/statusTheme';

interface Props {
  status: string;
}

const MAIN_STEPS = ['Draft', 'Scheduled', 'In Transit', 'Transport Complete', 'Complete'];

const STEP_STYLE: Record<string, string> = {
  done:    'bg-emerald-500 text-white border-emerald-500',
  active:  'bg-brand-blue text-white border-brand-blue',
  pending: 'bg-white text-slate-500 border-slate-300'
};

const SIDE_STATES: Record<string, { icon: typeof AlertTriangle; color: string; label: string }> = {
  'Pending':     { icon: AlertTriangle, color: statusBadgeClass('Pending'),     label: 'Pending'     },
  'On-Hold':     { icon: PauseCircle,   color: statusBadgeClass('On-Hold'),     label: 'On-Hold'     },
  'Rescheduled': { icon: RefreshCw,     color: statusBadgeClass('Rescheduled'), label: 'Rescheduled' }
};

export default function StatusStepper({ status }: Props) {
  const mainIdx = MAIN_STEPS.indexOf(status === 'Delivered' ? 'Complete' : status);
  const sideState = SIDE_STATES[status];

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {MAIN_STEPS.map((step, i) => {
        const isLastStep = i === MAIN_STEPS.length - 1;
        const isDone   = mainIdx > i || (mainIdx === i && isLastStep && !sideState);
        const isActive = mainIdx === i && !isLastStep && !sideState;
        const style    = isDone ? STEP_STYLE.done : isActive ? STEP_STYLE.active : STEP_STYLE.pending;

        return (
          <div key={step} className="flex items-center gap-1">
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold transition-all ${style}`}>
              {isDone
                ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                : isActive
                  ? <span className="w-3 h-3 rounded-full border-2 border-white bg-transparent inline-block" />
                  : <span className="w-3 h-3 rounded-full border border-current inline-block" />
              }
              {step}
            </div>
            {i < MAIN_STEPS.length - 1 && (
              <div className={`h-px w-4 ${isDone ? 'bg-emerald-400' : 'bg-slate-200'}`} />
            )}
          </div>
        );
      })}

      {sideState && (() => {
        const { icon: Icon, color, label } = sideState;
        return (
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ml-2 ${color}`}>
            <Icon className="w-3.5 h-3.5 shrink-0" /> {label}
          </div>
        );
      })()}
    </div>
  );
}
