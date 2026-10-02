import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';

interface DraftState { dirty: boolean; pending: boolean }
const WorkspaceDraftContext = createContext({
  report: (_id: string, _state: DraftState | null) => {},
  requestLeave: (navigate: () => void) => { navigate(); },
  pending: false,
});

export function WorkspaceDraftProvider({ children }: { children: ReactNode }) {
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [leaveAction, setLeaveAction] = useState<(() => void) | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const discardRef = useRef<HTMLButtonElement>(null);
  const dialogId = useId();
  const report = useCallback((id: string, state: DraftState | null) => {
    setDrafts(previous => {
      const next = { ...previous };
      if (state) next[id] = state;
      else delete next[id];
      return next;
    });
  }, []);
  const pending = Object.values(drafts).some(draft => draft.pending);
  const dirty = Object.values(drafts).some(draft => draft.dirty);
  const requestLeave = useCallback((navigate: () => void) => {
    if (pending) return;
    if (dirty) setLeaveAction(() => navigate);
    else navigate();
  }, [pending, dirty]);

  useEffect(() => {
    if (!leaveAction) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => { if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [leaveAction]);

  useEffect(() => {
    if (!dirty && !pending) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty, pending]);

  const value = useMemo(() => ({ report, requestLeave, pending }), [report, requestLeave, pending]);
  return (
    <WorkspaceDraftContext.Provider value={value}>
      <div inert={!!leaveAction} className="contents">{children}</div>
      {leaveAction && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${dialogId}-title`}
            aria-describedby={`${dialogId}-description`}
            className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
            onKeyDown={event => {
              if (event.key === 'Escape') { event.preventDefault(); setLeaveAction(null); }
              if (event.key === 'Tab') {
                event.preventDefault();
                if (document.activeElement === cancelRef.current && !pending) discardRef.current?.focus();
                else cancelRef.current?.focus();
              }
            }}
          >
            <h2 id={`${dialogId}-title`} className="text-base font-bold text-slate-800">Discard unfinished changes?</h2>
            <p id={`${dialogId}-description`} className="mt-2 text-sm text-slate-600">This record has unfinished edits. Stay to keep working, or discard them and leave the record.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button ref={cancelRef} type="button" onClick={() => setLeaveAction(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0078C1]">Keep editing</button>
              <button ref={discardRef} type="button" disabled={pending} onClick={() => { const navigate = leaveAction; setLeaveAction(null); navigate(); }} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-700 disabled:opacity-50">Discard and leave</button>
            </div>
          </div>
        </div>
      )}
    </WorkspaceDraftContext.Provider>
  );
}

export function useWorkspaceDraft(id: string, dirty: boolean, pending = false) {
  const { report } = useContext(WorkspaceDraftContext);
  useEffect(() => { report(id, { dirty, pending }); }, [id, dirty, pending, report]);
  useEffect(() => () => report(id, null), [id, report]);
}

export function useWorkspaceNavigation() {
  return useContext(WorkspaceDraftContext);
}
