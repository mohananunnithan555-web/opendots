import { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Play,
  XCircle,
  ShieldAlert,
  ChevronRight,
  Plus,
  RefreshCw,
  Sparkles,
  Check,
  X,
} from 'lucide-react';
import { api } from './api';

export interface TaskStep {
  id: string;
  title: string;
  description: string;
  status:
    | 'pending'
    | 'running'
    | 'waiting_approval'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'skipped';
  tool?: string;
  input?: Record<string, unknown>;
  output?: unknown;
  error?: string;
  requiresApproval?: boolean;
  approved?: boolean;
  retries?: number;
  maxRetries?: number;
  startedAt?: number;
  finishedAt?: number;
}

export interface TaskPlan {
  id: string;
  ownerId: string;
  goal: string;
  status:
    | 'pending'
    | 'running'
    | 'waiting_approval'
    | 'completed'
    | 'failed'
    | 'cancelled';
  currentStepIndex: number;
  steps: TaskStep[];
  finalResult?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export function TaskDashboard() {
  const [plans, setPlans] = useState<TaskPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newGoal, setNewGoal] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [stepping, setStepping] = useState(false);

  const fetchPlans = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<TaskPlan[]>('/api/plans');
      setPlans(data);
      if (data.length > 0 && !selectedPlanId) {
        setSelectedPlanId(data[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch task plans.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchPlans();
  }, []);

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoal.trim()) return;

    try {
      const plan = await api<TaskPlan>('/api/plans', {
        method: 'POST',
        body: JSON.stringify({ goal: newGoal.trim() }),
      });
      setPlans((prev) => [plan, ...prev]);
      setSelectedPlanId(plan.id);
      setNewGoal('');
      setShowCreateModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create plan.');
    }
  };

  const handleStep = async (planId: string) => {
    setStepping(true);
    try {
      await api(`/api/plans/${planId}/step`, { method: 'POST' });
      await fetchPlans();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to step plan.');
    } finally {
      setStepping(false);
    }
  };

  const handleApprove = async (planId: string, stepId: string) => {
    try {
      await api(`/api/plans/${planId}/steps/${stepId}/approve`, { method: 'POST' });
      await fetchPlans();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve step.');
    }
  };

  const handleCancel = async (planId: string) => {
    try {
      await api(`/api/plans/${planId}/cancel`, { method: 'POST' });
      await fetchPlans();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel plan.');
    }
  };

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);

  const getStatusBadge = (status: TaskPlan['status'] | TaskStep['status']) => {
    switch (status) {
      case 'completed':
        return (
          <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <CheckCircle2 size={13} /> Completed
          </span>
        );
      case 'running':
        return (
          <span className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <RefreshCw size={13} className="spin" /> Running
          </span>
        );
      case 'waiting_approval':
        return (
          <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#f59e0b', color: '#fff' }}>
            <ShieldAlert size={13} /> Approval Needed
          </span>
        );
      case 'failed':
        return (
          <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <AlertCircle size={13} /> Failed
          </span>
        );
      case 'cancelled':
        return (
          <span className="badge badge-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <XCircle size={13} /> Cancelled
          </span>
        );
      default:
        return (
          <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Clock size={13} /> Pending
          </span>
        );
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '24px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Autonomous Task Planner</h2>
          <p style={{ color: 'var(--text-secondary, #666)', fontSize: 13, marginTop: 4 }}>
            Goal decomposition, verifiable step execution, and human confirmation checkpoints.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="button" onClick={fetchPlans} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
          <button className="primary" onClick={() => setShowCreateModal(true)}>
            <Plus size={14} /> New Autonomous Plan
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner" style={{ margin: 0 }}>
          <span>{error}</span>
          <button className="icon-button" onClick={() => setError(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20 }}>
        {/* Plan List Column */}
        <div style={{ border: '1px solid var(--border-color, #e5e7eb)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 600, overflowY: 'auto' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase' }}>Active & Past Plans</span>
          {plans.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#888', fontSize: 13 }}>
              No autonomous plans yet. Click “New Autonomous Plan” to start one.
            </div>
          ) : (
            plans.map((p) => {
              const completedCount = p.steps.filter((s) => s.status === 'completed').length;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedPlanId(p.id)}
                  style={{
                    padding: 12,
                    borderRadius: 6,
                    cursor: 'pointer',
                    background: selectedPlanId === p.id ? 'var(--highlight-bg, #f3f4f6)' : 'transparent',
                    border: '1px solid',
                    borderColor: selectedPlanId === p.id ? 'var(--primary-color, #3b82f6)' : 'transparent',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                      {p.goal}
                    </strong>
                    {getStatusBadge(p.status)}
                  </div>
                  <div style={{ fontSize: 12, color: '#888', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{completedCount}/{p.steps.length} steps</span>
                    <span>{new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Selected Plan Details & Execution Column */}
        <div style={{ border: '1px solid var(--border-color, #e5e7eb)', borderRadius: 8, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {selectedPlan ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: '#888' }}>OBJECTIVE:</span>
                    {getStatusBadge(selectedPlan.status)}
                  </div>
                  <h3 style={{ fontSize: 17, margin: 0 }}>{selectedPlan.goal}</h3>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  {selectedPlan.status !== 'completed' && selectedPlan.status !== 'cancelled' && (
                    <>
                      <button
                        className="primary"
                        onClick={() => handleStep(selectedPlan.id)}
                        disabled={stepping || selectedPlan.status === 'waiting_approval'}
                      >
                        <Play size={13} /> {stepping ? 'Stepping...' : 'Execute Step'}
                      </button>
                      <button className="button" onClick={() => handleCancel(selectedPlan.id)}>
                        <X size={13} /> Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ background: '#e5e7eb', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    background: selectedPlan.status === 'failed' ? '#ef4444' : '#10b981',
                    width: `${Math.min(100, Math.round((selectedPlan.steps.filter((s) => s.status === 'completed').length / selectedPlan.steps.length) * 100))}%`,
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>

              {selectedPlan.finalResult && (
                <div style={{ padding: 12, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, color: '#166534', fontSize: 13 }}>
                  <strong>Final Result:</strong> {selectedPlan.finalResult}
                </div>
              )}

              {selectedPlan.error && (
                <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', fontSize: 13 }}>
                  <strong>Error:</strong> {selectedPlan.error}
                </div>
              )}

              {/* Steps timeline */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Plan Steps:</span>
                {selectedPlan.steps.map((step, idx) => (
                  <div
                    key={step.id}
                    style={{
                      border: '1px solid var(--border-color, #e5e7eb)',
                      borderRadius: 6,
                      padding: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      background: step.status === 'waiting_approval' ? '#fffbeb' : 'transparent',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>
                          {idx + 1}
                        </span>
                        <strong style={{ fontSize: 14 }}>{step.title}</strong>
                        {step.tool && (
                          <span style={{ fontSize: 11, background: '#e0e7ff', color: '#3730a3', padding: '2px 6px', borderRadius: 4 }}>
                            Tool: {step.tool}
                          </span>
                        )}
                      </div>
                      {getStatusBadge(step.status)}
                    </div>

                    <p style={{ margin: 0, fontSize: 13, color: '#666' }}>{step.description}</p>

                    {step.status === 'waiting_approval' && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 10, background: '#fef3c7', borderRadius: 6, marginTop: 4 }}>
                        <span style={{ fontSize: 13, color: '#92400e', fontWeight: 500 }}>
                          ⚠️ Consequential action requires your explicit approval to proceed.
                        </span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="primary" style={{ background: '#16a34a' }} onClick={() => handleApprove(selectedPlan.id, step.id)}>
                            <Check size={13} /> Approve Step
                          </button>
                          <button className="button" onClick={() => handleCancel(selectedPlan.id)}>
                            <X size={13} /> Decline
                          </button>
                        </div>
                      </div>
                    )}

                    {step.output && (
                      <div style={{ padding: 8, background: '#f9fafb', borderRadius: 4, fontSize: 12, maxHeight: 100, overflowY: 'auto', fontFamily: 'monospace' }}>
                        {typeof step.output === 'string' ? step.output : JSON.stringify(step.output, null, 2)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>
              Select a plan from the list on the left, or create a new one.
            </div>
          )}
        </div>
      </div>

      {/* Create Autonomous Plan Modal */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 8,
              padding: 24,
              width: '100%',
              maxWidth: 500,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={18} color="#3b82f6" /> New Autonomous Plan
              </h3>
              <button className="icon-button" onClick={() => setShowCreateModal(false)}>
                <X size={16} />
              </button>
            </div>

            <p style={{ margin: 0, fontSize: 13, color: '#666' }}>
              Describe a high-level goal. The planner will deconstruct it into sequential steps with tool assignments and safety approvals.
            </p>

            <form onSubmit={handleCreatePlan} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <textarea
                rows={4}
                value={newGoal}
                onChange={(e) => setNewGoal(e.target.value)}
                placeholder="e.g. Research top 3 TypeScript state management libraries, calculate benchmark differences, and compile a report."
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 6,
                  border: '1px solid #ccc',
                  fontFamily: 'inherit',
                  fontSize: 14,
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="button" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary" disabled={!newGoal.trim()}>
                  Decompose & Create Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
