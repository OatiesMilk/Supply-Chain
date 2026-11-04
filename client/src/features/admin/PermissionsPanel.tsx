import React, { useEffect, useRef, useState } from 'react';
import { Check, Loader2, RotateCcw, ShieldCheck, X } from 'lucide-react';
import { api, ApiError, type ApiPermissionEditor, type ApiUserAdmin } from '@/api';
import { useAuthStore } from '@/store/authStore';

const ROLE_LABELS: Record<string, string> = { SALES_COORDINATOR: 'Sales Coordinator', LOGISTICS: 'Logistics', TASS: 'TASS', ADMIN: 'Admin', DRIVER: 'Driver' };

interface PermissionsPanelProps {
  user: ApiUserAdmin;
  onClose: () => void;
}

export default function PermissionsPanel({ user, onClose }: PermissionsPanelProps) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { root.current?.focus(); }, []);
  const [policy, setPolicy] = useState<ApiPermissionEditor | null>(null);
  const roleDefaults = new Set(policy?.roleDefaults ?? []);
  const allScreens = policy?.catalog.map(s => s.screen) ?? [];
  const screenLabels = Object.fromEntries(policy?.catalog.map(s => [s.screen, s.label]) ?? []);
  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);

  const applyPolicy = (next: ApiPermissionEditor) => {
    setPolicy(next);
    setToggles(Object.fromEntries(next.catalog.map(s => [s.screen, next.effectiveScreens.includes(s.screen)])));
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPolicy(null);
    setError(null);
    api.getUserPermissions(user.id)
      .then(next => { if (!cancelled) applyPolicy(next); })
      .catch(e => { if (!cancelled) setError(e instanceof ApiError ? e.message : 'Failed to load permissions'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user.id, user.role]);

  const refreshOwnPermissions = async () => {
    if (useAuthStore.getState().authUser?.id === user.id) await useAuthStore.getState().refreshPermissions();
  };

  const handleSave = async () => {
    if (!policy || saving) return;
    setSaving(true);
    setError(null);
    setSavedOk(false);
    // Only send entries that differ from the role default
    const overrides = allScreens
      .filter(s => policy.editableScreens.includes(s))
      .filter(s => toggles[s] !== roleDefaults.has(s))
      .map(s => ({ screen: s, granted: toggles[s] }));
    try {
      applyPolicy(await api.setUserPermissions(user.id, overrides, policy.permissionVersion));
      await refreshOwnPermissions();
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to save permissions');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!policy || saving) return;
    setSaving(true);
    setError(null);
    try {
      applyPolicy(await api.setUserPermissions(user.id, [], policy.permissionVersion));
      await refreshOwnPermissions();
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to reset permissions');
    } finally {
      setSaving(false);
    }
  };

  const inRole = allScreens.filter(s => roleDefaults.has(s));
  const notInRole = allScreens.filter(s => !roleDefaults.has(s));

  const ToggleRow: React.FC<{ screen: string }> = ({ screen }) => {
    const isOn = toggles[screen] ?? roleDefaults.has(screen);
    const isDefault = isOn === roleDefaults.has(screen);
    const isAdminLocked = !policy?.editableScreens.includes(screen);
    return (
      <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-black/5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-700">{screenLabels[screen] ?? screen}</span>
          {isDefault && (
            <span className="text-[9px] font-bold text-slate-400 border border-slate-200 rounded-full px-1.5 py-0.5">Default</span>
          )}
          {isAdminLocked && (
            <span className="text-[9px] font-bold text-amber-600 border border-amber-200 rounded-full px-1.5 py-0.5">Locked</span>
          )}
        </div>
        <button
          type="button"
          disabled={isAdminLocked || saving}
          onClick={() => !isAdminLocked && setToggles(prev => ({ ...prev, [screen]: !prev[screen] }))}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${isOn ? 'bg-[#0078C1]' : 'bg-slate-300'} ${isAdminLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          aria-label={`Toggle ${screenLabels[screen]}`}
        >
          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${isOn ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </button>
      </div>
    );
  };

  return (
    <div ref={root} tabIndex={-1} aria-label={`Permissions for ${user.name}`} className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4 text-xs">
      <p className="text-xs text-slate-500">Roles &amp; Permissions / Individual account</p>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#0078C1]" />
          <h4 className="text-sm font-bold text-slate-800">
            Module Access — {user.name} <span className="text-slate-400 font-normal">({ROLE_LABELS[user.role] ?? user.role})</span>
          </h4>
        </div>
        <button aria-label="Close account permissions" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-xs text-slate-500">Changes apply to this account. Locked modules depend on the account role.</p>
      {loading ? (
        <div className="flex items-center justify-center py-8 text-slate-400 gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading permissions…
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Default for role */}
          <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-3 space-y-0.5">
            <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-2">Default for role</p>
            {inRole.map(s => <ToggleRow key={s} screen={s} />)}
          </div>
          {/* Not in role */}
          <div className="bg-slate-100/60 border border-slate-200 rounded-xl p-3 space-y-0.5">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Not in role</p>
            {notInRole.map(s => <ToggleRow key={s} screen={s} />)}
          </div>
        </div>
      )}

      {error && (
        <p className="text-red-600 text-[11px] font-semibold bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200">
        <button
          onClick={handleSave} disabled={saving || loading || !policy}
          className="px-4 py-2 bg-[#0078C1] hover:bg-[#1F3864] text-white font-bold rounded-lg text-[11px] uppercase flex items-center gap-1.5 disabled:opacity-60 cursor-pointer"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : savedOk ? <Check className="w-3 h-3" /> : <Check className="w-3 h-3" />}
          {savedOk ? 'Saved!' : 'Save Changes'}
        </button>
        <button
          onClick={handleReset} disabled={saving || loading || !policy}
          className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg text-[11px] uppercase flex items-center gap-1.5 disabled:opacity-60 cursor-pointer"
        >
          <RotateCcw className="w-3 h-3" /> Reset to Role Default
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 text-slate-500 hover:text-slate-700 font-bold text-[11px] uppercase cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
