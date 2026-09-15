import { CheckCircle2, AlertTriangle, RefreshCw, PauseCircle } from 'lucide-react';

interface Props {
  status: string;
}

const MAIN_STEPS = ['Pending', 'Scheduled', 'Delivered'];

const STEP_STYLE: Record<string, string> = {
  done:    'bg-emerald-500 text-white border-emerald-500',
  active:  'bg-[#0078C1] text-white border-[#0078C1]',
  pending: 'bg-white text-slate-300 border-slate-300'
};

const SIDE_STATES: Record<string, { icon: typeof AlertTriangle; color: string; label: string }> = {
  'On-Hold':     { icon: PauseCircle, color: 'text-red-600 bg-red-50 border-red-200',    label: 'On-Hold'     },
  'Rescheduled': { icon: RefreshCw,   color: 'text-purple-600 bg-purple-50 border-purple-200', label: 'Rescheduled' }
};

export default function StatusStepper({ status }: Props) {
  const mainIdx = MAIN_STEPS.indexOf(status);
  const sideState = SIDE_STATES[status];

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {MAIN_STEPS.map((step, i) => {
        const isLastStep = i === MAIN_STEPS.length - 1;
        const isDone   = mainIdx > i || (mainIdx === i && isLastStep && !sideState) || (sideState && i < 2);
        const isActive = mainIdx === i && !isLastStep && !sideState;
        const style    = isDone ? STEP_STYLE.done : isActive ? STEP_STYLE.active : STEP_STYLE.pending;

        return (
          <div key={step} className="flex items-center gap-1">
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black transition-all ${style}`}>
              {isDone
                ? <CheckCircle2 className="w-3 h-3 shrink-0" />
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
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black ml-2 ${color}`}>
            <Icon className="w-3 h-3 shrink-0" /> {label}
          </div>
        );
      })()}
    </div>
  );
}
