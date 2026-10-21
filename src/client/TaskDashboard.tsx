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
  Cloud,
  Calendar,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { api } from './api';

export interface CloudTask {
  id: string;
  prompt: string;
  status: string;
  intervalSeconds: number | null;
  nextRunAt: number | null;
  createdAt: number;
  updatedAt: number;
  error: string | null;
  threadId?: string;
  runs?: Array<{
    id: string;
    status: string;
    startedAt: number;
    finishedAt: number | null;
    result?: { text: string };
    error?: string;
  }>;
}

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

  // Cloud Tasks & Headless Execution state
  const [activeTab, setActiveTab] = useState<'plans' | 'cloud'>('plans');
  const [cloudTasks, setCloudTasks] = useState<CloudTask[]>([]);
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [showCloudModal, setShowCloudModal] = useState(false);
  const [cloudPrompt, setCloudPrompt] = useState('');
  const [cloudDelaySeconds, setCloudDelaySeconds] = useState(0);
  const [cloudIntervalSeconds, setCloudIntervalSeconds] = useState<number | null>(null);
  const [cloudTimezone, setCloudTimezone] = useState(
    typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      : 'UTC',
  );

  const fetchPlans = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<TaskPlan[]>('/plans');
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

  const fetchCloudTasks = async () => {
    setLoadingCloud(true);
    try {
      const data = await api<CloudTask[]>('/cloud-tasks');
      setCloudTasks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch cloud tasks.');
    } finally {
      setLoadingCloud(false);
    }
  };

  useEffect(() => {
    void fetchPlans();
    void fetchCloudTasks();
  }, []);

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoal.trim()) return;

    try {
      const plan = await api<TaskPlan>('/plans', 'POST', { goal: newGoal.trim() });
      setPlans((prev) => [plan, ...prev]);
      setSelectedPlanId(plan.id);
      setNewGoal('');
      setShowCreateModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create plan.');
    }
  };

  const handleCreateCloudTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloudPrompt.trim()) return;

    try {
      await api('/cloud-tasks', 'POST', {
        prompt: cloudPrompt.trim(),
        delaySeconds: cloudDelaySeconds > 0 ? cloudDelaySeconds : undefined,
        intervalSeconds: cloudIntervalSeconds || undefined,
        timezone: cloudTimezone,
      });
      setCloudPrompt('');
      setShowCloudModal(false);
      await fetchCloudTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to launch cloud task.');
    }
  };

  const handleDeleteCloudTask = async (id: string) => {
    try {
      await api(`/tasks/${id}`, 'DELETE');
      setCloudTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete cloud task.');
    }
  };

  const handleRetryCloudTask = async (id: string) => {
    try {
      await api(`/tasks/${id}/actions`, 'POST', { action: 'run' });
      await fetchCloudTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rerun cloud task.');
    }
  };

  const handleStep = async (planId: string) => {
    setStepping(true);
    try {
      await api(`/plans/${planId}/step`, 'POST');
      await fetchPlans();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to step plan.');
    } finally {
      setStepping(false);
    }
  };

  const handleApprove = async (planId: string, stepId: string) => {
    try {
      await api(`/plans/${planId}/steps/${stepId}/approve`, 'POST');
      await fetchPlans();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve step.');
    }
  };

  const handleCancel = async (planId: string) => {
    try {
      await api(`/plans/${planId}/cancel`, 'POST');
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '24px 0' }}>
      {/* Top Tab Switcher */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color, #e5e7eb)', paddingBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`button ${activeTab === 'plans' ? 'primary' : ''}`}
            onClick={() => setActiveTab('plans')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Sparkles size={14} /> Autonomous Plans ({plans.length})
          </button>
          <button
            className={`button ${activeTab === 'cloud' ? 'primary' : ''}`}
            onClick={() => setActiveTab('cloud')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Cloud size={14} /> Cloud & Headless Tasks ({cloudTasks.length})
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="button"
            onClick={() => (activeTab === 'plans' ? void fetchPlans() : void fetchCloudTasks())}
            disabled={loading || loadingCloud}
          >
            <RefreshCw size={14} className={loading || loadingCloud ? 'spin' : ''} /> Refresh
          </button>
          {activeTab === 'plans' ? (
            <button className="primary" onClick={() => setShowCreateModal(true)}>
              <Plus size={14} /> New Autonomous Plan
            </button>
          ) : (
            <button className="primary" onClick={() => setShowCloudModal(true)}>
              <Plus size={14} /> Launch Cloud Task
            </button>
          )}
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

      {activeTab === 'cloud' ? (
        /* Cloud Background Tasks View */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ padding: '12px 16px', borderRadius: 8, background: 'var(--color-surface, rgba(0,0,0,0.02))', border: '1px solid var(--border-color, #e5e7eb)', fontSize: 13, color: '#666', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Cloud size={16} color="#3b82f6" />
            <span>
              Cloud tasks run directly on the Render server environment in the background. You can safely close your browser or turn off your device—the task will continue executing to completion.
            </span>
          </div>

          {cloudTasks.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', border: '1px dashed var(--border-color, #e5e7eb)', borderRadius: 8, color: '#888' }}>
              <Cloud size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
              <p style={{ margin: '0 0 8px 0', fontSize: 15, fontWeight: 500 }}>No active cloud tasks</p>
              <p style={{ margin: 0, fontSize: 13 }}>Click &ldquo;Launch Cloud Task&rdquo; to execute a long-running background task on your server.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {cloudTasks.map((task) => {
                const latestRun = task.runs?.[0];
                return (
                  <div
                    key={task.id}
                    style={{
                      border: '1px solid var(--border-color, #e5e7eb)',
                      borderRadius: 10,
                      padding: 16,
                      background: 'var(--color-bg, #fff)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: 'var(--border-color, #e5e7eb)', textTransform: 'uppercase', fontWeight: 600 }}>
                            {task.status}
                          </span>
                          {task.intervalSeconds && (
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: '#e0e7ff', color: '#4338ca', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Clock size={11} /> Recurring every {Math.round(task.intervalSeconds / 60)}m
                            </span>
                          )}
                          <span style={{ fontSize: 12, color: '#888' }}>
                            Created: {new Date(task.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{task.prompt}</h4>
                      </div>

                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="icon-button"
                          title="Rerun Task in Cloud"
                          onClick={() => handleRetryCloudTask(task.id)}
                          style={{ padding: 6 }}
                        >
                          <RotateCcw size={15} />
                        </button>
                        <button
                          className="icon-button"
                          title="Delete Cloud Task"
                          onClick={() => handleDeleteCloudTask(task.id)}
                          style={{ padding: 6, color: '#ef4444' }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>

                    {/* Output or Error preview */}
                    {latestRun?.result?.text ? (
                      <div style={{ padding: 12, borderRadius: 6, background: 'var(--color-surface, #f9fafb)', border: '1px solid var(--border-color, #e5e7eb)', fontSize: 13 }}>
                        <strong style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', color: '#888', marginBottom: 4 }}>
                          Latest Cloud Run Result:
                        </strong>
                        <div style={{ whiteSpace: 'pre-wrap', maxHeight: 150, overflowY: 'auto' }}>
                          {latestRun.result.text}
                        </div>
                      </div>
                    ) : task.error ? (
                      <div style={{ padding: 10, borderRadius: 6, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 13 }}>
                        <strong>Error:</strong> {task.error}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Autonomous Plans View */
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

                    {step.output != null && (
                      <div style={{ padding: 8, background: '#f9fafb', borderRadius: 4, fontSize: 12, maxHeight: 100, overflowY: 'auto', fontFamily: 'monospace' }}>
                        {typeof step.output === 'string' ? (step.output as string) : JSON.stringify(step.output, null, 2)}
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
      )}

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

      {/* Cloud Task Launch Modal */}
      {showCloudModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCloudModal(false);
          }}
        >
          <div
            style={{
              background: 'var(--color-bg, #fff)',
              padding: 24,
              borderRadius: 12,
              width: 520,
              maxWidth: '90vw',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Cloud size={18} color="#3b82f6" /> Launch Headless Cloud Task
              </h3>
              <button className="icon-button" onClick={() => setShowCloudModal(false)}>
                <X size={16} />
              </button>
            </div>

            <p style={{ margin: 0, fontSize: 13, color: '#666' }}>
              This task will execute on your Render server in the background. Even if you close your browser tab or laptop, the task will continue until completion.
            </p>

            <form onSubmit={handleCreateCloudTask} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  Task Instruction or Research Objective
                </label>
                <textarea
                  rows={4}
                  required
                  value={cloudPrompt}
                  onChange={(e) => setCloudPrompt(e.target.value)}
                  placeholder="e.g. Conduct deep research on next-gen serverless database architectures, prepare a structured report, and save it."
                  style={{
                    width: '100%',
                    padding: 10,
                    borderRadius: 6,
                    border: '1px solid #ccc',
                    fontFamily: 'inherit',
                    fontSize: 14,
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    Start Time
                  </label>
                  <select
                    value={cloudDelaySeconds}
                    onChange={(e) => setCloudDelaySeconds(Number(e.target.value))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #ccc', background: 'transparent' }}
                  >
                    <option value={0}>Run Immediately</option>
                    <option value={300}>Delay 5 minutes</option>
                    <option value={1800}>Delay 30 minutes</option>
                    <option value={3600}>Delay 1 hour</option>
                    <option value={28800}>Delay 8 hours (Overnight)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    Repeat Interval
                  </label>
                  <select
                    value={cloudIntervalSeconds ?? ''}
                    onChange={(e) => setCloudIntervalSeconds(e.target.value ? Number(e.target.value) : null)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #ccc', background: 'transparent' }}
                  >
                    <option value="">One-time Task</option>
                    <option value={3600}>Hourly</option>
                    <option value={86400}>Daily (Every 24h)</option>
                    <option value={604800}>Weekly (Every 7d)</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  Timezone
                </label>
                <input
                  type="text"
                  value={cloudTimezone}
                  onChange={(e) => setCloudTimezone(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #ccc', background: 'transparent' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <button type="button" className="button" onClick={() => setShowCloudModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary" disabled={!cloudPrompt.trim()}>
                  Queue for Cloud Execution
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
