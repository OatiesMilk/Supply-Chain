import { useState, useMemo } from 'react';
import { X, FileBarChart2, Loader2, Clock, History } from 'lucide-react';
import { DeliveryRecord } from '../types';
import { downloadDriverReport } from '../utils/exportDriverReport';
import { fetchHistoricStatusSets } from '../utils/routeSlip';

interface Props {
  records: DeliveryRecord[];
  onClose: () => void;
  generatedByName: string;
  generatedByRole: string;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function deriveDefaultMonthYear(records: DeliveryRecord[]): { month: number; year: number } {
  const now = new Date();
  const dates = records.map(r => r.delivery_date).filter(Boolean) as string[];
  if (!dates.length) return { month: now.getMonth() + 1, year: now.getFullYear() };
  const counts: Record<string, number> = {};
  for (const d of dates) {
    const key = d.slice(0, 7);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  const [key] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const [yr, mo] = key.split('-').map(Number);
  return { month: mo, year: yr };
}

export default function DriverReportModal({ records, onClose, generatedByName, generatedByRole }: Props) {
  const defaultMY = useMemo(() => deriveDefaultMonthYear(records), [records]);
  const [month, setMonth]       = useState(defaultMY.month);
  const [year, setYear]         = useState(defaultMY.year);
  const [format, setFormat]     = useState<'excel' | 'pdf' | 'docx' | 'csv'>('excel');
  const [statusMode, setStatusMode] = useState<'current' | 'trail'>('current');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const filteredRecords = useMemo(() => records.filter(r => {
    if (!r.delivery_date) return false;
    const d = new Date(r.delivery_date);
    return d.getFullYear() === year && d.getMonth() + 1 === month;
  }), [records, month, year]);

  const filteredCount = filteredRecords.length;

  async function handleGenerate() {
    setError(null);
    setLoading(true);
    try {
      let auditSets: Map<string, Set<string>> | undefined;
      if (statusMode === 'trail') {
        try {
          auditSets = await fetchHistoricStatusSets(filteredRecords);
        } catch {
          auditSets = undefined;
        }
      }
      await downloadDriverReport(records, month, year, format, generatedByName, generatedByRole, auditSets);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Export failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-[#1F3864]">
          <div className="flex items-center gap-2">
            <FileBarChart2 className="w-4 h-4 text-[#FFC000]" />
            <span className="text-white font-bold text-sm">Monthly Driver Report</span>
          </div>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4">

          {/* Month */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Month</label>
            <select
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1F3864]/30 focus:border-[#1F3864]"
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>

          {/* Year */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Year</label>
            <input
              type="number"
              min={2020}
              max={2099}
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1F3864]/30 focus:border-[#1F3864]"
            />
          </div>

          {/* Format */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">File Format</label>
            <select
              value={format}
              onChange={e => setFormat(e.target.value as 'excel' | 'pdf' | 'docx' | 'csv')}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1F3864]/30 focus:border-[#1F3864]"
            >
              <option value="excel">Excel (.xlsx)</option>
              <option value="pdf">PDF (.pdf)</option>
              <option value="docx">Word (.docx)</option>
              <option value="csv">CSV (.csv)</option>
            </select>
          </div>

          {/* Status Mode */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Status Counting</label>
            <div className="flex gap-2">
              <button
                onClick={() => setStatusMode('current')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                  statusMode === 'current'
                    ? 'bg-[#1F3864] text-white border-[#1F3864]'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                <Clock className="w-3 h-3" /> Current Status
              </button>
              <button
                onClick={() => setStatusMode('trail')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                  statusMode === 'trail'
                    ? 'bg-[#1F3864] text-white border-[#1F3864]'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                <History className="w-3 h-3" /> Status Trail
              </button>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              {statusMode === 'current'
                ? 'Counts each record once based on its current status.'
                : 'Counts every status each record has passed through. Totals may exceed record count.'}
            </p>
          </div>

          {/* Record count hint */}
          <p className="text-xs text-slate-400">
            {filteredCount > 0
              ? `${filteredCount} delivery record${filteredCount !== 1 ? 's' : ''} found for ${MONTHS[month - 1]} ${year}`
              : `No delivery records found for ${MONTHS[month - 1]} ${year}`}
          </p>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 font-medium rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={loading || filteredCount === 0}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#1F3864] hover:bg-[#162952] text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <FileBarChart2 className="w-3.5 h-3.5 text-[#FFC000]" />
            }
            {loading ? 'Generating…' : 'Generate Report'}
          </button>
        </div>

      </div>
    </div>
  );
}
