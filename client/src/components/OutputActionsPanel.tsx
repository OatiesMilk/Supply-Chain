import { Send } from 'lucide-react';
import { OutputActionConfig, OutputActionTrigger } from '../types';

interface OutputActionsPanelProps {
  trigger: OutputActionTrigger;
  config: OutputActionConfig;
  onChange: (patch: Partial<OutputActionConfig>) => void;
}

const TOGGLES: { key: keyof OutputActionConfig; label: string }[] = [
  { key: 'notifyAM', label: 'Notify AM' },
  { key: 'notifyLogistics', label: 'Notify Logistics' },
  { key: 'notifyTASS', label: 'Notify TASS' },
  { key: 'exportPDF', label: 'Export to PDF' }
];

// A small configurable "leave the system" panel per IPO process-output event.
// Toggling here changes the shared, app-wide default for this trigger going
// forward - it is genuinely configuration, not a one-off per-click choice.
export default function OutputActionsPanel({ trigger, config, onChange }: OutputActionsPanelProps) {
  const toggle = (key: keyof OutputActionConfig) => {
    if (key === 'internalOnly') {
      onChange({ internalOnly: !config.internalOnly, notifyAM: false, notifyLogistics: false, notifyTASS: false, exportPDF: false });
    } else {
      onChange({ [key]: !config[key], internalOnly: false } as Partial<OutputActionConfig>);
    }
  };

  return (
    <div
      className="border border-dashed border-slate-300 rounded-lg p-2.5 bg-slate-50/70 space-y-1.5"
      id={`output-actions-${trigger.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
        <Send className="w-3 h-3" /> Output Actions — When {trigger}
      </p>
      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        {TOGGLES.map(t => (
          <label key={t.key} className="flex items-center gap-1 text-[10.5px] font-semibold text-slate-600 cursor-pointer">
            <input type="checkbox" checked={config[t.key] as boolean} onChange={() => toggle(t.key)} className="accent-[#0078C1]" />
            {t.label}
          </label>
        ))}
        <label className="flex items-center gap-1 text-[10.5px] font-semibold text-slate-500 cursor-pointer border-l border-slate-300 pl-3">
          <input type="checkbox" checked={config.internalOnly} onChange={() => toggle('internalOnly')} className="accent-slate-500" />
          Internal Only
        </label>
      </div>
    </div>
  );
}
