import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  autoUpdate,
  flip,
  offset,
  shift,
  FloatingFocusManager,
  FloatingPortal,
  useDismiss,
  useFloating,
  useInteractions,
} from '@floating-ui/react';
import {
  Bell,
  X,
  Check,
  CheckCheck,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { api, ApiNotification } from "../api";
import { DeliveryRecord } from "../types";
import { notificationScreen } from "../utils/notificationNavigation";
import { operationalSyncOptions } from '../api/queries/operationalSync';
import { navbarIconButtonClass } from '../utils/uiClasses';

interface Props {
  onNavigate: (screen: string, item_id?: string) => void;
  deliveryRecords: DeliveryRecord[];
}

function timeAgo(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function NotificationBell({
  onNavigate,
  deliveryRecords,
}: Props) {
  const [open, setOpen] = useState(false);
  const client = useQueryClient();
  const notificationKey = ['notifications'] as const;
  const query = useQuery({ ...operationalSyncOptions, queryKey: notificationKey, queryFn: api.getNotifications });
  const notifications = query.data ?? [];
  const loading = query.isPending;
  const [saveError, setSaveError] = useState('');
  const [markingAll, setMarkingAll] = useState(false);
  const [hasMoreBelow, setHasMoreBelow] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const updateScrollCue = useCallback(() => {
    const el = listRef.current;
    if (!el) { setHasMoreBelow(false); return; }
    if (el.scrollHeight > el.clientHeight + 2) {
      setHasMoreBelow(el.scrollTop + el.clientHeight < el.scrollHeight - 2);
    } else {
      setHasMoreBelow(false);
    }
  }, []);

  useEffect(() => {
    if (!open) { setHasMoreBelow(false); return; }
    const frame = requestAnimationFrame(updateScrollCue);
    return () => cancelAnimationFrame(frame);
  }, [open, notifications.length, loading, updateScrollCue]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'bottom-end',
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip({ padding: 12 }), shift({ padding: 12 })],
  });

  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([dismiss]);

  const handleToggle = () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) void query.refetch();
  };

  const handleMarkOne = async (id: string) => {
    await client.cancelQueries({ queryKey: notificationKey });
    const previous = client.getQueryData<ApiNotification[]>(notificationKey);
    setSaveError('');
    client.setQueryData<ApiNotification[]>(notificationKey, data => data?.map(n => n.id === id ? { ...n, is_read: true } : n));
    try { await api.markNotificationRead(id); }
    catch {
      client.setQueryData(notificationKey, previous);
      setSaveError('Could not mark the notification as read. Try again.');
    }
    finally { await client.invalidateQueries({ queryKey: notificationKey }); }
  };

  const handleMarkAll = async () => {
    setMarkingAll(true);
    await client.cancelQueries({ queryKey: notificationKey });
    const previous = client.getQueryData<ApiNotification[]>(notificationKey);
    setSaveError('');
    client.setQueryData<ApiNotification[]>(notificationKey, data => data?.map(n => ({ ...n, is_read: true })));
    try { await api.markAllNotificationsRead(); }
    catch {
      client.setQueryData(notificationKey, previous);
      setSaveError('Could not mark notifications as read. Try again.');
    }
    finally {
      setMarkingAll(false);
      await client.invalidateQueries({ queryKey: notificationKey });
    }
  };

  const handleClickNotification = async (n: ApiNotification) => {
    if (!n.is_read) void handleMarkOne(n.id);
    if (n.record_id && n.record_type) {
      const screen = await notificationScreen(n, deliveryRecords, api.getRecord);
      onNavigate(screen, n.record_id);
    }
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        ref={refs.setReference}
        {...getReferenceProps({ onClick: handleToggle })}
        type="button"
        className={`relative ${navbarIconButtonClass}`}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? 'notification-panel' : undefined}
        title="Notifications"
        id="notification-bell-button"
      >
        <Bell className="w-4 h-4" aria-hidden="true" />
        {unreadCount > 0 && (
          <span aria-hidden="true" className="absolute -top-1 -right-1 min-w-4 h-4 px-1 bg-red-600 text-white text-xs font-semibold tabular-nums rounded-full flex items-center justify-center leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false} returnFocus>
            <div
              ref={refs.setFloating}
              style={{ ...floatingStyles, maxHeight: "480px" }}
              {...getFloatingProps()}
              role="dialog"
              aria-labelledby={titleId}
              className="w-80 sm:w-96 max-w-[calc(100vw-1.5rem)] bg-white border border-slate-200 rounded-xl shadow-2xl z-50 flex flex-col"
              id="notification-panel"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-brand-blue" aria-hidden="true" />
                  <h2 id={titleId} className="text-sm font-bold text-slate-800">
                    Notifications
                  </h2>
                  {unreadCount > 0 && (
                    <span className="bg-red-100 text-red-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAll}
                      disabled={markingAll}
                      className="text-xs text-brand-blue hover:underline font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50 rounded px-1.5 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
                      title="Mark all as read"
                    >
                      {markingAll ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                      All read
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close notifications"
                    className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 cursor-pointer ml-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {/* List */}
              {(query.isError || saveError) && <p role="alert" className="px-4 py-3 text-xs text-red-700">
                {saveError || 'Notifications could not sync. Saved notifications remain visible.'}
                <button type="button" onClick={() => { setSaveError(''); void query.refetch(); }} className="ml-2 font-bold underline cursor-pointer">Retry notifications</button>
              </p>}
              <div className="relative flex-1 min-h-0 flex flex-col">
                <div
                  ref={listRef}
                  onScroll={updateScrollCue}
                  className="notification-scroll overflow-y-auto flex-1 min-h-0"
                >
                  {loading ? (
                    <div className="flex justify-center py-10">
                      <Loader2 className="w-5 h-5 animate-spin text-brand-blue" />
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                      <Bell className="w-8 h-8 text-slate-300" aria-hidden="true" />
                      <p className="text-sm text-slate-500 font-semibold">
                        No notifications yet
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {notifications.map((n) => {
                        const hasLink = !!(n.record_id && n.record_type);
                        const record = hasLink && n.record_id
                          ? deliveryRecords.find((r) => r.id === n.record_id)
                          : null;
                        const body = (
                          <>
                            <div
                              className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.is_read ? "bg-slate-300" : "bg-brand-blue"}`}
                              aria-hidden="true"
                            />
                            <div className="flex-1 min-w-0">
                              <p
                                className={`text-xs font-semibold truncate ${n.is_read ? "text-slate-600" : "text-slate-900"}`}
                              >
                                {n.title}
                              </p>
                              <p className="text-xs text-slate-600 mt-0.5 leading-snug line-clamp-2">
                                {n.message}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <p className="text-xs text-slate-500 tabular-nums">
                                  {timeAgo(n.created_at)}
                                </p>
                                {record && (
                                  <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                                    {record.category}
                                  </span>
                                )}
                              </div>
                            </div>
                            {hasLink && (
                              <ExternalLink className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" aria-hidden="true" />
                            )}
                          </>
                        );

                        return (
                          <div
                            key={n.id}
                            className={`flex items-start gap-2 px-4 py-3 transition-colors ${
                              n.is_read ? "opacity-70" : "bg-blue-50/30"
                            } ${hasLink ? "hover:bg-slate-50" : ""}`}
                          >
                            {hasLink ? (
                              <button
                                type="button"
                                onClick={() => void handleClickNotification(n)}
                                className="flex flex-1 min-w-0 items-start gap-3 text-left cursor-pointer rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
                              >
                                {body}
                              </button>
                            ) : (
                              <div className="flex flex-1 min-w-0 items-start gap-3">
                                {body}
                              </div>
                            )}
                            {!n.is_read && (
                              <button
                                type="button"
                                onClick={() => void handleMarkOne(n.id)}
                                className="p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-800 cursor-pointer shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
                                aria-label={`Mark "${n.title}" as read`}
                                title="Mark as read"
                              >
                                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                {hasMoreBelow && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white via-white/80 to-transparent"
                  />
                )}
              </div>

              {notifications.length > 0 && (
                <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500 text-center font-medium">
                  {notifications.length === 1
                    ? 'Showing 1 notification'
                    : `Showing last ${notifications.length} notifications`}
                  {hasMoreBelow && <span className="text-brand-blue"> · Scroll for more</span>}
                </div>
              )}
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </div>
  );
}
