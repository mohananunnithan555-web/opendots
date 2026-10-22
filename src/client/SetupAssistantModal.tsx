import { useState } from 'react';
import {
  Sparkles,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Clock,
  Coins,
  Cpu,
  Layers,
  ShieldCheck,
  X,
  Play,
  RotateCcw,
} from 'lucide-react';
import { api } from './api';
import type { WorkflowAnalysisProposal, Dot } from '../shared/types';

interface SetupAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onWorkflowInstalled?: () => void;
  dots?: Dot[];
}

export function SetupAssistantModal({
  isOpen,
  onClose,
  onWorkflowInstalled,
}: SetupAssistantModalProps) {
  const [goalText, setGoalText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [proposal, setProposal] = useState<WorkflowAnalysisProposal | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installedSuccess, setInstalledSuccess] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalText.trim()) return;

    setAnalyzing(true);
    setError('');
    try {
      const data = await api<WorkflowAnalysisProposal>('/assistant/analyze-workflow', 'POST', {
        goalText: goalText.trim(),
      });
      setProposal(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed. Please check backend.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleInstall = async () => {
    if (!proposal) return;
    setInstalling(true);
    setError('');
    try {
      await api('/assistant/install-workflow', 'POST', {
        skill: proposal.proposedSkill,
        schedule: proposal.proposedSchedule,
      });
      setInstalledSuccess(true);
      onWorkflowInstalled?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Installation failed.');
    } finally {
      setInstalling(false);
    }
  };

  const handleReset = () => {
    setProposal(null);
    setInstalledSuccess(false);
    setError('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-gradient-to-tr from-indigo-500 to-purple-600 rounded-xl text-white">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                Spark Workflow Setup Assistant
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Describe a complex goal in plain language — OpenDots analyzes connectors, configures reusable skills, and schedules execution.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-900 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!proposal && (
            <form onSubmit={handleAnalyze} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Describe what you want to automate:
                </label>
                <textarea
                  rows={4}
                  value={goalText}
                  onChange={(e) => setGoalText(e.target.value)}
                  placeholder="e.g. Every Monday, review my important emails, extract deadlines, prepare a weekly task list, and draft a calendar plan. Or: Monitor budget-friendly perfumes below ₹1,000."
                  className="w-full text-xs p-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Sample Prompts */}
              <div>
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
                  Sample Assistant Ideas:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Every Monday, review my important emails and draft a weekly calendar plan',
                    'Monitor budget-friendly perfumes from stores and alert when below ₹1,000',
                    'Summarize recent document uploads in Drive and save a structured brief',
                  ].map((sample, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setGoalText(sample)}
                      className="text-[11px] bg-gray-100 dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-gray-700 dark:text-gray-300 px-2.5 py-1 rounded-lg transition"
                    >
                      "{sample}"
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={analyzing || !goalText.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm disabled:opacity-50 transition"
                >
                  <Sparkles className={`w-4 h-4 ${analyzing ? 'animate-spin' : ''}`} />
                  {analyzing ? 'Analyzing Goal...' : 'Analyze & Propose Workflow'}
                </button>
              </div>
            </form>
          )}

          {proposal && !installedSuccess && (
            <div className="space-y-4 text-xs">
              {/* Intended Outcome */}
              <div className="p-3 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/60 rounded-xl">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400 block mb-1">
                  1. Identified Outcome
                </span>
                <p className="text-gray-800 dark:text-gray-200 font-medium">
                  {proposal.intendedOutcome}
                </p>
              </div>

              {/* Connectors & Permissions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-800 rounded-xl">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block mb-1">
                    2. Required Connectors
                  </span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {proposal.requiredConnectors.length > 0 ? (
                      proposal.requiredConnectors.map((c, i) => (
                        <span
                          key={i}
                          className="bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3 h-3" /> {c}
                        </span>
                      ))
                    ) : (
                      <span className="text-gray-400 text-[11px]">Standard local execution</span>
                    )}
                  </div>
                </div>

                {/* Resource Usage */}
                <div className="p-3 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-800 rounded-xl">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block mb-1">
                    3. Resource & Cost Impact
                  </span>
                  <div className="space-y-0.5 text-gray-600 dark:text-gray-400 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <Coins className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Cost: <strong>{proposal.expectedResourceUsage.estimatedCost}</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-blue-500" />
                      <span>Duration: {proposal.expectedResourceUsage.estimatedTime}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Proposed Skill */}
              <div className="p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                    <Layers className="w-3 h-3" /> Proposed Reusable Skill
                  </span>
                  <span className="text-[10px] bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded text-gray-600 dark:text-gray-400">
                    Version 1.0.0
                  </span>
                </div>
                <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-1">
                  {proposal.proposedSkill.name}
                </h4>
                <p className="text-gray-600 dark:text-gray-400 mb-2">
                  {proposal.proposedSkill.description}
                </p>
                <div className="bg-gray-50 dark:bg-gray-800 p-2.5 rounded-lg font-mono text-[11px] whitespace-pre-wrap text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                  {proposal.proposedSkill.instructions}
                </div>
              </div>

              {/* Proposed Schedule */}
              {proposal.proposedSchedule && (
                <div className="p-3 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl flex items-start gap-2.5">
                  <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-400 block mb-0.5">
                      Scheduled Trigger Configuration
                    </span>
                    <p className="text-gray-800 dark:text-gray-200 font-medium">
                      {proposal.proposedSchedule.description}
                    </p>
                  </div>
                </div>
              )}

              {/* Confirmation Actions */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" /> Start Over
                </button>
                <button
                  onClick={handleInstall}
                  disabled={installing}
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm disabled:opacity-50 transition"
                >
                  <ShieldCheck className={`w-4 h-4 ${installing ? 'animate-spin' : ''}`} />
                  {installing ? 'Activating Workflow...' : 'Confirm & Activate Workflow'}
                </button>
              </div>
            </div>
          )}

          {installedSuccess && (
            <div className="text-center py-8 space-y-3">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
                Workflow Successfully Activated!
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                The skill has been registered in your library and the recurring schedule is queued with zero cost. You can monitor progress in the Task and Goals dashboards.
              </p>
              <div className="pt-2">
                <button
                  onClick={onClose}
                  className="px-5 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
