import React, { useState, useEffect, useMemo } from 'react';
import type { Reminder, ReminderStatus, ReminderRecurrence, ReminderRecurrenceType } from '../shared/types';
import {
  Bell,
  BellRing,
  Clock,
  Calendar,
  CheckCircle2,
  Trash2,
  AlertCircle,
  Volume2,
  VolumeX,
  Play,
  RotateCcw,
  Sparkles,
  HelpCircle,
  Radio,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Plus,
  RefreshCw,
  Search,
  Check,
} from 'lucide-react';
import {
  getRemindersList,
  createNaturalReminder,
  createStructuredReminder,
  snoozeReminder,
  completeReminder,
  deleteReminder,
  triggerTestPushNotification,
  playReminderChime,
  speakReminderAnnouncement,
  subscribeUserToPush,
  unsubscribeUserFromPush,
  getExistingPushSubscription,
} from './reminders-service';

export function RemindersDashboard() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'upcoming' | 'recurring' | 'monitoring' | 'completed'>('upcoming');
  const [quickInput, setQuickInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [clarificationNeeded, setClarificationNeeded] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Push notification state
  const [pushSupported, setPushSupported] = useState(true);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  // Manual creation state
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualDate, setManualDate] = useState('');
  const [manualTime, setManualTime] = useState('09:00');
  const [manualRecurrence, setManualRecurrence] = useState<ReminderRecurrenceType | 'none'>('none');
  const [manualTargetEvent, setManualTargetEvent] = useState('');

  // Troubleshooting & Render guide expandable
  const [showRenderGuide, setShowRenderGuide] = useState(false);
  const [showSoundGuide, setShowSoundGuide] = useState(false);

  // Load reminders and push state
  const loadData = async () => {
    try {
      setLoading(true);
      const data = await getRemindersList();
      setReminders(data);
    } catch (err) {
      console.error('Failed to load reminders:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Check push subscription
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushSupported(false);
    } else {
      getExistingPushSubscription().then((sub) => {
        setPushSubscribed(!!sub);
      });
    }

    // Interval to refresh list every 30s
    const timer = setInterval(() => {
      getRemindersList().then(setReminders).catch(() => {});
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const handleTogglePush = async () => {
    setPushLoading(true);
    setMessage(null);
    try {
      if (pushSubscribed) {
        await unsubscribeUserFromPush();
        setPushSubscribed(false);
        setMessage({ text: 'Web Push notifications disabled.', type: 'info' });
      } else {
        const res = await subscribeUserToPush();
        if (res.success) {
          setPushSubscribed(true);
          setMessage({
            text: 'Web Push enabled! You will receive notifications even when the tab is closed or your phone screen is locked.',
            type: 'success',
          });
        } else {
          setMessage({ text: res.error || 'Failed to enable push notifications.', type: 'error' });
        }
      }
    } catch (err: any) {
      setMessage({ text: err.message || 'Error configuring notifications.', type: 'error' });
    } finally {
      setPushLoading(false);
    }
  };

  const handleTestNotification = async () => {
    setMessage(null);
    try {
      // Play chime & speak locally for immediate feedback
      playReminderChime();
      speakReminderAnnouncement('test OpenDots smart reminders');

      const res = await triggerTestPushNotification();
      if (res.pushResult?.sent > 0) {
        setMessage({ text: `Test Web Push sent to ${res.pushResult.sent} device(s)!`, type: 'success' });
      } else {
        setMessage({
          text: 'Local chime and speech played. (Web Push requires enabling push notifications above to send to background devices).',
          type: 'info',
        });
      }
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to send test push.', type: 'error' });
    }
  };

  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickInput.trim()) return;

    setSubmitting(true);
    setClarificationNeeded(null);
    setMessage(null);

    try {
      const res = await createNaturalReminder(quickInput);
      if (res.clarificationNeeded) {
        setClarificationNeeded(res.clarificationPrompt);
      } else if (res.action === 'cancelled') {
        setMessage({ text: res.message, type: 'info' });
        setQuickInput('');
        await loadData();
      } else if (res.reminder) {
        setMessage({
          text: res.message || `Reminder created: "${res.reminder.title}"`,
          type: 'success',
        });
        setQuickInput('');
        await loadData();
      } else if (res.error) {
        setMessage({ text: res.error, type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to create reminder.', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle.trim()) return;

    setSubmitting(true);
    setMessage(null);
    try {
      let dueAt: number | null = null;
      if (manualDate && manualTime) {
        dueAt = new Date(`${manualDate}T${manualTime}:00`).getTime();
      }

      const recurrence =
        manualRecurrence !== 'none'
          ? {
              type: manualRecurrence,
              interval: 1,
              timeOfDay: manualTime,
            }
          : null;

      const res = await createStructuredReminder({
        title: manualTitle.trim(),
        dueAt,
        recurrence,
        targetEvent: manualTargetEvent.trim() || null,
        timezone: 'Asia/Kolkata',
      });

      if (res.reminder) {
        setMessage({ text: `Reminder created: "${res.reminder.title}"`, type: 'success' });
        setManualTitle('');
        setManualDate('');
        setManualTargetEvent('');
        setManualRecurrence('none');
        setShowManualForm(false);
        await loadData();
      } else {
        setMessage({ text: res.error || 'Failed to create reminder.', type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to create reminder.', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSnooze = async (id: string, minutes: number) => {
    try {
      await snoozeReminder(id, minutes);
      setMessage({ text: `Snoozed for ${minutes} minutes.`, type: 'info' });
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleComplete = async (id: string) => {
    try {
      await completeReminder(id);
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteReminder(id);
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  // Filter lists
  const filteredReminders = useMemo(() => {
    return reminders.filter((r) => {
      if (activeTab === 'upcoming') {
        return r.status === 'pending' || r.status === 'snoozed';
      }
      if (activeTab === 'recurring') {
        return !!r.recurrence;
      }
      if (activeTab === 'monitoring') {
        return r.status === 'event_monitoring' || !!r.targetEvent;
      }
      if (activeTab === 'completed') {
        return r.status === 'completed' || r.status === 'cancelled';
      }
      return true;
    });
  }, [reminders, activeTab]);

  const upcomingCount = reminders.filter((r) => r.status === 'pending' || r.status === 'snoozed').length;
  const recurringCount = reminders.filter((r) => !!r.recurrence).length;
  const monitoringCount = reminders.filter((r) => r.status === 'event_monitoring' || !!r.targetEvent).length;

  const formatIST = (timestamp: number | null) => {
    if (!timestamp) return 'Monitoring event...';
    return new Date(timestamp).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const getRelativeTime = (timestamp: number | null) => {
    if (!timestamp) return 'Durable Event Monitor';
    const diff = timestamp - Date.now();
    if (diff < 0) return 'Overdue / Triggering';
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `in ${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `in ${hours}h ${minutes % 60}m`;
    const days = Math.floor(hours / 24);
    return `in ${days}d ${hours % 24}h`;
  };

  return (
    <div className="reminders-dashboard" style={{
      maxWidth: '1080px',
      margin: '0 auto',
      padding: '24px 20px',
      color: '#F3F4F6',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
    }}>
      {/* Top Header */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px',
        marginBottom: '24px',
        borderBottom: '1px solid #252B38',
        paddingBottom: '20px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #8B5CF6, #6366F1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFF'
            }}>
              <Bell size={20} />
            </div>
            <h1 style={{ fontSize: '24px', fontWeight: '700', margin: 0, letterSpacing: '-0.02em', color: '#FFF' }}>
              Smart Reminders
            </h1>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: '14px', color: '#9CA3AF' }}>
            Persistent natural-language reminders with Web Push notifications and spoken voice alerts. Timezone: <strong style={{ color: '#C4B5FD' }}>Asia/Kolkata (IST)</strong>.
          </p>
        </div>

        {/* Global Controls & Test Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {pushSupported && (
            <button
              onClick={handleTogglePush}
              disabled={pushLoading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px',
                borderRadius: '8px',
                border: pushSubscribed ? '1px solid #10B981' : '1px solid #374151',
                background: pushSubscribed ? 'rgba(16, 185, 129, 0.12)' : '#1F2937',
                color: pushSubscribed ? '#34D399' : '#D1D5DB',
                fontSize: '13px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Radio size={15} className={pushSubscribed ? 'animate-pulse' : ''} />
              {pushSubscribed ? 'Push Active (Lockscreen Ready)' : 'Enable Web Push'}
            </button>
          )}

          <button
            onClick={handleTestNotification}
            title="Test notification sound, voice, and push alert"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #4B5563',
              background: '#1F2937',
              color: '#F9FAFB',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer',
            }}
          >
            <BellRing size={15} style={{ color: '#8B5CF6' }} />
            Test Sound & Push
          </button>

          <button
            onClick={() => {
              playReminderChime();
              speakReminderAnnouncement('study science');
            }}
            title="Test polite spoken voice announcement"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #374151',
              background: '#141925',
              color: '#9CA3AF',
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            <Volume2 size={15} />
            Test Voice
          </button>
        </div>
      </div>

      {/* Status or Clarification Message Banner */}
      {message && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: message.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : message.type === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)',
          border: `1px solid ${message.type === 'success' ? '#10B981' : message.type === 'error' ? '#EF4444' : '#3B82F6'}`,
          color: message.type === 'success' ? '#34D399' : message.type === 'error' ? '#F87171' : '#60A5FA',
          fontSize: '14px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={18} />
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>×</button>
        </div>
      )}

      {clarificationNeeded && (
        <div style={{
          padding: '14px 18px',
          borderRadius: '8px',
          marginBottom: '20px',
          background: 'rgba(139, 92, 246, 0.12)',
          border: '1px solid #8B5CF6',
          color: '#DDD6FE'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', marginBottom: '6px' }}>
            <HelpCircle size={18} style={{ color: '#A78BFA' }} />
            Clarification Needed:
          </div>
          <p style={{ margin: 0, fontSize: '14px' }}>{clarificationNeeded}</p>
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <button
              onClick={() => {
                setQuickInput((prev) => `${prev} tomorrow at 7 AM`);
                setClarificationNeeded(null);
              }}
              style={{
                fontSize: '12px',
                padding: '4px 10px',
                borderRadius: '6px',
                background: '#8B5CF6',
                color: '#FFF',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Add "tomorrow at 7 AM"
            </button>
            <button
              onClick={() => {
                setQuickInput((prev) => `${prev} in 30 minutes`);
                setClarificationNeeded(null);
              }}
              style={{
                fontSize: '12px',
                padding: '4px 10px',
                borderRadius: '6px',
                background: '#8B5CF6',
                color: '#FFF',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Add "in 30 minutes"
            </button>
          </div>
        </div>
      )}

      {/* Quick Natural-Language Creation Bar */}
      <div style={{
        background: '#141925',
        borderRadius: '12px',
        padding: '16px 20px',
        border: '1px solid #252B38',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
        marginBottom: '24px'
      }}>
        <form onSubmit={handleQuickSubmit}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type="text"
                value={quickInput}
                onChange={(e) => setQuickInput(e.target.value)}
                placeholder='Type naturally: "Remind me tomorrow at 7 AM to study", "in 30 mins", "every day at 6 AM", or "when iPhone 18 releases"...'
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  background: '#0B0D13',
                  border: '1px solid #252B38',
                  color: '#FFF',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <button
              type="submit"
              disabled={submitting || !quickInput.trim()}
              style={{
                padding: '12px 20px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #8B5CF6, #6366F1)',
                border: 'none',
                color: '#FFF',
                fontWeight: '600',
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                opacity: submitting || !quickInput.trim() ? 0.6 : 1
              }}
            >
              <Sparkles size={16} />
              {submitting ? 'Scheduling...' : 'Set Reminder'}
            </button>
            <button
              type="button"
              onClick={() => setShowManualForm(!showManualForm)}
              style={{
                padding: '12px 14px',
                borderRadius: '8px',
                background: '#1F2937',
                border: '1px solid #374151',
                color: '#D1D5DB',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              {showManualForm ? <ChevronUp size={16} /> : <Plus size={16} />}
            </button>
          </div>
        </form>

        {/* Quick Example Chips */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: '#6B7280' }}>Try asking:</span>
          {[
            'Remind me tomorrow at 7 AM to study',
            'Remind me in 30 minutes to drink water',
            'Remind me every day at 6 AM for workout',
            'Remind me when iPhone 18 base model releases',
            'Cancel my science reminder',
          ].map((example) => (
            <button
              key={example}
              onClick={() => setQuickInput(example)}
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid #252B38',
                borderRadius: '20px',
                padding: '4px 10px',
                fontSize: '11px',
                color: '#9CA3AF',
                cursor: 'pointer'
              }}
            >
              {example}
            </button>
          ))}
        </div>

        {/* Structured Manual Form Drawer */}
        {showManualForm && (
          <form onSubmit={handleManualSubmit} style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #252B38' }}>
            <h4 style={{ margin: '0 0 12px', fontSize: '14px', color: '#C4B5FD' }}>Structured Reminder Form</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#9CA3AF', marginBottom: '4px' }}>Task / Subject</label>
                <input
                  type="text"
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder="e.g. Study science chapters 1-3"
                  required
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#0B0D13', border: '1px solid #252B38', color: '#FFF', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#9CA3AF', marginBottom: '4px' }}>Date (IST)</label>
                <input
                  type="date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#0B0D13', border: '1px solid #252B38', color: '#FFF', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#9CA3AF', marginBottom: '4px' }}>Time (IST)</label>
                <input
                  type="time"
                  value={manualTime}
                  onChange={(e) => setManualTime(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#0B0D13', border: '1px solid #252B38', color: '#FFF', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#9CA3AF', marginBottom: '4px' }}>Recurrence</label>
                <select
                  value={manualRecurrence}
                  onChange={(e) => setManualRecurrence(e.target.value as any)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#0B0D13', border: '1px solid #252B38', color: '#FFF', fontSize: '13px', boxSizing: 'border-box' }}
                >
                  <option value="none">One-time only</option>
                  <option value="daily">Every day</option>
                  <option value="weekdays">Every weekday (Mon-Fri)</option>
                  <option value="weekly">Every week</option>
                  <option value="monthly">Every month</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#9CA3AF', marginBottom: '4px' }}>Target Future Event (Optional)</label>
                <input
                  type="text"
                  value={manualTargetEvent}
                  onChange={(e) => setManualTargetEvent(e.target.value)}
                  placeholder="e.g. iPhone 18 base model launch"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#0B0D13', border: '1px solid #252B38', color: '#FFF', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowManualForm(false)}
                style={{ padding: '8px 16px', borderRadius: '6px', background: 'transparent', border: '1px solid #374151', color: '#9CA3AF', cursor: 'pointer', fontSize: '13px' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                style={{ padding: '8px 18px', borderRadius: '6px', background: '#8B5CF6', border: 'none', color: '#FFF', fontWeight: '500', cursor: 'pointer', fontSize: '13px' }}
              >
                Save Reminder
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Navigation Tabs */}
      <div style={{
        display: 'flex',
        gap: '4px',
        borderBottom: '1px solid #252B38',
        marginBottom: '20px'
      }}>
        {[
          { key: 'upcoming', label: 'Upcoming', count: upcomingCount },
          { key: 'recurring', label: 'Recurring Schedules', count: recurringCount },
          { key: 'monitoring', label: 'Event Monitoring', count: monitoringCount },
          { key: 'completed', label: 'History & Completed' },
          { key: 'all', label: 'All' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            style={{
              padding: '10px 18px',
              border: 'none',
              background: 'none',
              color: activeTab === tab.key ? '#C4B5FD' : '#9CA3AF',
              borderBottom: activeTab === tab.key ? '2px solid #8B5CF6' : '2px solid transparent',
              fontWeight: activeTab === tab.key ? '600' : '400',
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span style={{
                background: activeTab === tab.key ? 'rgba(139, 92, 246, 0.25)' : '#1F2937',
                color: activeTab === tab.key ? '#C4B5FD' : '#9CA3AF',
                borderRadius: '10px',
                padding: '2px 8px',
                fontSize: '11px',
                fontWeight: '600'
              }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Reminder Cards List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#9CA3AF' }}>
          <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} />
          Loading your reminders...
        </div>
      ) : filteredReminders.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          background: '#141925',
          borderRadius: '12px',
          border: '1px dashed #252B38'
        }}>
          <Clock size={36} style={{ color: '#4B5563', margin: '0 auto 12px' }} />
          <h3 style={{ margin: '0 0 6px', fontSize: '16px', color: '#E5E7EB' }}>No reminders in this view</h3>
          <p style={{ margin: 0, fontSize: '13px', color: '#9CA3AF' }}>
            Use the bar above or chat with Dot: "Remind me tomorrow at 7 AM to study".
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredReminders.map((reminder) => {
            const isCompleted = reminder.status === 'completed';
            const isCancelled = reminder.status === 'cancelled';
            const isMonitoring = reminder.status === 'event_monitoring';

            return (
              <div
                key={reminder.id}
                style={{
                  background: '#141925',
                  borderRadius: '10px',
                  border: '1px solid #252B38',
                  padding: '16px 20px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                  opacity: isCompleted || isCancelled ? 0.6 : 1,
                  transition: 'all 0.15s ease'
                }}
              >
                {/* Left side: details */}
                <div style={{ flex: '1 1 300px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                    <span style={{
                      fontWeight: '600',
                      fontSize: '15px',
                      color: isCompleted ? '#9CA3AF' : '#FFF',
                      textDecoration: isCompleted ? 'line-through' : 'none'
                    }}>
                      {reminder.title}
                    </span>

                    {/* Badge */}
                    {reminder.recurrence && (
                      <span style={{
                        background: 'rgba(99, 102, 241, 0.15)',
                        border: '1px solid #6366F1',
                        color: '#A5B4FC',
                        borderRadius: '6px',
                        padding: '2px 8px',
                        fontSize: '11px',
                        fontWeight: '500'
                      }}>
                        Repeat: {typeof reminder.recurrence === 'string' ? reminder.recurrence : reminder.recurrence.type}
                      </span>
                    )}

                    {isMonitoring && (
                      <span style={{
                        background: 'rgba(234, 179, 8, 0.15)',
                        border: '1px solid #EAB308',
                        color: '#FDE047',
                        borderRadius: '6px',
                        padding: '2px 8px',
                        fontSize: '11px',
                        fontWeight: '500'
                      }}>
                        Monitoring Event
                      </span>
                    )}

                    {reminder.status === 'snoozed' && (
                      <span style={{
                        background: 'rgba(249, 115, 22, 0.15)',
                        border: '1px solid #F97316',
                        color: '#FDBA74',
                        borderRadius: '6px',
                        padding: '2px 8px',
                        fontSize: '11px',
                        fontWeight: '500'
                      }}>
                        Snoozed
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '13px', color: '#9CA3AF' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Calendar size={14} style={{ color: '#8B5CF6' }} />
                      <span>{formatIST(reminder.dueAt ?? reminder.scheduledAt)}</span>
                    </div>

                    {!isCompleted && !isCancelled && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#C4B5FD', fontWeight: '500' }}>
                        <Clock size={14} />
                        <span>{getRelativeTime(reminder.dueAt ?? reminder.scheduledAt)}</span>
                      </div>
                    )}

                    {(reminder.targetEvent || reminder.eventQuery) && (
                      <div style={{ color: '#FCD34D' }}>
                        Target: {reminder.targetEvent || reminder.eventQuery}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right side: Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {!isCompleted && !isCancelled && (
                    <>
                      {/* Snooze dropdown/buttons */}
                      <button
                        onClick={() => handleSnooze(reminder.id, 10)}
                        title="Snooze 10 minutes"
                        style={{
                          background: '#1F2937',
                          border: '1px solid #374151',
                          color: '#D1D5DB',
                          borderRadius: '6px',
                          padding: '6px 10px',
                          fontSize: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <RotateCcw size={13} />
                        +10m
                      </button>

                      <button
                        onClick={() => handleSnooze(reminder.id, 60)}
                        title="Snooze 1 hour"
                        style={{
                          background: '#1F2937',
                          border: '1px solid #374151',
                          color: '#D1D5DB',
                          borderRadius: '6px',
                          padding: '6px 10px',
                          fontSize: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <RotateCcw size={13} />
                        +1h
                      </button>

                      {/* Complete button */}
                      <button
                        onClick={() => handleComplete(reminder.id)}
                        title="Mark as completed"
                        style={{
                          background: 'rgba(16, 185, 129, 0.15)',
                          border: '1px solid #10B981',
                          color: '#34D399',
                          borderRadius: '6px',
                          padding: '6px 12px',
                          fontSize: '12px',
                          fontWeight: '500',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}
                      >
                        <Check size={14} />
                        Done
                      </button>
                    </>
                  )}

                  {/* Delete button */}
                  <button
                    onClick={() => handleDelete(reminder.id)}
                    title="Delete reminder"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#6B7280',
                      borderRadius: '6px',
                      padding: '6px 8px',
                      cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Expandable Guides & Technical Transparency */}
      <div style={{ marginTop: '40px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Render Free Tier 24/7 Reliability Guide */}
        <div style={{
          background: '#0E1118',
          border: '1px solid #252B38',
          borderRadius: '10px',
          overflow: 'hidden'
        }}>
          <button
            onClick={() => setShowRenderGuide(!showRenderGuide)}
            style={{
              width: '100%',
              padding: '14px 20px',
              background: 'none',
              border: 'none',
              color: '#D1D5DB',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={16} style={{ color: '#8B5CF6' }} />
              <span>Render Free-Tier 24/7 Keepalive & Tick Setup (100% Free ₹0)</span>
            </div>
            {showRenderGuide ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showRenderGuide && (
            <div style={{ padding: '0 20px 20px', fontSize: '13px', color: '#9CA3AF', lineHeight: '1.6' }}>
              <p>
                Render's free tier spins down web instances after 15 minutes of inactivity. When OpenDots wakes up, it immediately evaluates overdue reminders in SQLite and fires them.
              </p>
              <p>
                For <strong>exact-minute delivery 24 hours a day</strong> at ₹0 cost, you can set up a free HTTP ping to wake the service:
              </p>
              <ol style={{ paddingLeft: '20px', margin: '8px 0' }}>
                <li>Create a free account on <strong>cron-job.org</strong> or <strong>UptimeRobot.com</strong>.</li>
                <li>Add a monitor target to: <code style={{ background: '#1F2937', padding: '2px 6px', borderRadius: '4px', color: '#F3F4F6' }}>https://opendots-1j9k.onrender.com/api/reminders/tick</code></li>
                <li>Set the ping frequency to every <strong>5 or 10 minutes</strong>.</li>
              </ol>
              <p style={{ margin: '8px 0 0' }}>
                This keeps Render warm, continuously checks pending reminders, and dispatches Web Push notifications to your phone/PC even when you haven't opened OpenDots in days!
              </p>
            </div>
          )}
        </div>

        {/* Audio & Spoken Notification Capabilities Explanation */}
        <div style={{
          background: '#0E1118',
          border: '1px solid #252B38',
          borderRadius: '10px',
          overflow: 'hidden'
        }}>
          <button
            onClick={() => setShowSoundGuide(!showSoundGuide)}
            style={{
              width: '100%',
              padding: '14px 20px',
              background: 'none',
              border: 'none',
              color: '#D1D5DB',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Volume2 size={16} style={{ color: '#10B981' }} />
              <span>How Sound & Spoken Announcements Work Across Browsers</span>
            </div>
            {showSoundGuide ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showSoundGuide && (
            <div style={{ padding: '0 20px 20px', fontSize: '13px', color: '#9CA3AF', lineHeight: '1.6' }}>
              <p>
                OpenDots utilizes standard modern web APIs to deliver the best possible experience across all device states:
              </p>
              <ul style={{ paddingLeft: '20px', margin: '8px 0' }}>
                <li>
                  <strong>When OpenDots is open in an active tab:</strong> Plays the ascending chime and speaks aloud: <em>"Reminder, sir. Your task is to [content]."</em>
                </li>
                <li>
                  <strong>When phone screen is locked or tab is closed:</strong> Modern mobile operating systems (Android/iOS) intentionally prevent background web pages from playing arbitrary speech audio to protect user privacy and battery. However, OpenDots's <strong>Web Push Service Worker</strong> delivers the system notification banner with sound and vibration right on your lockscreen!
                </li>
                <li>
                  <strong>Sound Troubleshooting:</strong> On Android Chrome, tap the padlock / tune icon in the address bar &rarr; Permissions &rarr; Notifications &rarr; ensure "Default" or "Sound" is selected (not "Silent").
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
