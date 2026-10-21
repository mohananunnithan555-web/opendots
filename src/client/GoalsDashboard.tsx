import { useState, useEffect } from 'react';
import {
  Target,
  Plus,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Play,
  Pause,
  Trash2,
  Sparkles,
  Calendar,
  Tag,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { api } from './api';
import type { Goal, GoalMilestone } from '../shared/types';

interface ProactiveSuggestion {
  goalId?: string;
  title: string;
  reason: string;
  suggestedAction: string;
  urgency: 'low' | 'medium' | 'high';
}

export function GoalsDashboard({ onExecuteTask }: { onExecuteTask?: (prompt: string) => void }) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [suggestions, setSuggestions] = useState<ProactiveSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'paused'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Goal['category']>('project');
  const [priority, setPriority] = useState<Goal['priority']>('medium');
  const [targetDateStr, setTargetDateStr] = useState('');
  const [milestonesInput, setMilestonesInput] = useState<string[]>(['']);

  const loadData = async () => {
    try {
      setLoading(true);
      const [fetchedGoals, fetchedSuggestions] = await Promise.all([
        api<Goal[]>('/api/goals'),
        api<ProactiveSuggestion[]>('/api/goals/suggestions'),
      ]);
      setGoals(fetchedGoals);
      setSuggestions(fetchedSuggestions);
    } catch (err) {
      console.error('Failed to load goals:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const milestones: GoalMilestone[] = milestonesInput
      .filter((m) => m.trim().length > 0)
      .map((m, idx) => ({
        id: `ms-${Date.now()}-${idx}`,
        title: m.trim(),
        completed: false,
      }));

    try {
      const targetDate = targetDateStr ? new Date(targetDateStr).getTime() : undefined;
      await api('/api/goals', 'POST', {
        title: title.trim(),
        description: description.trim() || undefined,
        category,
        priority,
        targetDate,
        milestones,
      });

      setTitle('');
      setDescription('');
      setMilestonesInput(['']);
      setTargetDateStr('');
      setModalOpen(false);
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not create goal');
    }
  };

  const toggleMilestone = async (goal: Goal, milestoneId: string) => {
    const updatedMilestones = goal.milestones.map((m) =>
      m.id === milestoneId ? { ...m, completed: !m.completed } : m,
    );
    const allCompleted = updatedMilestones.length > 0 && updatedMilestones.every((m) => m.completed);
    const newStatus = allCompleted ? 'completed' : goal.status === 'completed' ? 'active' : goal.status;

    try {
      await api(`/api/goals/${goal.id}`, 'PUT', {
        milestones: updatedMilestones,
        status: newStatus,
      });
      loadData();
    } catch (err) {
      console.error('Failed to update milestone:', err);
    }
  };

  const updateGoalStatus = async (goalId: string, status: Goal['status']) => {
    try {
      await api(`/api/goals/${goalId}`, 'PUT', { status });
      loadData();
    } catch (err) {
      console.error('Failed to update goal status:', err);
    }
  };

  const deleteGoal = async (goalId: string) => {
    if (!confirm('Are you sure you want to delete this goal?')) return;
    try {
      await api(`/api/goals/${goalId}`, 'DELETE');
      loadData();
    } catch (err) {
      console.error('Failed to delete goal:', err);
    }
  };

  const filteredGoals = goals.filter((g) => {
    if (filter === 'all') return true;
    return g.status === filter;
  });

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-200 dark:border-gray-800">
        <div>
          <div className="flex items-center gap-2">
            <Target className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Personal Goals & Proactive Assistant
            </h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Track milestones, deadlines, and receive proactive suggestions powered by your saved context.
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          New Goal
        </button>
      </div>

      {/* Proactive Suggestions Banner */}
      {suggestions.length > 0 && (
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/40 dark:to-purple-950/40 border border-indigo-100 dark:border-indigo-900/60 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-indigo-900 dark:text-indigo-300 font-semibold text-sm mb-3">
            <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            Proactive Suggestions & Next Actions
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {suggestions.map((s, idx) => (
              <div
                key={idx}
                className="bg-white/80 dark:bg-gray-900/80 backdrop-blur rounded-lg p-3 border border-indigo-100 dark:border-indigo-950 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-xs text-gray-900 dark:text-gray-100">
                      {s.title}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        s.urgency === 'high'
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                      }`}
                    >
                      {s.urgency.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{s.reason}</p>
                </div>
                {onExecuteTask && (
                  <button
                    onClick={() => onExecuteTask(s.suggestedAction)}
                    className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium flex items-center gap-1"
                  >
                    <Play className="w-3 h-3" /> Execute: {s.suggestedAction}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-800 pb-2">
        {(['all', 'active', 'completed', 'paused'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition ${
              filter === tab
                ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            {tab} ({goals.filter((g) => (tab === 'all' ? true : g.status === tab)).length})
          </button>
        ))}
      </div>

      {/* Goals Grid */}
      {loading ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400 text-sm">
          Loading goals...
        </div>
      ) : filteredGoals.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-8">
          <Target className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            No goals found
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto">
            Create long-term objectives and break them down into trackable milestones.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredGoals.map((goal) => {
            const completedCount = goal.milestones.filter((m) => m.completed).length;
            const totalCount = goal.milestones.length;
            const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
            const isExpanded = expandedGoalId === goal.id;

            return (
              <div
                key={goal.id}
                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm hover:shadow transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase ${
                            goal.priority === 'high'
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                              : goal.priority === 'medium'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                              : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                          }`}
                        >
                          {goal.priority}
                        </span>
                        <span className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded font-medium capitalize">
                          {goal.category}
                        </span>
                      </div>
                      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mt-2">
                        {goal.title}
                      </h3>
                      {goal.description && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          {goal.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {goal.status === 'active' ? (
                        <button
                          onClick={() => updateGoalStatus(goal.id, 'paused')}
                          title="Pause Goal"
                          className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                        >
                          <Pause className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => updateGoalStatus(goal.id, 'active')}
                          title="Resume Goal"
                          className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => deleteGoal(goal.id)}
                        title="Delete Goal"
                        className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                      <span>
                        {completedCount} of {totalCount} Milestones
                      </span>
                      <span className="font-semibold text-gray-900 dark:text-gray-100">{pct}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          pct === 100
                            ? 'bg-emerald-500'
                            : 'bg-indigo-600 dark:bg-indigo-500'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {/* Target Date */}
                  {goal.targetDate && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mt-3">
                      <Calendar className="w-3.5 h-3.5" />
                      Target: {new Date(goal.targetDate).toLocaleDateString()}
                    </div>
                  )}

                  {/* Milestones list toggle */}
                  {goal.milestones.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
                      <button
                        onClick={() => setExpandedGoalId(isExpanded ? null : goal.id)}
                        className="flex items-center justify-between w-full text-xs font-medium text-gray-700 dark:text-gray-300 hover:text-indigo-600"
                      >
                        <span>Milestones Checklist</span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>

                      {isExpanded && (
                        <div className="mt-2 space-y-1.5">
                          {goal.milestones.map((m) => (
                            <div
                              key={m.id}
                              onClick={() => toggleMilestone(goal, m.id)}
                              className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-800/60 cursor-pointer text-xs"
                            >
                              <div
                                className={`w-4 h-4 rounded border flex items-center justify-center transition ${
                                  m.completed
                                    ? 'bg-emerald-500 border-emerald-500 text-white'
                                    : 'border-gray-300 dark:border-gray-600'
                                }`}
                              >
                                {m.completed && <Check className="w-3 h-3" />}
                              </div>
                              <span
                                className={`${
                                  m.completed
                                    ? 'line-through text-gray-400 dark:text-gray-500'
                                    : 'text-gray-800 dark:text-gray-200'
                                }`}
                              >
                                {m.title}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Goal Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">
              Create New Goal
            </h2>

            <form onSubmit={handleCreateGoal} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Goal Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Master TypeScript and Deploy Full-Stack Agent"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Description / Strategy
                </label>
                <textarea
                  rows={2}
                  placeholder="Key context and success criteria..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as Goal['category'])}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent text-gray-900 dark:text-gray-100"
                  >
                    <option value="project">Project</option>
                    <option value="career">Career</option>
                    <option value="learning">Learning</option>
                    <option value="personal">Personal</option>
                    <option value="finance">Finance</option>
                    <option value="health">Health</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Priority
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as Goal['priority'])}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent text-gray-900 dark:text-gray-100"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Target Deadline
                </label>
                <input
                  type="date"
                  value={targetDateStr}
                  onChange={(e) => setTargetDateStr(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent text-gray-900 dark:text-gray-100"
                />
              </div>

              {/* Milestones dynamic list */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Milestones
                </label>
                <div className="space-y-2">
                  {milestonesInput.map((m, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input
                        type="text"
                        placeholder={`Milestone ${idx + 1}`}
                        value={m}
                        onChange={(e) => {
                          const updated = [...milestonesInput];
                          updated[idx] = e.target.value;
                          setMilestonesInput(updated);
                        }}
                        className="flex-1 text-xs px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent text-gray-900 dark:text-gray-100"
                      />
                      {milestonesInput.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            setMilestonesInput(milestonesInput.filter((_, i) => i !== idx));
                          }}
                          className="text-gray-400 hover:text-rose-500 px-2"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setMilestonesInput([...milestonesInput, ''])}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                  >
                    + Add Another Milestone
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                >
                  Save Goal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
