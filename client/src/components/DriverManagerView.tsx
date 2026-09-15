import { useState, FormEvent } from 'react';
import { Plus, X, Truck, UserCheck, Search, ToggleLeft, ToggleRight, Trash2, Edit3, Check, MapPin } from 'lucide-react';
import { ApiDriver } from '../api';

interface DriverManagerViewProps {
  drivers: ApiDriver[];
  currentUserRole: string;
  currentUserName: string;
  onCreateDriver: (data: { name: string; type: 'DRIVER' | 'ASSISTANT'; coverage_areas?: string[] }) => Promise<void>;
  onUpdateDriver: (id: string, data: Partial<{ name: string; type: string; coverage_areas: string[]; is_active: boolean }>) => Promise<void>;
  onDeleteDriver: (id: string) => Promise<void>;
}

type Tab = 'drivers' | 'assistants';

const EMPTY_FORM = { name: '', type: 'DRIVER' as 'DRIVER' | 'ASSISTANT', coverage_areas: '' };

export default function DriverManagerView({
  drivers,
  currentUserRole,
  currentUserName,
  onCreateDriver,
  onUpdateDriver,
  onDeleteDriver,
}: DriverManagerViewProps) {
  const [tab, setTab] = useState<Tab>('drivers');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', coverage_areas: '' });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const canManage = currentUserRole === 'Logistics' || currentUserRole === 'Admin';
  const typeFilter = tab === 'drivers' ? 'DRIVER' : 'ASSISTANT';

  const filtered = drivers
    .filter(d => d.type === typeFilter)
    .filter(d => showInactive || d.is_active)
    .filter(d => !search || d.name.toLowerCase().includes(search.toLowerCase()));

  const activeCount = drivers.filter(d => d.type === typeFilter && d.is_active).length;
  const inactiveCount = drivers.filter(d => d.type === typeFilter && !d.is_active).length;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) { setFormError('Name is required'); return; }
    const existing = drivers.find(d => d.name.toLowerCase() === name.toLowerCase() && d.type === form.type);
    if (existing) { setFormError(`A ${form.type === 'DRIVER' ? 'driver' : 'assistant'} with this name already exists`); return; }
    setFormError('');
    const areas = form.coverage_areas
      .split(',')
      .map(a => a.trim())
      .filter(Boolean);
    await onCreateDriver({ name, type: form.type, coverage_areas: areas });
    setForm(EMPTY_FORM);
    setShowCreate(false);
  };

  const startEdit = (d: ApiDriver) => {
    setEditingId(d.id);
    setEditForm({ name: d.name, coverage_areas: d.coverage_areas.join(', ') });
  };

  const saveEdit = async (d: ApiDriver) => {
    const name = editForm.name.trim();
    if (!name) return;
    const areas = editForm.coverage_areas.split(',').map(a => a.trim()).filter(Boolean);
    await onUpdateDriver(d.id, { name, coverage_areas: areas });
    setEditingId(null);
  };

  const toggleActive = async (d: ApiDriver) => {
    await onUpdateDriver(d.id, { is_active: !d.is_active });
  };

  const handleDelete = async (id: string) => {
    await onDeleteDriver(id);
    setConfirmDeleteId(null);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-black text-slate-900 leading-tight">Driver Manager</h1>
          <p className="text-[11px] text-slate-400">
            Manage drivers and assistants. Changes here reflect across all modules.
          </p>
        </div>
      </div>

      {/* Tabs + Controls */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setTab('drivers')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all border-2 ${
              tab === 'drivers'
                ? 'bg-[#1F3864] text-white border-white/30 ring-2 ring-white/40 ring-offset-1 ring-offset-[#1F3864]'
                : 'bg-[#0078C1] text-white border-transparent hover:bg-[#1F3864]'
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            Drivers ({drivers.filter(d => d.type === 'DRIVER' && d.is_active).length})
          </button>
          <button
            onClick={() => setTab('assistants')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all border-2 ${
              tab === 'assistants'
                ? 'bg-[#1F3864] text-white border-white/30 ring-2 ring-white/40 ring-offset-1 ring-offset-[#1F3864]'
                : 'bg-[#0078C1] text-white border-transparent hover:bg-[#1F3864]'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            Assistants ({drivers.filter(d => d.type === 'ASSISTANT' && d.is_active).length})
          </button>
        </div>

        <div className="flex gap-2 items-center">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              className="pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1] w-48"
            />
          </div>

          {/* Show inactive toggle */}
          <button
            onClick={() => setShowInactive(!showInactive)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            title={showInactive ? 'Showing active + inactive' : 'Showing active only'}
          >
            {showInactive ? <ToggleRight className="w-4 h-4 text-[#0078C1]" /> : <ToggleLeft className="w-4 h-4" />}
            {showInactive ? 'All' : 'Active'}
            {inactiveCount > 0 && !showInactive && (
              <span className="text-[10px] text-slate-400">+{inactiveCount} inactive</span>
            )}
          </button>

          {/* Add button */}
          {canManage && (
            <button
              onClick={() => { setForm({ ...EMPTY_FORM, type: typeFilter }); setShowCreate(true); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-[#0078C1] text-white hover:bg-[#1F3864] transition-all border-2 border-transparent"
            >
              <Plus className="w-3.5 h-3.5" />
              Add {tab === 'drivers' ? 'Driver' : 'Assistant'}
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <p className="text-xs text-slate-500">
        Showing <span className="font-bold text-slate-700">{filtered.length}</span> {tab}
        {' '}({activeCount} active{inactiveCount > 0 ? `, ${inactiveCount} inactive` : ''})
      </p>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Truck className="w-10 h-10 text-slate-200" />
            <p className="text-sm text-slate-400">
              {search ? 'No matches found.' : `No ${tab} yet. Add one to get started.`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full table-auto text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left">
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Coverage Areas</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap">Added By</th>
                  {canManage && (
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(d => (
                  <tr key={d.id} className={`transition-colors ${d.is_active ? 'hover:bg-slate-50' : 'bg-slate-50/50 opacity-60'}`}>
                    <td className="px-4 py-3">
                      {editingId === d.id ? (
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                          className="px-2 py-1 border border-slate-300 rounded text-xs w-full focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30"
                          autoFocus
                        />
                      ) : (
                        <span className="font-semibold text-slate-800">{d.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingId === d.id ? (
                        <input
                          type="text"
                          value={editForm.coverage_areas}
                          onChange={e => setEditForm(f => ({ ...f, coverage_areas: e.target.value }))}
                          placeholder="e.g. Makati, BGC, Taguig"
                          className="px-2 py-1 border border-slate-300 rounded text-xs w-full focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30"
                        />
                      ) : d.coverage_areas.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {d.coverage_areas.map((a, i) => (
                            <span key={i} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] bg-blue-50 text-blue-700 border border-blue-200">
                              <MapPin className="w-2.5 h-2.5" />{a}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">No areas assigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${
                        d.is_active
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-red-50 text-red-700 border-red-200'
                      }`}>
                        {d.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{d.created_by}</td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {editingId === d.id ? (
                            <>
                              <button
                                onClick={() => saveEdit(d)}
                                className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors"
                                title="Save"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors"
                                title="Cancel"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => startEdit(d)}
                                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                                title="Edit"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => toggleActive(d)}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  d.is_active
                                    ? 'text-amber-500 hover:bg-amber-50'
                                    : 'text-emerald-500 hover:bg-emerald-50'
                                }`}
                                title={d.is_active ? 'Deactivate' : 'Activate'}
                              >
                                {d.is_active ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                              </button>
                              {confirmDeleteId === d.id ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleDelete(d.id)}
                                    className="px-2 py-1 text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 rounded hover:bg-red-100 transition-colors"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="px-2 py-1 text-[10px] font-bold text-slate-500 bg-slate-50 border border-slate-200 rounded hover:bg-slate-100 transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirmDeleteId(d.id)}
                                  className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={e => { if (e.target === e.currentTarget) setShowCreate(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto m-4">
            <div className="px-6 pt-5 pb-0 flex items-center justify-between">
              <h2 className="text-sm font-black text-slate-900">
                Add {form.type === 'DRIVER' ? 'Driver' : 'Assistant'}
              </h2>
              <button
                onClick={() => setShowCreate(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Full Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Type</label>
                <select
                  value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value as 'DRIVER' | 'ASSISTANT' }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]"
                >
                  <option value="DRIVER">Driver</option>
                  <option value="ASSISTANT">Assistant</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Coverage Areas</label>
                <input
                  type="text"
                  value={form.coverage_areas}
                  onChange={e => setForm(f => ({ ...f, coverage_areas: e.target.value }))}
                  placeholder="e.g. Makati, BGC, Taguig (comma-separated)"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Comma-separated area keywords for smart driver assignment suggestions.
                </p>
              </div>

              {formError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 font-medium rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#1F3864] hover:bg-[#162952] text-white text-sm font-bold rounded-lg transition-colors"
                >
                  Add {form.type === 'DRIVER' ? 'Driver' : 'Assistant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
