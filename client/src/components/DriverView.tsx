import { useState } from 'react';
import {
  Truck,
  CheckCircle,
  MapPin,
  Package,
  RefreshCw,
  Navigation,
  Mail,
  Bell,
  FileDown,
  Send,
  X,
  Clock,
  UserCheck
} from 'lucide-react';
import { DeliveryRecord, DeliveryStatus, OutputActionConfig, OutputActionTrigger } from '../types';
import { api } from '../api';
import { DRIVERS, VEHICLES, DRIVER_ASSISTANTS } from '../data';
import { getOutputTrigger, runOutputActions } from '../outputActions';
import { screenKeyForCategory } from '../screenRouting';

interface DriverViewProps {
  records: DeliveryRecord[];
  onUpdateRecord: (id: string, updates: Partial<DeliveryRecord>) => void;
  currentUserName: string;
  outputActionConfigs: Record<OutputActionTrigger, OutputActionConfig>;
  onNavigate: (screen: string, item_id?: string) => void;
}

const outputLineIcon = (message: string) => {
  if (message.startsWith('Notified Account Manager')) return <Mail className="w-3 h-3 shrink-0" />;
  if (message.startsWith('Exported')) return <FileDown className="w-3 h-3 shrink-0" />;
  if (message.startsWith('Notified')) return <Bell className="w-3 h-3 shrink-0" />;
  return <Send className="w-3 h-3 shrink-0" />;
};

// Logistics-operated dispatch board: simulates/manages what each driver sees and
// does in the field. There is no driver login here — every action taken is a
// named Logistics user acting on behalf of a driver, which is what makes the
// resulting Modified By audit trail traceable to a real account.
const STATUS_VERB: Record<string, string> = {
  Delivered:   'Accomplished',
  Pending:     'Pending',
  Rescheduled: 'Rescheduled',
};

export default function DriverView({
  records,
  onUpdateRecord,
  currentUserName,
  outputActionConfigs,
  onNavigate
}: DriverViewProps) {
  const [pendingAction, setPendingAction] = useState<{ rec: DeliveryRecord; status: DeliveryStatus } | null>(null);
  const [remarksInput, setRemarksInput] = useState('');
  const [receivedByInputs, setReceivedByInputs] = useState<Record<string, string>>({});

  const actorLabel = (driver: string) => `${currentUserName} (Logistics) on behalf of ${driver}`;

  const applyStatus = async (
    rec: DeliveryRecord,
    status: DeliveryStatus,
    remarks: string,
    extra?: { time_out?: string; received_by?: string }
  ) => {
    const now = new Date().toISOString();
    const updates: any = {
      status,
      status_remarks: remarks,
      modified_by: actorLabel(rec.driver),
      modified_at: now,
      ...(extra ?? {})
    };

    const trigger = getOutputTrigger(rec.category, status);
    if (trigger) {
      const result = await runOutputActions(trigger, outputActionConfigs[trigger], {
        amName: rec.account_manager, at: now, recordId: rec.id, api,
      });
      updates.output_actions_log = [...result.newEntries, ...rec.output_actions_log];
      updates.email_notification_sent = result.emailSent;
    }

    onUpdateRecord(rec.id, updates);
  };

  const assignVehicle = (rec: DeliveryRecord, vehicle: string) => {
    onUpdateRecord(rec.id, {
      vehicle,
      remarks: `Vehicle set to ${vehicle || '(None)'}`,
      modified_by: actorLabel(rec.driver),
      modified_at: new Date().toISOString()
    } as any);
  };

  const addAssistant = (rec: DeliveryRecord, assistant: string) => {
    if (!assistant || rec.driver_assistants.includes(assistant)) return;
    onUpdateRecord(rec.id, {
      driver_assistants: [...rec.driver_assistants, assistant],
      remarks: `Added assistant: ${assistant}`,
      modified_by: actorLabel(rec.driver),
      modified_at: new Date().toISOString()
    } as any);
  };

  const removeAssistant = (rec: DeliveryRecord, assistant: string) => {
    onUpdateRecord(rec.id, {
      driver_assistants: rec.driver_assistants.filter(a => a !== assistant),
      remarks: `Removed assistant: ${assistant}`,
      modified_by: actorLabel(rec.driver),
      modified_at: new Date().toISOString()
    } as any);
  };

  const allAssigned = records.filter(r => r.driver);
  const unassignedRecords = records.filter(r => !r.driver && r.status !== 'Delivered');

  return (
    <div className="space-y-6" id="driver-view-container">
      <div className="max-w-2xl">
        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Logistics Dispatch Board</h2>
        <p className="text-xs text-slate-400 mt-1">
          Manage what each driver sees and does in the field. Actions taken here are logged as your account acting on behalf of the driver — not a driver login.
        </p>
        {unassignedRecords.length > 0 && (
          <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5" id="unassigned-records-list">
            <p className="text-xs text-amber-700 font-bold mb-2">
              {unassignedRecords.length} record{unassignedRecords.length === 1 ? '' : 's'} still need a driver assigned — select one to open it:
            </p>
            <select
              defaultValue=""
              onChange={e => {
                const id = e.target.value;
                if (!id) return;
                const rec = unassignedRecords.find(r => r.id === id);
                if (rec) onNavigate(screenKeyForCategory(rec.category), rec.id);
              }}
              className="w-full bg-white border border-amber-300 text-amber-900 text-xs font-semibold rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400/40 cursor-pointer"
            >
              <option value="">— select a record to open —</option>
              {(['Sales Orders', 'Procurement Pick-up', 'Deliveries', 'RMA', 'Accounting Collection'] as const).map(cat => {
                const catRecords = unassignedRecords.filter(r => r.category === cat);
                if (catRecords.length === 0) return null;
                return (
                  <optgroup key={cat} label={cat}>
                    {catRecords.map(rec => (
                      <option key={rec.id} value={rec.id}>
                        {rec.reference} — {rec.company_name}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl p-3 shadow-sm border border-slate-200 flex items-center justify-between text-xs max-w-2xl">
        <div className="text-center flex-1 border-r border-slate-100">
          <span className="text-slate-400 block text-[9px] uppercase font-bold tracking-wider">Assigned</span>
          <span className="text-sm font-bold text-slate-800">{allAssigned.length}</span>
        </div>
        <div className="text-center flex-1 border-r border-slate-100">
          <span className="text-slate-400 block text-[9px] uppercase font-bold tracking-wider">Pending</span>
          <span className="text-sm font-bold text-amber-600">
            {allAssigned.filter(d => d.status === 'Pending' || d.status === 'Scheduled').length}
          </span>
        </div>
        <div className="text-center flex-1">
          <span className="text-slate-400 block text-[9px] uppercase font-bold tracking-wider">Accomplished</span>
          <span className="text-sm font-bold text-emerald-600">
            {allAssigned.filter(d => d.status === 'Delivered').length}
          </span>
        </div>
      </div>

      {/* One phone-mockup "field view" per driver, so Logistics can simulate/manage each driver's day individually */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6" id="driver-board">
        {DRIVERS.map(driver => {
          const driverRecords = records.filter(r => r.driver === driver);

          return (
            <div key={driver} className="relative border-[10px] border-slate-800 rounded-[36px] w-full max-w-[360px] h-[640px] bg-slate-50 shadow-2xl flex flex-col overflow-hidden mx-auto" id={`phone-frame-${driver.replace(/[^a-z0-9]/gi, '-')}`}>
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 h-4 w-32 bg-slate-800 rounded-b-xl z-30 flex items-center justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-600 mr-2" />
                <span className="w-12 h-1 bg-slate-700 rounded-full" />
              </div>

              <div className="bg-[#1F3864] text-white pt-6 pb-4 px-4 shrink-0 shadow-sm z-20">
                <div className="flex items-center justify-between text-xs mt-1.5">
                  <span className="font-bold tracking-tight">Microgenesis Field Mobile</span>
                  <div className="flex items-center gap-1.5 bg-blue-900/60 border border-blue-500/20 px-2 py-0.5 rounded-full text-[9px]">
                    <Truck className="w-3 h-3 text-amber-400" />
                    <span>GPS Active</span>
                  </div>
                </div>
                <div className="mt-3">
                  <span className="text-[9px] text-blue-200 font-semibold uppercase tracking-wider block">Field View For</span>
                  <span className="text-sm font-bold block truncate">{driver}</span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-3 pb-8">
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest px-1">
                  Assigned Runs ({driverRecords.length})
                </div>

                {driverRecords.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center bg-white rounded-xl p-4 border border-slate-200 text-xs">
                    <CheckCircle className="w-8 h-8 text-emerald-500 mb-2" />
                    <p className="font-bold text-slate-700">All runs done!</p>
                    <p className="text-slate-400 text-[10px]">No assigned records remaining for {driver} today.</p>
                  </div>
                ) : (
                  driverRecords.map(rec => {
                    let bgClass = 'bg-slate-100 border-slate-200 text-slate-700';
                    if (rec.status === 'Delivered') bgClass = 'bg-emerald-50 border-emerald-200 text-emerald-700';
                    else if (rec.status === 'On-Hold') bgClass = 'bg-red-50 border-red-200 text-red-700';
                    else if (rec.status === 'Rescheduled') bgClass = 'bg-purple-50 border-purple-200 text-purple-700';
                    else if (rec.status === 'Pending' || rec.status === 'Scheduled') bgClass = 'bg-amber-50 border-amber-200 text-amber-700';

                    return (
                      <div key={rec.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 space-y-2.5 text-xs relative overflow-hidden">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900 font-mono text-[10px]">{rec.reference}</span>
                          <span className="text-[8px] font-bold uppercase tracking-wide text-slate-400">{rec.category}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className={`px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider ${bgClass}`}>{rec.status}</span>
                          <span className="text-[9px] text-slate-400 font-mono">{rec.delivery_date}</span>
                        </div>

                        <div className="space-y-1">
                          <h4 className="font-bold text-slate-800 text-[11px] leading-tight">{rec.company_name}</h4>
                          <p className="text-[10px] text-slate-500 flex items-start gap-1">
                            <MapPin className="w-3 h-3 text-red-500 shrink-0 mt-0.5" />
                            <span className="leading-tight">{rec.area}</span>
                          </p>
                        </div>

                        {rec.item_description && (
                          <div className="bg-slate-50 p-2 rounded-lg border border-slate-150 text-[10px] space-y-1 text-slate-600">
                            <p className="font-bold text-slate-400 flex items-center gap-1 uppercase text-[9px] tracking-wider">
                              <Package className="w-3.5 h-3.5 text-slate-400" /> Item Summary:
                            </p>
                            <p className="leading-tight font-mono text-[9px]">{rec.item_description}</p>
                          </div>
                        )}

                        {/* Vehicle assignment - set by Logistics on behalf of the driver */}
                        <select value={rec.vehicle} onChange={(e) => assignVehicle(rec, e.target.value)} className="w-full text-[9px] border border-slate-200 rounded p-1 bg-white">
                          {VEHICLES.map(v => <option key={v} value={v}>{v}</option>)}
                        </select>

                        {/* Driver Assistant assignment - supports multiple assistants */}
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-1">
                            {rec.driver_assistants.length === 0 && (
                              <span className="text-[9px] text-slate-400 italic">No assistants assigned</span>
                            )}
                            {rec.driver_assistants.map(a => (
                              <span key={a} className="flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-full pl-2 pr-1 py-0.5 text-[9px] font-semibold text-slate-600">
                                {a}
                                <button
                                  onClick={() => removeAssistant(rec, a)}
                                  className="text-slate-400 hover:text-red-500 transition-colors"
                                  title="Remove"
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </span>
                            ))}
                          </div>
                          <select
                            value=""
                            onChange={(e) => { addAssistant(rec, e.target.value); e.target.value = ''; }}
                            className="w-full text-[9px] border border-slate-200 rounded p-1 bg-white"
                          >
                            <option value="">-- Add Assistant --</option>
                            {DRIVER_ASSISTANTS.filter(a => !rec.driver_assistants.includes(a)).map(a => (
                              <option key={a} value={a}>{a}</option>
                            ))}
                          </select>
                        </div>

                        {(() => {
                          const lastActionEntries = rec.output_actions_log.filter(e => e.at === rec.modified_at);
                          if (lastActionEntries.length > 0) {
                            return (
                              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md p-1.5 space-y-0.5 text-[9px] font-semibold">
                                {lastActionEntries.map((entry, i) => (
                                  <span key={i} className="flex items-center gap-1.5">{outputLineIcon(entry.message)} {entry.message}</span>
                                ))}
                              </div>
                            );
                          }
                          if (rec.status === 'Delivered' && rec.email_notification_sent) {
                            return (
                              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md p-1.5 flex items-center gap-1.5 text-[9px] font-semibold">
                                <Mail className="w-3 h-3 shrink-0" /> Email sent to: {rec.account_manager}
                              </div>
                            );
                          }
                          return null;
                        })()}

                        {/* ePOD gated flow */}
                        {rec.status !== 'Delivered' && (
                          <div className="space-y-2 pt-1 border-t border-slate-100">
                            {/* Step 1: Time In */}
                            {!rec.time_in ? (
                              <button
                                onClick={() => onUpdateRecord(rec.id, { time_in: new Date().toISOString(), remarks: 'Time In recorded' } as any)}
                                className="w-full py-2 rounded-lg font-bold text-[9px] tracking-wide uppercase bg-blue-600 hover:bg-blue-700 text-white transition-all flex items-center justify-center gap-1.5"
                              >
                                <Clock className="w-3.5 h-3.5" /> Time In
                              </button>
                            ) : (
                              <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-2 py-1.5 text-[9px] text-blue-700 font-bold">
                                <Clock className="w-3 h-3 text-blue-500 shrink-0" />
                                Time In: {new Date(rec.time_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            )}

                            {/* Step 2: Received By (appears after Time In) */}
                            {rec.time_in && (
                              <div className="space-y-1">
                                <label className="text-[8px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                  <UserCheck className="w-3 h-3" /> Receiver Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                  type="text"
                                  value={receivedByInputs[rec.id] ?? ''}
                                  onChange={e => setReceivedByInputs(prev => ({ ...prev, [rec.id]: e.target.value }))}
                                  placeholder="Name of person who received..."
                                  className="w-full border border-slate-200 rounded px-2 py-1 text-[9px] focus:outline-none focus:ring-1 focus:ring-[#0078C1]/30 focus:border-[#0078C1]"
                                />
                              </div>
                            )}

                            {/* Step 3: Status buttons */}
                            <div className="grid grid-cols-3 gap-1.5">
                              <button
                                disabled={!rec.time_in || !receivedByInputs[rec.id]?.trim()}
                                onClick={() => { setPendingAction({ rec, status: 'Delivered' }); setRemarksInput(''); }}
                                className="py-2 rounded-lg font-bold text-[9px] tracking-wide uppercase bg-emerald-600 hover:bg-emerald-700 text-white transition-all flex flex-col items-center gap-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <CheckCircle className="w-3.5 h-3.5" /> Accomplished
                              </button>
                              <button
                                onClick={() => { setPendingAction({ rec, status: 'Pending' }); setRemarksInput(''); }}
                                className="py-2 rounded-lg font-bold text-[9px] tracking-wide uppercase bg-amber-500 hover:bg-amber-600 text-white transition-all flex flex-col items-center gap-0.5"
                              >
                                <Navigation className="w-3.5 h-3.5" /> Pending
                              </button>
                              <button
                                onClick={() => { setPendingAction({ rec, status: 'Rescheduled' }); setRemarksInput(''); }}
                                className="py-2 rounded-lg font-bold text-[9px] tracking-wide uppercase bg-purple-500 hover:bg-purple-600 text-white transition-all flex flex-col items-center gap-0.5"
                              >
                                <RefreshCw className="w-3.5 h-3.5" /> Reschedule
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="h-10 bg-white border-t border-slate-200 shrink-0 flex items-center justify-around text-slate-400 text-[10px] font-bold px-4 z-20">
                <span className="text-[#1F3864]">● active runs</span>
                <span>● Logistics-managed</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Status confirmation modal */}
      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm space-y-4 p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-slate-900">Confirm Status Change</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Mark{' '}
                  <span className="font-bold text-slate-800">{pendingAction.rec.reference}</span>
                  {' '}as{' '}
                  <span className="font-bold text-slate-800">
                    {STATUS_VERB[pendingAction.status] ?? pendingAction.status}
                  </span>
                </p>
              </div>
              <button
                onClick={() => setPendingAction(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors mt-0.5 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider block">
                Remarks <span className="text-red-500">*</span>
              </label>
              <textarea
                value={remarksInput}
                onChange={e => setRemarksInput(e.target.value)}
                rows={3}
                placeholder="Enter remarks..."
                autoFocus
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1] resize-none"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setPendingAction(null); setRemarksInput(''); }}
                className="px-4 py-2 border border-slate-300 text-slate-600 hover:bg-slate-50 text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={!remarksInput.trim()}
                onClick={() => {
                  const extra = pendingAction.status === 'Delivered'
                    ? { time_out: new Date().toISOString(), received_by: receivedByInputs[pendingAction.rec.id] ?? '' }
                    : undefined;
                  applyStatus(pendingAction.rec, pendingAction.status, remarksInput.trim(), extra);
                  setPendingAction(null);
                  setRemarksInput('');
                }}
                className="px-4 py-2 bg-[#1F3864] hover:bg-[#0078C1] text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
