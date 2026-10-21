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
} from 'lucide-react';
import { api } from './api';

export interface ActivityItem {
  id: string;
  type: 'task' | 'plan' | 'memory';
  title: string;
  description: string;
  status?: string;
  timestamp: number;
}

export function ActivityCenter() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'plan' | 'task' | 'memory'>('all');
  const [error, setError] = useState<string | null>(null);

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

  const filtered = items.filter((item) => filter === 'all' || item.type === filter);

  const getIcon = (type: string) => {
    switch (type) {
      case 'plan':
        return <Sparkles size={16} color="#3b82f6" />;
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
            <Activity size={22} color="var(--color-primary, #3b82f6)" /> Activity & Audit Center
          </h2>
          <p style={{ color: 'var(--text-secondary, #666)', fontSize: 13, marginTop: 4 }}>
            Consolidated timeline of tool calls, autonomous plan milestones, cloud executions, and memory updates.
          </p>
        </div>

        <button className="button" onClick={loadActivity} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {error && (
        <div className="error-banner" style={{ margin: 0 }}>
          <span>{error}</span>
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 8 }}>
        {(['all', 'plan', 'task', 'memory'] as const).map((cat) => (
          <button
            key={cat}
            className={`button ${filter === cat ? 'primary' : ''}`}
            onClick={() => setFilter(cat)}
            style={{ textTransform: 'capitalize', fontSize: 13 }}
          >
            {cat === 'all' ? 'All Activity' : cat === 'plan' ? 'Autonomous Plans' : cat === 'task' ? 'Cloud Tasks' : 'Memories'}
          </button>
        ))}
      </div>

      {/* Timeline Stream */}
      {filtered.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', border: '1px dashed var(--border-color, #e5e7eb)', borderRadius: 8, color: '#888' }}>
          <Activity size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
          <p style={{ margin: '0 0 8px 0', fontSize: 15, fontWeight: 500 }}>No recent activities recorded</p>
          <p style={{ margin: 0, fontSize: 13 }}>Activities from autonomous plans, cloud tasks, and memory will stream here automatically.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                padding: '12px 16px',
                borderRadius: 8,
                border: '1px solid var(--border-color, #e5e7eb)',
                background: 'var(--color-bg, #fff)',
              }}
            >
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
          ))}
        </div>
      )}
    </div>
  );
}
