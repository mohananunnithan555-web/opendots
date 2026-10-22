import { useState, useEffect } from 'react';
import {
  Bell,
  CheckCheck,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  ShieldAlert,
  Sparkles,
  X,
  Filter,
} from 'lucide-react';
import { api } from './api';
import type { Notification, NotificationPriority } from '../shared/types';

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (tab: string) => void;
  onUnreadChange?: (count: number) => void;
}

export function NotificationCenter({
  isOpen,
  onClose,
  onNavigate,
  onUnreadChange,
}: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread' | 'urgent'>('all');

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const data = await api<Notification[]>('/notifications');
      setNotifications(data);
      const unread = data.filter((n) => !n.isRead).length;
      onUnreadChange?.(unread);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadNotifications();
    }
  }, [isOpen]);

  const handleMarkRead = async (id: string) => {
    try {
      await api(`/notifications/${id}/read`, 'PATCH');
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
      const nextUnread = notifications.filter((n) => n.id !== id && !n.isRead).length;
      onUnreadChange?.(nextUnread);
    } catch (err) {
      console.error('Failed to mark read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api('/notifications/mark-all-read', 'POST');
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      onUnreadChange?.(0);
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api(`/notifications/${id}`, 'DELETE');
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      const nextUnread = notifications.filter((n) => n.id !== id && !n.isRead).length;
      onUnreadChange?.(nextUnread);
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  const handleItemClick = (n: Notification) => {
    if (!n.isRead) {
      handleMarkRead(n.id);
    }
    if (n.type === 'approval_required') {
      onNavigate?.('approvals');
      onClose();
    } else if (n.type === 'deadline_approaching') {
      onNavigate?.('goals');
      onClose();
    } else if (n.type === 'task_completed' || n.type === 'task_failed' || n.type === 'monitoring_alert') {
      onNavigate?.('tasks');
      onClose();
    }
  };

  const getIcon = (type: Notification['type'], priority: NotificationPriority) => {
    switch (type) {
      case 'approval_required':
        return <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />;
      case 'task_failed':
        return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />;
      case 'task_completed':
        return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />;
      case 'monitoring_alert':
        return <Sparkles className="w-4 h-4 text-indigo-500 shrink-0" />;
      case 'deadline_approaching':
        return <Clock className="w-4 h-4 text-orange-500 shrink-0" />;
      default:
        return <Bell className="w-4 h-4 text-blue-500 shrink-0" />;
    }
  };

  if (!isOpen) return null;

  const filtered = notifications.filter((n) => {
    if (filter === 'unread') return !n.isRead;
    if (filter === 'urgent') return n.priority === 'urgent' || n.priority === 'high';
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 shadow-2xl h-full flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
              Notification Center
            </h2>
            {unreadCount > 0 && (
              <span className="text-xs bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 px-2 py-0.5 rounded-full font-semibold">
                {unreadCount} new
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters & Actions */}
        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 text-xs">
            <button
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 rounded-md font-medium transition ${
                filter === 'all'
                  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`px-2.5 py-1 rounded-md font-medium transition ${
                filter === 'unread'
                  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Unread
            </button>
            <button
              onClick={() => setFilter('urgent')}
              className={`px-2.5 py-1 rounded-md font-medium transition ${
                filter === 'urgent'
                  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Urgent
            </button>
          </div>

          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium"
            >
              <CheckCheck className="w-3.5 h-3.5" /> Mark all read
            </button>
          )}
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {loading && notifications.length === 0 ? (
            <div className="text-center py-12 text-xs text-gray-400">Loading notifications...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400 dark:text-gray-500">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">No notifications</p>
              <p className="text-xs mt-1">You're all caught up with tasks and approvals.</p>
            </div>
          ) : (
            filtered.map((n) => (
              <div
                key={n.id}
                onClick={() => handleItemClick(n)}
                className={`p-3 rounded-xl border text-left cursor-pointer transition flex items-start justify-between gap-3 ${
                  n.isRead
                    ? 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 opacity-75 hover:opacity-100'
                    : 'bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/60 shadow-sm'
                }`}
              >
                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                  {getIcon(n.type, n.priority)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate">
                        {n.title}
                      </span>
                      {n.priority === 'urgent' && (
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 rounded">
                          Urgent
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-2">
                      {n.message}
                    </p>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 block">
                      {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} •{' '}
                      {new Date(n.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {!n.isRead && (
                    <button
                      onClick={() => handleMarkRead(n.id)}
                      title="Mark as read"
                      className="p-1 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(n.id)}
                    title="Delete"
                    className="p-1 text-gray-400 hover:text-rose-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer info: Quiet Hours */}
        <div className="p-3 bg-gray-50 dark:bg-gray-900/80 border-t border-gray-200 dark:border-gray-800 text-[11px] text-gray-500 dark:text-gray-400 flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-indigo-500" /> Quiet Hours active: 22:00 – 07:00
          </span>
          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Live Mode</span>
        </div>
      </div>
    </div>
  );
}
