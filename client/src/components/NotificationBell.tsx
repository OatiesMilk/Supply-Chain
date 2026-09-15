import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, X, Check, CheckCheck, ExternalLink, Loader2 } from 'lucide-react';
import { api, ApiNotification } from '../api';
import { DeliveryRecord } from '../types';
import { screenKeyForCategory } from '../screenRouting';

interface Props {
  onNavigate: (screen: string, item_id?: string) => void;
  deliveryRecords: DeliveryRecord[];
}

function timeAgo(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function NotificationBell({ onNavigate, deliveryRecords }: Props) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const load = useCallback(async () => {
    try {
      const data = await api.getNotifications();
      setNotifications(data);
    } catch {
      // silently fail — bell is non-blocking
    }
  }, []);

  // Initial load + poll every 60 seconds
  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleOpen = async () => {
    setOpen(v => !v);
    if (!open) {
      setLoading(true);
      await load();
      setLoading(false);
    }
  };

  const handleMarkOne = async (id: string) => {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, is_read: true } : n)
    );
    await api.markNotificationRead(id).catch(() => {});
  };

  const handleMarkAll = async () => {
    setMarkingAll(true);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    await api.markAllNotificationsRead().catch(() => {});
    setMarkingAll(false);
  };

  // Resolve screen key from notification — look up the record's category
  // to navigate to the correct module workspace, not just generic 'deliveries'
  const resolveScreen = (n: ApiNotification): string => {
    if (!n.record_id || !n.record_type) return 'dashboard';
    if (n.record_type === 'DeliveryRecord') {
      const record = deliveryRecords.find(r => r.id === n.record_id);
      if (record) return screenKeyForCategory(record.category);
      // Fallback if record not yet loaded
      return 'deliveries';
    }
    if (n.record_type === 'Sku') return 'inventory';
    return 'dashboard';
  };

  const handleClickNotification = async (n: ApiNotification) => {
    if (!n.is_read) handleMarkOne(n.id);
    if (n.record_id && n.record_type) {
      const screen = resolveScreen(n);
      onNavigate(screen, n.record_id);
    }
    setOpen(false);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={handleOpen}
        className="relative p-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 hover:text-slate-900 rounded-lg transition-colors cursor-pointer"
        title="Notifications"
        id="notification-bell-button"
      >
        <Bell className="w-3.5 h-3.5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-10 w-80 sm:w-96 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 flex flex-col"
          id="notification-panel"
          style={{ maxHeight: '480px' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#0078C1]" />
              <span className="text-sm font-black text-slate-800 uppercase tracking-wide">Notifications</span>
              {unreadCount > 0 && (
                <span className="bg-red-100 text-red-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAll}
                  disabled={markingAll}
                  className="text-[10px] text-[#0078C1] hover:underline font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  title="Mark all as read"
                >
                  {markingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3 h-3" />}
                  All read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-slate-100 rounded text-slate-400 cursor-pointer ml-1">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-5 h-5 animate-spin text-[#0078C1]" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                <Bell className="w-8 h-8 text-slate-200" />
                <p className="text-sm text-slate-400 font-semibold">No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {notifications.map(n => {
                  const hasLink = !!(n.record_id && n.record_type);
                  return (
                    <div
                      key={n.id}
                      className={`flex items-start gap-3 px-4 py-3 transition-all ${
                        hasLink ? 'cursor-pointer hover:bg-slate-50' : ''
                      } ${n.is_read ? 'opacity-60' : 'bg-blue-50/30'}`}
                      onClick={() => hasLink && handleClickNotification(n)}
                    >
                      <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${n.is_read ? 'bg-slate-300' : 'bg-[#0078C1]'}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-bold truncate ${n.is_read ? 'text-slate-600' : 'text-slate-900'}`}>
                          {n.title}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-snug line-clamp-2">
                          {n.message}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-[10px] text-slate-400 font-mono">{timeAgo(n.created_at)}</p>
                          {hasLink && (() => {
                            const record = n.record_id ? deliveryRecords.find(r => r.id === n.record_id) : null;
                            return record ? (
                              <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-semibold">
                                {record.category}
                              </span>
                            ) : null;
                          })()}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {hasLink && (
                          <ExternalLink className="w-3 h-3 text-slate-300" />
                        )}
                        {!n.is_read && (
                          <button
                            onClick={e => { e.stopPropagation(); handleMarkOne(n.id); }}
                            className="p-0.5 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600 cursor-pointer"
                            title="Mark as read"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {notifications.length > 0 && (
            <div className="border-t border-slate-100 px-4 py-2 text-[10px] text-slate-400 text-center font-semibold">
              Showing last {notifications.length} notifications
            </div>
          )}
        </div>
      )}
    </div>
  );
}
