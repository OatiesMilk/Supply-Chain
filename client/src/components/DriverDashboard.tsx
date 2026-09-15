import { useState } from 'react';
import {
  CheckCircle,
  MapPin,
  Package,
  RefreshCw,
  Navigation,
  Clock,
  UserCheck,
  LogOut,
  X,
  Loader2
} from 'lucide-react';
import { DeliveryRecord, DeliveryStatus } from '../types';

interface DriverDashboardProps {
  records: DeliveryRecord[];
  currentUserName: string;
  onUpdateRecord: (id: string, updates: Partial<DeliveryRecord>) => void;
  onLogout: () => void;
  dataLoading: boolean;
}

const STATUS_VERB: Record<string, string> = {
  Delivered:   'Accomplished',
  Pending:     'Pending',
  Rescheduled: 'Rescheduled',
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function DriverDashboard({
  records,
  currentUserName,
  onUpdateRecord,
  onLogout,
  dataLoading
}: DriverDashboardProps) {
  const today = new Date().toISOString().split('T')[0];
  const todayLabel = new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const [pendingAction, setPendingAction] = useState<{ rec: DeliveryRecord; status: DeliveryStatus } | null>(null);
  const [remarksInput, setRemarksInput] = useState('');
  const [receivedByInputs, setReceivedByInputs] = useState<Record<string, string>>({});

  // Show all assigned records (backend already filters to this driver's records)
  const todayRecs = records.filter(r => r.delivery_date === today);
  const activeRecs = todayRecs.filter(r => r.status !== 'Delivered');
  const doneRecs = todayRecs.filter(r => r.status === 'Delivered');

  const handleTimeIn = (rec: DeliveryRecord) => {
    onUpdateRecord(rec.id, { time_in: new Date().toISOString() } as any);
  };

  const applyStatus = (rec: DeliveryRecord, status: DeliveryStatus, remarks: string) => {
    const extra = status === 'Delivered'
      ? { time_out: new Date().toISOString(), received_by: receivedByInputs[rec.id]?.trim() || null }
      : undefined;
    onUpdateRecord(rec.id, {
      status,
      status_remarks: remarks,
      modified_by: currentUserName,
      modified_at: new Date().toISOString(),
      ...(extra ?? {})
    } as any);
  };

  const statusBadge = (status: DeliveryStatus) => {
    switch (status) {
      case 'Delivered':   return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'Pending':     return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'Rescheduled': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'On-Hold':     return 'bg-red-100 text-red-700 border-red-200';
      default:            return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F4F8] flex flex-col">
      {/* Header */}
      <div className="bg-[#1F3864] text-white px-4 pt-10 pb-5 shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase text-blue-200">Microgenesis Field Mobile</p>
            <h1 className="text-lg font-black leading-tight">{currentUserName}</h1>
            <p className="text-[11px] text-blue-200 mt-0.5">{todayLabel}</p>
          </div>
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 text-[10px] font-bold text-white/70 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" /> Log Out
          </button>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-3 mt-3">
          {[
            { label: "Today's Runs", value: todayRecs.length, color: 'text-white' },
            { label: 'Accomplished', value: doneRecs.length, color: 'text-emerald-300' },
            { label: 'Remaining', value: activeRecs.length, color: 'text-amber-300' },
          ].map(s => (
            <div key={s.label} className="bg-white/10 rounded-xl px-3 py-2.5 text-center">
              <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-[9px] text-blue-200 font-bold uppercase tracking-wider mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 px-4 py-5 space-y-4 max-w-lg mx-auto w-full">
        {dataLoading && (
          <div className="flex items-center justify-center gap-2 py-6 text-slate-400 text-xs">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading runs…
          </div>
        )}

        {!dataLoading && todayRecs.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <CheckCircle className="w-10 h-10 mx-auto mb-3 text-emerald-400" />
            <p className="font-bold text-slate-600">No runs scheduled for today.</p>
            <p className="text-xs mt-1">Check back later or contact Logistics.</p>
          </div>
        )}

        {/* Active records */}
        {activeRecs.map(rec => {
          return (
            <div key={rec.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              {/* Card header */}
              <div className="bg-slate-50 border-b border-slate-100 px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="font-mono text-[10px] text-slate-400">{rec.reference}</p>
                  <p className="font-black text-sm text-slate-900 leading-tight">{rec.company_name}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider ${statusBadge(rec.status)}`}>
                  {rec.status}
                </span>
              </div>

              <div className="px-4 py-3 space-y-3">
                <div className="flex items-start gap-4 text-xs text-slate-500">
                  <p className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    {rec.area}
                  </p>
                  {rec.item_description && (
                    <p className="flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      {rec.item_description.slice(0, 40)}{rec.item_description.length > 40 ? '…' : ''}
                    </p>
                  )}
                </div>

                {/* ePOD flow */}
                <div className="space-y-2.5 border-t border-slate-100 pt-3">
                  {/* Step 1: Time In */}
                  {!rec.time_in ? (
                    <button
                      onClick={() => handleTimeIn(rec)}
                      className="w-full py-2.5 rounded-xl font-bold text-xs tracking-wide uppercase bg-blue-600 hover:bg-blue-700 text-white transition-all flex items-center justify-center gap-2"
                    >
                      <Clock className="w-4 h-4" /> Record Time In
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 text-xs text-blue-700 font-bold">
                      <Clock className="w-4 h-4 text-blue-500 shrink-0" />
                      Time In recorded: {fmtTime(rec.time_in)}
                    </div>
                  )}

                  {/* Receiver Name — always visible, optional */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <UserCheck className="w-3.5 h-3.5" /> Received By
                    </label>
                    <input
                      type="text"
                      value={receivedByInputs[rec.id] ?? ''}
                      onChange={e => setReceivedByInputs(prev => ({ ...prev, [rec.id]: e.target.value }))}
                      placeholder="Name of person who received the item…"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]"
                    />
                  </div>

                  {/* Step 3: Status buttons */}
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => { setPendingAction({ rec, status: 'Delivered' }); setRemarksInput(''); }}
                      className="py-2.5 rounded-xl font-bold text-[10px] tracking-wide uppercase bg-emerald-600 hover:bg-emerald-700 text-white transition-all flex flex-col items-center gap-1 cursor-pointer"
                    >
                      <CheckCircle className="w-4 h-4" /> Accomplish
                    </button>
                    <button
                      onClick={() => { setPendingAction({ rec, status: 'Pending' }); setRemarksInput(''); }}
                      className="py-2.5 rounded-xl font-bold text-[10px] tracking-wide uppercase bg-amber-500 hover:bg-amber-600 text-white transition-all flex flex-col items-center gap-1"
                    >
                      <Navigation className="w-4 h-4" /> Pending
                    </button>
                    <button
                      onClick={() => { setPendingAction({ rec, status: 'Rescheduled' }); setRemarksInput(''); }}
                      className="py-2.5 rounded-xl font-bold text-[10px] tracking-wide uppercase bg-purple-500 hover:bg-purple-600 text-white transition-all flex flex-col items-center gap-1"
                    >
                      <RefreshCw className="w-4 h-4" /> Reschedule
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Completed records */}
        {doneRecs.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-200" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Accomplished ({doneRecs.length})</p>
              <div className="flex-1 h-px bg-slate-200" />
            </div>
            {doneRecs.map(rec => (
              <div key={rec.id} className="bg-white rounded-2xl border border-emerald-200 px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] text-slate-400">{rec.reference}</p>
                  <p className="font-bold text-sm text-slate-800 truncate">{rec.company_name}</p>
                  <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3 text-red-400 shrink-0" />{rec.area}
                  </p>
                  {(rec.time_in || rec.time_out) && (
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-500 font-bold">
                      {rec.time_in && <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-blue-400" /> In: {fmtTime(rec.time_in)}</span>}
                      {rec.time_out && <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-emerald-400" /> Out: {fmtTime(rec.time_out)}</span>}
                    </div>
                  )}
                  {rec.received_by && (
                    <p className="text-[10px] text-emerald-600 font-bold mt-0.5 flex items-center gap-1">
                      <UserCheck className="w-3 h-3" /> {rec.received_by}
                    </p>
                  )}
                </div>
                <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full shrink-0">
                  Done
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Other-day records (not today) */}
        {records.filter(r => r.delivery_date !== today && r.status !== 'Delivered').length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-200" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Other Dates</p>
              <div className="flex-1 h-px bg-slate-200" />
            </div>
            {records
              .filter(r => r.delivery_date !== today && r.status !== 'Delivered')
              .map(rec => (
                <div key={rec.id} className="bg-white/70 rounded-xl border border-slate-200 px-4 py-2.5 flex items-center justify-between">
                  <div>
                    <p className="font-mono text-[10px] text-slate-400">{rec.reference} · {rec.delivery_date}</p>
                    <p className="text-xs font-bold text-slate-700">{rec.company_name}</p>
                  </div>
                  <span className={`text-[9px] font-bold border px-2 py-0.5 rounded-full ${statusBadge(rec.status)}`}>{rec.status}</span>
                </div>
              ))
            }
          </div>
        )}
      </div>

      {/* Status confirmation modal */}
      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm space-y-4 p-6 mb-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-slate-900">Confirm Status</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Mark <span className="font-bold text-slate-800">{pendingAction.rec.reference}</span> as{' '}
                  <span className="font-bold text-slate-800">{STATUS_VERB[pendingAction.status] ?? pendingAction.status}</span>
                </p>
              </div>
              <button onClick={() => { setPendingAction(null); setRemarksInput(''); }} className="text-slate-400 hover:text-slate-600 cursor-pointer">
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
                placeholder="Enter remarks…"
                autoFocus
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1] resize-none"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setPendingAction(null); setRemarksInput(''); }}
                className="px-4 py-2 border border-slate-300 text-slate-600 hover:bg-slate-50 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={!remarksInput.trim()}
                onClick={() => {
                  applyStatus(pendingAction.rec, pendingAction.status, remarksInput.trim());
                  setPendingAction(null);
                  setRemarksInput('');
                }}
                className="px-4 py-2 bg-[#1F3864] hover:bg-[#0078C1] text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
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
