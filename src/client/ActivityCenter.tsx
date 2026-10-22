import { useEffect, useState } from 'react';
import {
  Activity,
  Sparkles,
  Cloud,
  BookOpen,
  RefreshCw,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  ShieldAlert,
  Play,
  Pause,
  Eye,
  Check,
  X,
  Radio,
} from 'lucide-react';
import { api } from './api';

export interface ActivityItem {
  id: string;
  type: 'task' | 'plan' | 'memory' | 'approval' | 'monitor';
  title: string;
  description: string;
  status?: string;
  timestamp: number;
  data?: any;
}

export function ActivityCenter() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'plan' | 'approval' | 'monitor' | 'task' | 'memory'>('all');
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadActivity = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<ActivityItem[]>('/api/activity');
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load activity stream.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadActivity();
    const interval = setInterval(() => void loadActivity(), 8000);
    return () => clearInterval(interval);
  }, []);

  const handlePlanAction = async (planId: string, action: 'run' | 'pause' | 'resume' | 'cancel') => {
    setActionMessage(null);
    try {
      if (action === 'run') {
        await api(`/api/plans/${planId}/run`, 'POST');
        setActionMessage(`Autonomous plan ${planId} execution started in background.`);
      } else if (action === 'pause') {
        await api(`/api/plans/${planId}/pause`, 'POST');
        setActionMessage(`Plan paused.`);
      } else if (action === 'resume') {
        await api(`/api/plans/${planId}/resume`, 'POST');
        setActionMessage(`Plan resumed.`);
      } else if (action === 'cancel') {
        await api(`/api/plans/${planId}/cancel`, 'POST');
        setActionMessage(`Plan cancelled.`);
      }
      await loadActivity();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to execute ${action} on plan.`);
    }
  };

  const handleApproval = async (approvalId: string, decision: 'approved' | 'rejected') => {
    setActionMessage(null);
    try {
      await api(`/api/approvals/${approvalId}/decide`, 'POST', { decision, decidedBy: 'user' });
      setActionMessage(`Action ${decision === 'approved' ? 'approved' : 'rejected'} successfully.`);
      await loadActivity();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to decide approval.`);
    }
  };

  const handleMonitorCheck = async (monitorId: string) => {
    setActionMessage(null);
    try {
      setActionMessage('Running proactive standing research check in background...');
      await api(`/api/proactive-monitors/${monitorId}/check`, 'POST');
      setActionMessage('Proactive standing research check completed and results saved to memory.');
      await loadActivity();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run monitor check.');
    }
  };

  const filtered = items.filter((item) => filter === 'all' || item.type === filter);

  const getIcon = (type: string) => {
    switch (type) {
      case 'plan':
        return <Sparkles size={16} color="#3b82f6" />;
      case 'approval':
        return <ShieldAlert size={16} color="#f59e0b" />;
      case 'monitor':
        return <Radio size={16} color="#8b5cf6" />;
      case 'task':
        return <Cloud size={16} color="#6366f1" />;
      case 'memory':
        return <BookOpen size={16} color="#10b981" />;
      default:
        return <Activity size={16} color="#888" />;
    }
  };

  const getStatusBadge = (status?: string) => {
    if (!status) return null;
    switch (status) {
      case 'completed':
        return (
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: '#d1fae5', color: '#065f46', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <CheckCircle size={11} /> Completed
          </span>
        );
      case 'running':
        return (
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: '#e0f2fe', color: '#0369a1', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <RefreshCw size={11} className="spin" /> Running
          </span>
        );
      case 'waiting_approval':
        return (
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: '#fef3c7', color: '#92400e', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <ShieldAlert size={11} /> Awaiting Approval
          </span>
        );
      case 'failed':
        return (
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: '#fee2e2', color: '#991b1b', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <AlertCircle size={11} /> Failed
          </span>
        );
      case 'cancelled':
        return (
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: '#f3f4f6', color: '#374151', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <XCircle size={11} /> Cancelled
          </span>
        );
      case 'paused':
        return (
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: '#e5e7eb', color: '#4b5563', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Pause size={11} /> Paused
          </span>
        );
      default:
        return (
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: '#fef3c7', color: '#92400e', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Clock size={11} /> {status}
          </span>
        );
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '24px 0' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color, #e5e7eb)', paddingBottom: 12 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={22} color="var(--color-primary, #3b82f6)" /> Activity, Action Review & Plans Center
          </h2>
          <p style={{ color: 'var(--text-secondary, #666)', fontSize: 13, marginTop: 4 }}>
            Consolidated timeline of autonomous plans, action reviews, proactive research monitors, and memory milestones.
          </p>
        </div>

        <button className="button" onClick={loadActivity} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {actionMessage && (
        <div style={{ padding: '8px 12px', background: '#ecfdf5', color: '#065f46', borderRadius: 6, fontSize: 13, border: '1px solid #a7f3d0' }}>
          {actionMessage}
        </div>
      )}

      {error && (
        <div className="error-banner" style={{ margin: 0 }}>
          <span>{error}</span>
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(['all', 'plan', 'approval', 'monitor', 'task', 'memory'] as const).map((cat) => (
          <button
            key={cat}
            className={`button ${filter === cat ? 'primary' : ''}`}
            onClick={() => setFilter(cat)}
            style={{ textTransform: 'capitalize', fontSize: 13 }}
          >
            {cat === 'all'
              ? 'All Activity'
              : cat === 'plan'
              ? 'Autonomous Plans'
              : cat === 'approval'
              ? 'Action Reviews'
              : cat === 'monitor'
              ? 'Proactive Monitors'
              : cat === 'task'
              ? 'Cloud Tasks'
              : 'Memories'}
          </button>
        ))}
      </div>

      {/* Timeline Stream */}
      {filtered.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', border: '1px dashed var(--border-color, #e5e7eb)', borderRadius: 8, color: '#888' }}>
          <Activity size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
          <p style={{ margin: '0 0 8px 0', fontSize: 15, fontWeight: 500 }}>No activities recorded under this category</p>
          <p style={{ margin: 0, fontSize: 13 }}>Activities from autonomous plans, action reviews, monitors, and cloud tasks stream here automatically.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: '14px 18px',
                borderRadius: 8,
                border: '1px solid var(--border-color, #e5e7eb)',
                background: 'var(--color-bg, #fff)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ padding: 6, borderRadius: 8, background: 'var(--color-surface, rgba(0,0,0,0.03))', marginTop: 2 }}>
                  {getIcon(item.type)}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <strong style={{ fontSize: 14 }}>{item.title}</strong>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {getStatusBadge(item.status)}
                      <span style={{ fontSize: 11, color: '#888' }}>
                        {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                  </div>

                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary, #555)', whiteSpace: 'pre-wrap' }}>
                    {item.description}
                  </p>
                </div>
              </div>

              {/* Action Controls for Plan */}
              {item.type === 'plan' && item.data && (
                <div style={{ marginTop: 6, paddingTop: 8, borderTop: '1px solid var(--border-color, #f3f4f6)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#666' }}>
                    Step {item.data.currentStepIndex + 1} of {item.data.steps?.length || 0}
                    {item.data.finalResult ? ` • Completed` : ''}
                  </span>

                  <div style={{ display: 'flex', gap: 6 }}>
                    {item.data.status !== 'completed' && item.data.status !== 'cancelled' && item.data.status !== 'running' && (
                      <button
                        className="button"
                        style={{ fontSize: 12, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        onClick={() => handlePlanAction(item.data.id, 'run')}
                      >
                        <Play size={12} color="#10b981" /> Run Autonomously
                      </button>
                    )}

                    {item.data.status === 'running' && (
                      <button
                        className="button"
                        style={{ fontSize: 12, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        onClick={() => handlePlanAction(item.data.id, 'pause')}
                      >
                        <Pause size={12} color="#f59e0b" /> Pause
                      </button>
                    )}

                    {item.data.status === 'paused' && (
                      <button
                        className="button"
                        style={{ fontSize: 12, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        onClick={() => handlePlanAction(item.data.id, 'resume')}
                      >
                        <Play size={12} color="#3b82f6" /> Resume
                      </button>
                    )}

                    {item.data.status !== 'completed' && item.data.status !== 'cancelled' && (
                      <button
                        className="button"
                        style={{ fontSize: 12, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4, color: '#dc2626' }}
                        onClick={() => handlePlanAction(item.data.id, 'cancel')}
                      >
                        <XCircle size={12} /> Cancel
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Action Controls for Approval */}
              {item.type === 'approval' && item.data && (
                <div style={{ marginTop: 6, paddingTop: 8, borderTop: '1px solid var(--border-color, #f3f4f6)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#b45309', fontWeight: 500 }}>
                    Action confirmation required by policy
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="button"
                      style={{ fontSize: 12, padding: '4px 12px', background: '#10b981', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      onClick={() => handleApproval(item.data.id, 'approved')}
                    >
                      <Check size={12} /> Approve Action
                    </button>
                    <button
                      className="button"
                      style={{ fontSize: 12, padding: '4px 12px', background: '#ef4444', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      onClick={() => handleApproval(item.data.id, 'rejected')}
                    >
                      <X size={12} /> Reject
                    </button>
                  </div>
                </div>
              )}

              {/* Action Controls for Proactive Monitor */}
              {item.type === 'monitor' && item.data && (
                <div style={{ marginTop: 6, paddingTop: 8, borderTop: '1px solid var(--border-color, #f3f4f6)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#666' }}>
                    Standing responsibility check interval: {item.data.intervalMinutes}m
                  </span>
                  <button
                    className="button"
                    style={{ fontSize: 12, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    onClick={() => handleMonitorCheck(item.data.id)}
                  >
                    <RefreshCw size={12} /> Check Now
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
