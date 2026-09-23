import React, { useState } from 'react';
import { Lock, X, Info, Send } from 'lucide-react';

export interface AccessRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  screenName?: string;
  currentUserRole: string;
}

export const AccessRequestModal: React.FC<AccessRequestModalProps> = ({
  isOpen,
  onClose,
  screenName = '',
  currentUserRole,
}) => {
  const [screen, setScreen] = useState(screenName);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);

  React.useEffect(() => {
    setScreen(screenName);
  }, [screenName]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    setSent(true);
    setTimeout(() => {
      onClose();
      setSent(false);
      setNote('');
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4">
        {sent ? (
          <div className="flex flex-col items-center justify-center py-6 gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
              <Send className="w-5 h-5 text-emerald-600" />
            </div>
            <p className="text-sm font-bold text-slate-800">Request Sent</p>
            <p className="text-xs text-slate-500">Your admin has been notified.</p>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                  <Lock className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-800">Request Temporary Access</h3>
                  <p className="text-[11px] text-slate-500">
                    {screen ? `For: ${screen}` : 'Submit to your system administrator'}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1 hover:bg-slate-100 rounded text-slate-400 cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-700">
                Your current role is <strong>{currentUserRole}</strong>. Access changes are subject to admin approval and may be time-limited.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Module / Screen Needed</label>
              <input
                type="text"
                value={screen}
                onChange={e => setScreen(e.target.value)}
                placeholder="e.g. RMA, Deliveries, Admin Panel…"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Reason for Request</label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Briefly explain why you need access to this module…"
                rows={3}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]"
              />
            </div>

            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!screen.trim() || !note.trim()}
                className="px-4 py-2 text-xs font-bold text-white bg-[#1F3864] hover:bg-[#0078C1] rounded-lg transition-colors cursor-pointer disabled:opacity-40"
              >
                Submit Request
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AccessRequestModal;
