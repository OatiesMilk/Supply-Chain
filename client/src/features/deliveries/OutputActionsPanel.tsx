import { Send } from 'lucide-react';
import { OutputActionConfig, OutputActionTrigger } from '@/types';

interface OutputActionsPanelProps {
  trigger: OutputActionTrigger;
  config: OutputActionConfig;
  onChange: (patch: Partial<OutputActionConfig>) => void;
}

type NotifyKey = 'notifyAM' | 'notifyLogistics' | 'notifyTASS';

const NOTIFY_ROLES: { key: NotifyKey; label: string }[] = [
  { key: 'notifyAM', label: 'AM' },
  { key: 'notifyLogistics', label: 'Logistics' },
  { key: 'notifyTASS', label: 'TASS' }
];

const NOTIFY_ALL: Pick<OutputActionConfig, NotifyKey> = { notifyAM: true, notifyLogistics: true, notifyTASS: true };
const NOTIFY_NONE: Pick<OutputActionConfig, NotifyKey> = { notifyAM: false, notifyLogistics: false, notifyTASS: false };

// A small configurable "leave the system" panel per IPO process-output event.
// Toggling here changes the shared, app-wide default for this trigger going
// forward - it is genuinely configuration, not a one-off per-click choice.
//
// Notifications are opt-out: every role is notified unless it is ticked here.
// The stored config keeps its positive notify* flags, so a ticked box means
// the matching flag is false.
export default function OutputActionsPanel({ trigger, config, onChange }: OutputActionsPanelProps) {
  const toggleExclusion = (key: NotifyKey) => onChange({ [key]: !config[key], internalOnly: false });

  const toggleExportPDF = () => onChange({ exportPDF: !config.exportPDF, internalOnly: false });

  const toggleInternalOnly = () => onChange(
    config.internalOnly
      ? { internalOnly: false, ...NOTIFY_ALL }
      : { internalOnly: true, ...NOTIFY_NONE, exportPDF: false }
  );

  return (
    <div
      className="border border-dashed border-slate-300 rounded-lg p-2.5 bg-slate-50/70 space-y-1.5"
      id={`output-actions-${trigger.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
        <Send className="w-3 h-3" /> Output Actions — When {trigger}
      </p>
      <p className="text-[10.5px] text-slate-500">
        All roles are notified by default. Tick a role to leave it out.
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <legend className="float-left mr-3 text-[10.5px] font-bold text-slate-600">Do not notify:</legend>
          {NOTIFY_ROLES.map(role => (
            <label key={role.key} className="flex items-center gap-1 text-[10.5px] font-semibold text-slate-600 cursor-pointer">
              <input type="checkbox" checked={!config[role.key]} onChange={() => toggleExclusion(role.key)} className="accent-[#0078C1]" />
              {role.label}
            </label>
          ))}
        </fieldset>
        <label className="flex items-center gap-1 text-[10.5px] font-semibold text-slate-600 cursor-pointer border-l border-slate-300 pl-3">
          <input type="checkbox" checked={config.exportPDF} onChange={toggleExportPDF} className="accent-[#0078C1]" />
          Export to PDF
        </label>
        <label className="flex items-center gap-1 text-[10.5px] font-semibold text-slate-500 cursor-pointer border-l border-slate-300 pl-3">
          <input type="checkbox" checked={config.internalOnly} onChange={toggleInternalOnly} className="accent-slate-500" />
          Internal Only
        </label>
      </div>
    </div>
  );
}
