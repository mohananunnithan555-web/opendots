import { useState, useEffect } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Send,
  ShoppingCart,
  FileText,
  Trash2,
  ExternalLink,
  Code2,
  Clock,
  ShieldCheck,
  Check,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { api } from './api';
import type { Approval, ApprovalActionType } from '../shared/types';

export function ApprovalCenter() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadApprovals = async () => {
    try {
      setLoading(true);
      const data = await api<Approval[]>('/api/approvals');
      setApprovals(data);
    } catch (err) {
      console.error('Failed to load approvals:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApprovals();
  }, []);

  const handleDecision = async (id: string, decision: 'approved' | 'rejected') => {
    try {
      await api(`/api/approvals/${id}/decide`, 'POST', { decision, decidedBy: 'user' });
      loadApprovals();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Action decision failed');
    }
  };

  const getActionIcon = (type: ApprovalActionType) => {
    switch (type) {
      case 'send_email':
        return <Send className="w-4 h-4 text-blue-500" />;
      case 'purchase':
        return <ShoppingCart className="w-4 h-4 text-emerald-500" />;
      case 'external_form':
        return <FileText className="w-4 h-4 text-purple-500" />;
      case 'destructive_op':
        return <Trash2 className="w-4 h-4 text-rose-500" />;
      case 'custom_tool':
        return <Code2 className="w-4 h-4 text-indigo-500" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    }
  };

  const pendingList = approvals.filter((a) => a.status === 'pending');
  const historyList = approvals.filter((a) => a.status !== 'pending');
  const activeList = tab === 'pending' ? pendingList : historyList;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-200 dark:border-gray-800">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-rose-600 dark:text-rose-400" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Approval Center & Permissions
            </h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Inspect, approve, or reject consequential actions (emails, purchases, form submits, tool installations).
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
          <button
            onClick={() => setTab('pending')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
              tab === 'pending'
                ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            Pending Actions
            {pendingList.length > 0 && (
              <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                {pendingList.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('history')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
              tab === 'history'
                ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            Decision History ({historyList.length})
          </button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-sm text-gray-500">Loading approvals...</div>
      ) : activeList.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-8">
          <ShieldCheck className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {tab === 'pending' ? 'No actions pending approval' : 'No previous decisions'}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto">
            {tab === 'pending'
              ? 'When the AI agent proposes external emails, form submissions, or financial operations, they will queue here for your review.'
              : 'Past approvals and rejections will appear here as an audit trail.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {activeList.map((appr) => {
            const isExpanded = expandedId === appr.id;

            return (
              <div
                key={appr.id}
                className={`bg-white dark:bg-gray-900 border rounded-xl p-4 shadow-sm transition ${
                  appr.status === 'pending'
                    ? 'border-amber-200 dark:border-amber-900/60'
                    : 'border-gray-200 dark:border-gray-800'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="p-1 rounded bg-gray-100 dark:bg-gray-800">
                        {getActionIcon(appr.actionType)}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                        {appr.actionType.replace('_', ' ')}
                      </span>
                      {appr.estimatedCost && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          Est. Cost: {appr.estimatedCost}
                        </span>
                      )}
                      <span className="text-[10px] text-gray-400">
                        {new Date(appr.createdAt).toLocaleTimeString()}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mt-2">
                      {appr.title}
                    </h3>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      {appr.description}
                    </p>

                    {appr.destination && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-mono">
                        Target: {appr.destination}
                      </div>
                    )}

                    {appr.consequences && (
                      <div className="mt-2.5 flex items-start gap-1.5 p-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900/50 text-xs text-rose-800 dark:text-rose-300">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span>{appr.consequences}</span>
                      </div>
                    )}
                  </div>

                  {/* Actions / Status */}
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {appr.status === 'pending' ? (
                      <>
                        <button
                          onClick={() => handleDecision(appr.id, 'rejected')}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:hover:bg-rose-900 dark:text-rose-300 border border-rose-200 dark:border-rose-800 transition flex items-center gap-1"
                        >
                          <X className="w-3.5 h-3.5" /> Reject
                        </button>
                        <button
                          onClick={() => handleDecision(appr.id, 'approved')}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" /> Approve & Execute
                        </button>
                      </>
                    ) : (
                      <span
                        className={`text-xs font-bold px-2.5 py-1 rounded-full uppercase flex items-center gap-1 ${
                          appr.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        }`}
                      >
                        {appr.status === 'approved' ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : (
                          <XCircle className="w-3 h-3" />
                        )}
                        {appr.status}
                      </span>
                    )}
                  </div>
                </div>

                {/* Payload Accordion */}
                <div className="mt-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : appr.id)}
                    className="flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
                  >
                    <span>View Technical Payload</span>
                    {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>

                  {isExpanded && (
                    <pre className="mt-2 p-2.5 rounded bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 text-[11px] font-mono overflow-x-auto text-gray-700 dark:text-gray-300 max-h-48">
                      {JSON.stringify(appr.payload, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
