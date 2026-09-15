import { useState, useEffect, useCallback } from 'react';
import {
  Shuffle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ChevronRight,
  Layers,
  RotateCcw,
  PlusCircle,
  Save,
  Trash2
} from 'lucide-react';
import { api, ApiCompany, ApiError } from '../api';
import { AREAS, VEHICLES, PRIORITIES, ITEM_TYPES, ACCOUNT_MANAGERS, DRIVERS } from '../data';

interface ModuleCount {
  key: string;
  label: string;
  count: number;
}

interface Props {
  companies: ApiCompany[];
  currentUserName: string;
  onRefresh: () => void;
}

const MODULE_ICONS: Record<string, string> = {
  deliveries:            '🚚',
  rma:                   '↩️',
  accounting_collection: '💳',
  procurement_pickup:    '📦',
  sales_orders:          '🛒',
};

const MODULE_COLORS: Record<string, string> = {
  deliveries:            'border-blue-200 bg-blue-50 hover:border-blue-400',
  rma:                   'border-purple-200 bg-purple-50 hover:border-purple-400',
  accounting_collection: 'border-emerald-200 bg-emerald-50 hover:border-emerald-400',
  procurement_pickup:    'border-amber-200 bg-amber-50 hover:border-amber-400',
  sales_orders:          'border-indigo-200 bg-indigo-50 hover:border-indigo-400',
};

const MODULE_ACTIVE: Record<string, string> = {
  deliveries:            'border-blue-500 bg-blue-100 ring-2 ring-blue-200',
  rma:                   'border-purple-500 bg-purple-100 ring-2 ring-purple-200',
  accounting_collection: 'border-emerald-500 bg-emerald-100 ring-2 ring-emerald-200',
  procurement_pickup:    'border-amber-500 bg-amber-100 ring-2 ring-amber-200',
  sales_orders:          'border-indigo-500 bg-indigo-100 ring-2 ring-indigo-200',
};

const DEFAULT_STATUSES = ['Scheduled', 'Delivered', 'On-Hold', 'Rescheduled', 'Pending'];

const REF_PREFIXES: Record<string, string> = {
  deliveries:            'SAP',
  rma:                   'SAP-RMA',
  accounting_collection: 'SAP-COLL',
  procurement_pickup:    'SAP-PU',
  sales_orders:          'SAP-SO',
};

function randRef(prefix: string) {
  return `${prefix}-${Date.now().toString().slice(-5)}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

function randDate(daysBack = 30, daysForward = 14) {
  const offset = Math.floor(Math.random() * (daysBack + daysForward)) - daysBack;
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split('T')[0];
}

function buildManualDefaults(module: string, companies: ApiCompany[]) {
  const prefix = REF_PREFIXES[module] ?? 'SAP';
  const company = companies[Math.floor(Math.random() * companies.length)];
  const isAC = module === 'accounting_collection';
  return {
    company_id: company?.id ?? '',
    priority: '2 - Moderate',
    reference: randRef(prefix),
    remarks: '',
    status: 'Scheduled',
    vehicle: '(None)',
    area: AREAS[Math.floor(Math.random() * AREAS.length)],
    driver: '',
    driver_assistant: '',
    account_manager: ACCOUNT_MANAGERS[Math.floor(Math.random() * ACCOUNT_MANAGERS.length)],
    delivery_date: randDate(),
    item_type: 'Small Item',
    item_description: '',
    amount: isAC ? String(Math.round((Math.random() * 145000 + 5000) / 1000) * 1000) : '',
  };
}

export default function DataSamplerView({ companies, currentUserName, onRefresh }: Props) {
  const [mode, setMode] = useState<'random' | 'manual'>('random');
  const [modules, setModules] = useState<ModuleCount[]>([]);
  const [countsLoading, setCountsLoading] = useState(false);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [bulkCount, setBulkCount] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [manualFields, setManualFields] = useState<Record<string, string>>({});
  const [savingManual, setSavingManual] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetMode, setResetMode] = useState<'full' | 'seed'>('full');
  const [resetting, setResetting] = useState(false);
  const [resetBanner, setResetBanner] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const loadCounts = useCallback(async () => {
    setCountsLoading(true);
    try {
      const data = await api.dataSampler.getCounts();
      setModules(data);
    } catch {
      // counts are non-critical; silently skip
    } finally {
      setCountsLoading(false);
    }
  }, []);

  useEffect(() => { loadCounts(); }, [loadCounts]);

  const clearMessages = () => { setSuccessMsg(null); setErrorMsg(null); };

  const handleSelectModule = (key: string) => {
    setSelectedModule(key);
    clearMessages();
    if (mode === 'manual' && companies.length > 0) {
      setManualFields(buildManualDefaults(key, companies));
    }
  };

  const handleModeChange = (m: 'random' | 'manual') => {
    setMode(m);
    clearMessages();
    if (m === 'manual' && selectedModule && companies.length > 0) {
      setManualFields(buildManualDefaults(selectedModule, companies));
    }
  };

  const handleGenerate = async (andNew = false) => {
    if (!selectedModule) return;
    clearMessages();

    const isManual = mode === 'manual';
    setGenerating(true);
    setSavingManual(isManual);

    try {
      const fields = isManual
        ? {
            ...manualFields,
            amount: manualFields.amount ? parseFloat(manualFields.amount) : undefined,
          }
        : undefined;

      const result = await api.dataSampler.generate({
        module: selectedModule,
        count: isManual ? 1 : bulkCount,
        fields,
      });

      setSuccessMsg(`${result.created} record${result.created !== 1 ? 's' : ''} created in ${modules.find(m => m.key === selectedModule)?.label ?? selectedModule}.`);
      await loadCounts();
      onRefresh();

      if (andNew && isManual && companies.length > 0) {
        setManualFields(buildManualDefaults(selectedModule, companies));
      }
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Generation failed. Please try again.');
    } finally {
      setGenerating(false);
      setSavingManual(false);
    }
  };

  const handleRandomizeAgain = () => {
    if (selectedModule && companies.length > 0) {
      setManualFields(buildManualDefaults(selectedModule, companies));
      clearMessages();
    }
  };

  const patch = (key: string, value: string) =>
    setManualFields(prev => ({ ...prev, [key]: value }));

  const handleReset = async () => {
    setResetting(true);
    try {
      const result = await api.dataSampler.reset(resetMode);
      setShowResetModal(false);
      setResetBanner({
        type: 'success',
        msg: resetMode === 'seed'
          ? `Reset complete. ${result.deleted} record${result.deleted !== 1 ? 's' : ''} deleted. Seed data restored.`
          : `Reset complete. ${result.deleted} record${result.deleted !== 1 ? 's' : ''} deleted.`
      });
      setSelectedModule(null);
      clearMessages();
      await loadCounts();
      onRefresh();
    } catch (err) {
      setShowResetModal(false);
      setResetBanner({
        type: 'error',
        msg: err instanceof ApiError ? err.message : 'Reset failed. Please try again.'
      });
    } finally {
      setResetting(false);
    }
  };

  const isAC = selectedModule === 'accounting_collection';

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#1F3864] to-[#122B4F] text-white p-6 rounded-xl shadow-md border-l-8 border-l-violet-500">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] bg-violet-600 text-white font-extrabold px-2 py-0.5 rounded tracking-widest uppercase">ADMIN TOOL</span>
              <span className="text-sm text-slate-200 font-bold tracking-wider uppercase">Data Sampler</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight">Generate Sample Records</h1>
            <p className="text-slate-300 text-sm mt-1">
              Populate modules with realistic test data for demos and development. Admin only.
            </p>
          </div>
          <button
            onClick={() => { setShowResetModal(true); setResetMode('full'); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-500 text-white text-[11px] font-bold rounded-lg transition-colors cursor-pointer shrink-0 mt-1"
          >
            <Trash2 className="w-3.5 h-3.5" /> Reset All Data
          </button>
        </div>
      </div>

      {/* Warning banner */}
      <div className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-3 flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-black text-amber-800 uppercase tracking-wide">Generates real DB records</p>
          <p className="text-xs text-amber-700 mt-0.5">
            All generated records are written to the live database, appear in audit logs attributed to <strong>{currentUserName}</strong>, and are fully visible to all roles. Use the demo reset button in the header to wipe all data and reseed.
          </p>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-lg p-1 w-fit">
        <button
          onClick={() => handleModeChange('random')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition-all cursor-pointer ${
            mode === 'random'
              ? 'bg-white text-slate-800 shadow-sm border border-slate-200'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Shuffle className="w-3.5 h-3.5" /> Fully Randomized
        </button>
        <button
          onClick={() => handleModeChange('manual')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition-all cursor-pointer ${
            mode === 'manual'
              ? 'bg-white text-slate-800 shadow-sm border border-slate-200'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Layers className="w-3.5 h-3.5" /> Manual with Suggestions
        </button>
      </div>

      {/* Module grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-black text-slate-600 uppercase tracking-wider">Select Module</h2>
          <button
            onClick={loadCounts}
            disabled={countsLoading}
            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600 font-bold cursor-pointer transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${countsLoading ? 'animate-spin' : ''}`} />
            Refresh counts
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {modules.length === 0 && countsLoading
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-24 bg-slate-100 rounded-xl border border-slate-200 animate-pulse" />
              ))
            : modules.map(m => (
                <button
                  key={m.key}
                  onClick={() => handleSelectModule(m.key)}
                  className={`relative p-4 rounded-xl border-2 text-left transition-all cursor-pointer ${
                    selectedModule === m.key
                      ? MODULE_ACTIVE[m.key] ?? 'border-slate-500 bg-slate-100 ring-2 ring-slate-200'
                      : MODULE_COLORS[m.key] ?? 'border-slate-200 bg-slate-50 hover:border-slate-400'
                  }`}
                >
                  <div className="text-xl mb-2">{MODULE_ICONS[m.key] ?? '📋'}</div>
                  <p className="text-[11px] font-black text-slate-800 leading-tight">{m.label}</p>
                  <p className="text-[10px] text-slate-500 mt-1 font-bold tabular-nums">
                    {countsLoading ? '…' : `${m.count} record${m.count !== 1 ? 's' : ''}`}
                  </p>
                  {selectedModule === m.key && (
                    <ChevronRight className="absolute top-2 right-2 w-3 h-3 text-slate-600" />
                  )}
                </button>
              ))
          }
        </div>
      </div>

      {/* Action panel */}
      {selectedModule && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
            {MODULE_ICONS[selectedModule]} {modules.find(m => m.key === selectedModule)?.label ?? selectedModule}
            <span className="text-[10px] font-bold text-slate-400 normal-case tracking-normal">
              — {mode === 'random' ? 'Fully Randomized' : 'Manual with Suggestions'}
            </span>
          </h3>

          {mode === 'random' ? (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-2">
                  Number of records to generate: <span className="text-[#0078C1] font-black">{bulkCount}</span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={50}
                  value={bulkCount}
                  onChange={e => setBulkCount(Number(e.target.value))}
                  className="w-full accent-[#0078C1] cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-slate-400 font-bold mt-1">
                  <span>1</span><span>10</span><span>20</span><span>30</span><span>40</span><span>50</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                Records will use realistic weighted distributions: 50% Scheduled, 20% Delivered, 15% Pending, 10% Rescheduled, 5% On-Hold. Dates span the last 30 days to 14 days ahead.
              </p>
              <button
                onClick={() => handleGenerate(false)}
                disabled={generating}
                className="flex items-center gap-2 px-6 py-2.5 bg-[#1F3864] hover:bg-[#0078C1] text-white text-xs font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shuffle className="w-3.5 h-3.5" />}
                Generate {bulkCount} Record{bulkCount !== 1 ? 's' : ''}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Company */}
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wide block mb-1">Company</label>
                  <select
                    value={manualFields.company_id ?? ''}
                    onChange={e => patch('company_id', e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]"
                  >
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {/* Reference */}
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wide block mb-1">Reference</label>
                  <input
                    type="text"
                    value={manualFields.reference ?? ''}
                    onChange={e => patch('reference', e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]"
                  />
                </div>

                {/* Status */}
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wide block mb-1">Status</label>
                  <select
                    value={manualFields.status ?? 'Scheduled'}
                    onChange={e => patch('status', e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]"
                  >
                    {DEFAULT_STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>

                {/* Priority */}
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wide block mb-1">Priority</label>
                  <select
                    value={manualFields.priority ?? '2 - Moderate'}
                    onChange={e => patch('priority', e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]"
                  >
                    {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>

                {/* Delivery Date */}
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wide block mb-1">Delivery Date</label>
                  <input
                    type="date"
                    value={manualFields.delivery_date ?? ''}
                    onChange={e => patch('delivery_date', e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]"
                  />
                </div>

                {/* Area */}
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wide block mb-1">Area</label>
                  <select
                    value={manualFields.area ?? ''}
                    onChange={e => patch('area', e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]"
                  >
                    {AREAS.map(a => <option key={a}>{a}</option>)}
                  </select>
                </div>

                {/* Vehicle */}
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wide block mb-1">Vehicle</label>
                  <select
                    value={manualFields.vehicle ?? '(None)'}
                    onChange={e => patch('vehicle', e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]"
                  >
                    {VEHICLES.map(v => <option key={v}>{v}</option>)}
                  </select>
                </div>

                {/* Driver */}
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wide block mb-1">Driver</label>
                  <select
                    value={manualFields.driver ?? ''}
                    onChange={e => patch('driver', e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]"
                  >
                    <option value="">(Unassigned)</option>
                    {DRIVERS.map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>

                {/* Account Manager */}
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wide block mb-1">Account Manager</label>
                  <select
                    value={manualFields.account_manager ?? ''}
                    onChange={e => patch('account_manager', e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]"
                  >
                    {ACCOUNT_MANAGERS.map(a => <option key={a}>{a}</option>)}
                  </select>
                </div>

                {/* Item Type */}
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wide block mb-1">Item Type</label>
                  <select
                    value={manualFields.item_type ?? 'Small Item'}
                    onChange={e => patch('item_type', e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]"
                  >
                    {ITEM_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>

                {/* Amount — AC only */}
                {isAC && (
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wide block mb-1">Amount (₱)</label>
                    <input
                      type="number"
                      min={5000}
                      max={150000}
                      step={1000}
                      value={manualFields.amount ?? ''}
                      onChange={e => patch('amount', e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]"
                    />
                  </div>
                )}

                {/* Item Description */}
                <div className={isAC ? '' : 'sm:col-span-2'}>
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wide block mb-1">Item Description</label>
                  <input
                    type="text"
                    value={manualFields.item_description ?? ''}
                    onChange={e => patch('item_description', e.target.value)}
                    placeholder="Leave blank for auto-generated description"
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]"
                  />
                </div>

                {/* Remarks */}
                <div className="sm:col-span-2">
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wide block mb-1">Remarks</label>
                  <input
                    type="text"
                    value={manualFields.remarks ?? ''}
                    onChange={e => patch('remarks', e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1 flex-wrap">
                <button
                  onClick={handleRandomizeAgain}
                  className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 text-slate-600 hover:bg-slate-50 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Randomize Again
                </button>
                <button
                  onClick={() => handleGenerate(false)}
                  disabled={savingManual}
                  className="flex items-center gap-2 px-4 py-2 bg-[#1F3864] hover:bg-[#0078C1] text-white text-xs font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  {savingManual ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save Record
                </button>
                <button
                  onClick={() => handleGenerate(true)}
                  disabled={savingManual}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  {savingManual ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlusCircle className="w-3.5 h-3.5" />}
                  Save + New
                </button>
              </div>
            </div>
          )}

          {/* Success / Error feedback */}
          {successMsg && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-4 py-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <p className="text-xs font-bold">{successMsg}</p>
            </div>
          )}
          {errorMsg && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-2.5">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-xs font-bold">{errorMsg}</p>
            </div>
          )}
        </div>
      )}

      {!selectedModule && (
        <div className="text-center py-10 text-slate-400">
          <Shuffle className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-xs font-bold">Select a module above to get started</p>
        </div>
      )}

      {/* Reset result banner — shown outside the action panel since module is deselected after reset */}
      {resetBanner && (
        <div className={`flex items-center gap-2 rounded-lg px-4 py-2.5 ${
          resetBanner.type === 'success'
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {resetBanner.type === 'success'
            ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            : <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          }
          <p className="text-xs font-bold">{resetBanner.msg}</p>
        </div>
      )}

      {/* Reset confirmation modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            {/* Modal header */}
            <div className="bg-red-600 px-6 py-4 flex items-center gap-3">
              <Trash2 className="w-5 h-5 text-white shrink-0" />
              <h2 className="text-white font-black text-base">Reset All Data</h2>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-slate-700">
                This action will permanently delete all delivery records, their audit history, comments, and notifications. Choose a reset mode:
              </p>

              {/* Mode options */}
              <div className="space-y-2">
                <label className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${resetMode === 'full' ? 'border-red-400 bg-red-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <input
                    type="radio"
                    name="resetMode"
                    value="full"
                    checked={resetMode === 'full'}
                    onChange={() => setResetMode('full')}
                    className="mt-0.5 accent-red-600 cursor-pointer"
                  />
                  <div>
                    <p className="text-xs font-black text-slate-800">Full Reset <span className="text-red-600">(default)</span></p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Deletes all transactional records. Leaves an empty database. Users, companies, and inventory are preserved.</p>
                  </div>
                </label>

                <label className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${resetMode === 'seed' ? 'border-amber-400 bg-amber-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <input
                    type="radio"
                    name="resetMode"
                    value="seed"
                    checked={resetMode === 'seed'}
                    onChange={() => setResetMode('seed')}
                    className="mt-0.5 accent-amber-600 cursor-pointer"
                  />
                  <div>
                    <p className="text-xs font-black text-slate-800">Reset to Seed Data</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Wipes everything and re-runs the original seed. Restores all demo records, users, and companies to their initial state. <span className="font-bold text-amber-700">You will be logged out.</span></p>
                  </div>
                </label>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <p className="text-[11px] text-amber-800 font-bold">This cannot be undone.</p>
              </div>
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowResetModal(false)}
                disabled={resetting}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                disabled={resetting}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                {resetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Yes, Reset Everything
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
