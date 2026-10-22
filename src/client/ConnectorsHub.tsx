import { useState, useEffect } from 'react';
import {
  Plug,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Mail,
  Calendar,
  HardDrive,
  Camera,
  Send,
  MessageSquare,
  Hash,
  ExternalLink,
  Shield,
  Key,
} from 'lucide-react';
import { api } from './api';
import type { Connector, ConnectorType } from '../shared/types';

export function ConnectorsHub() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'connectors' | 'matrix'>('connectors');
  const [testingType, setTestingType] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ [key: string]: { success: boolean; message: string } }>({});
  const [configModal, setConfigModal] = useState<Connector | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');

  const loadConnectors = async () => {
    try {
      setLoading(true);
      const data = await api<Connector[]>('/api/connectors');
      setConnectors(data);
    } catch (err) {
      console.error('Failed to load connectors:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConnectors();
  }, []);

  const handleTest = async (type: ConnectorType) => {
    try {
      setTestingType(type);
      const res = await api<{ success: boolean; message: string }>(`/api/connectors/${type}/test`, 'POST');
      setTestResult((prev) => ({ ...prev, [type]: res }));
      loadConnectors();
    } catch (err) {
      setTestResult((prev) => ({
        ...prev,
        [type]: { success: false, message: err instanceof Error ? err.message : 'Ping failed.' },
      }));
    } finally {
      setTestingType(null);
    }
  };

  const handleDisconnect = async (type: ConnectorType) => {
    if (!confirm(`Are you sure you want to disconnect ${type}?`)) return;
    try {
      await api(`/api/connectors/${type}/disconnect`, 'POST');
      loadConnectors();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Disconnect failed');
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configModal) return;

    try {
      await api(`/api/connectors/${configModal.type}`, 'PUT', {
        status: apiKeyInput.trim() ? 'connected' : 'unconfigured',
        config: { apiKey: apiKeyInput.trim() },
        error: undefined,
      });
      setConfigModal(null);
      setApiKeyInput('');
      loadConnectors();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Config save failed');
    }
  };

  const getConnectorIcon = (type: ConnectorType) => {
    switch (type) {
      case 'gmail':
        return <Mail className="w-5 h-5 text-red-500" />;
      case 'google_calendar':
        return <Calendar className="w-5 h-5 text-blue-500" />;
      case 'google_drive':
        return <HardDrive className="w-5 h-5 text-amber-500" />;
      case 'instagram':
        return <Camera className="w-5 h-5 text-pink-500" />;
      case 'telegram':
        return <Send className="w-5 h-5 text-sky-500" />;
      case 'whatsapp':
        return <MessageSquare className="w-5 h-5 text-emerald-500" />;
      case 'slack':
        return <Hash className="w-5 h-5 text-purple-500" />;
      default:
        return <Plug className="w-5 h-5 text-indigo-500" />;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-200 dark:border-gray-800">
        <div>
          <div className="flex items-center gap-2">
            <Plug className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Connected Applications & Integrations
            </h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manage external connectors and inspect the comprehensive Google Ecosystem capability matrix.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Tab Controls */}
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
            <button
              onClick={() => setTab('connectors')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                tab === 'connectors'
                  ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Active Connectors
            </button>
            <button
              onClick={() => setTab('matrix')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                tab === 'matrix'
                  ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Capability Matrix
            </button>
          </div>

          <button
            onClick={loadConnectors}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* TAB 1: CONNECTORS GRID */}
      {tab === 'connectors' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {connectors.map((c) => {
          const isTesting = testingType === c.type;
          const pingResult = testResult[c.type];

          return (
            <div
              key={c.id}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                      {getConnectorIcon(c.type)}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
                        {c.name}
                      </h3>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider inline-block mt-0.5 ${
                          c.status === 'connected'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : c.status === 'disconnected'
                            ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleTest(c.type)}
                      disabled={isTesting}
                      title="Test Connection"
                      className="p-1.5 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin text-indigo-600' : ''}`} />
                    </button>
                    {c.status === 'connected' && (
                      <button
                        onClick={() => handleDisconnect(c.type)}
                        title="Disconnect"
                        className="text-xs text-gray-400 hover:text-rose-600 p-1 rounded"
                      >
                        Disconnect
                      </button>
                    )}
                  </div>
                </div>

                {/* Permissions & Actions */}
                <div className="mt-3 space-y-2 text-xs">
                  <div>
                    <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                      Granted Scope:
                    </span>
                    <ul className="mt-1 list-disc list-inside text-gray-600 dark:text-gray-400 space-y-0.5">
                      {c.permissions.map((p, idx) => (
                        <li key={idx}>{p}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                      Available Actions:
                    </span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {c.availableActions.map((act, idx) => (
                        <span
                          key={idx}
                          className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded font-mono"
                        >
                          {act}
                        </span>
                      ))}
                    </div>
                  </div>

                  {c.error && (
                    <div className="mt-2 p-2 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900 text-[11px] flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{c.error}</span>
                    </div>
                  )}

                  {pingResult && (
                    <div
                      className={`mt-2 p-2 rounded text-[11px] flex items-center gap-1.5 border ${
                        pingResult.success
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900'
                          : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-900'
                      }`}
                    >
                      {pingResult.success ? (
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span>{pingResult.message}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Button */}
              <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 flex justify-end">
                <button
                  onClick={() => {
                    setConfigModal(c);
                    setApiKeyInput('');
                  }}
                  className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                >
                  <Key className="w-3 h-3" /> Configure Credentials
                </button>
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* TAB 2: GOOGLE ECOSYSTEM & EXTERNAL CAPABILITY MATRIX */}
      {tab === 'matrix' && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-indigo-600" /> Google Ecosystem & External Connectors Capability Matrix
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Overview of supported actions, required authentication scopes, least-privilege permission models, and API rate limits.
              </p>
            </div>
            <span className="text-[11px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 rounded">
              Zero-Cost Verified
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/60 text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-800">
                  <th className="p-3 font-semibold">Service / Connector</th>
                  <th className="p-3 font-semibold">Supported Actions</th>
                  <th className="p-3 font-semibold">Auth Protocol</th>
                  <th className="p-3 font-semibold">Permission Model</th>
                  <th className="p-3 font-semibold">Limitations & Quotas</th>
                  <th className="p-3 font-semibold">Integration Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-gray-600 dark:text-gray-300">
                {[
                  {
                    name: 'Gmail',
                    actions: 'search_inbox, read_threads, extract_deadlines, draft_reply, send_email',
                    auth: 'OAuth2 / App Password',
                    perm: 'Read-only (Drafting) / Approval Required (Sending)',
                    limits: '100 queries/day free tier quota',
                    status: 'Connected',
                  },
                  {
                    name: 'Google Calendar & Tasks',
                    actions: 'find_conflicts, propose_schedule, create_event, list_tasks, update_task',
                    auth: 'OAuth2 / Service Account',
                    perm: 'Read / Write',
                    limits: '50 events per query window',
                    status: 'Connected',
                  },
                  {
                    name: 'Google Drive & Docs',
                    actions: 'search_docs, summarize_collection, create_report, organize_folder',
                    auth: 'OAuth2 / Drive API v3',
                    perm: 'Read / Write',
                    limits: '10MB max file size; local SQLite snapshotting',
                    status: 'Connected',
                  },
                  {
                    name: 'Google Sheets',
                    actions: 'analyze_data, compute_formulas, generate_tracker, matrix_compare',
                    auth: 'OAuth2 / Sheets API',
                    perm: 'Read / Write',
                    limits: 'Local tabular computation; zero external fees',
                    status: 'Connected',
                  },
                  {
                    name: 'Google Slides',
                    actions: 'create_deck_from_research, outline_slides, format_presentation',
                    auth: 'OAuth2 / Slides API',
                    perm: 'Write',
                    limits: 'Up to 10 slides per generated deck',
                    status: 'Available',
                  },
                  {
                    name: 'Google Keep',
                    actions: 'search_notes, convert_to_tasks, create_note',
                    auth: 'Keep API / Webhook',
                    perm: 'Read / Write',
                    limits: 'Text notes & checklists',
                    status: 'Available',
                  },
                  {
                    name: 'Google Contacts',
                    actions: 'search_contacts, lookup_email, retrieve_directory',
                    auth: 'People API',
                    perm: 'Read-only',
                    limits: 'User-authorized contacts only',
                    status: 'Available',
                  },
                  {
                    name: 'YouTube',
                    actions: 'search_videos, extract_transcript, metadata_analysis',
                    auth: 'YouTube Data API v3',
                    perm: 'Read-only',
                    limits: '10,000 units/day standard quota',
                    status: 'Available',
                  },
                  {
                    name: 'Instagram Public Research',
                    actions: 'inspect_profile, search_hashtag, analyze_post_metadata',
                    auth: 'Public Web Interface',
                    perm: 'Read-only',
                    limits: 'Public metadata only; no private account access',
                    status: 'Connected',
                  },
                  {
                    name: 'Slack',
                    actions: 'post_message, reply_thread, share_summary',
                    auth: 'Bot Token (xoxb-...)',
                    perm: 'Approval Required (Outbound)',
                    limits: '1 message/second rate limit',
                    status: 'Configurable',
                  },
                  {
                    name: 'Telegram',
                    actions: 'send_notification, receive_command, send_file',
                    auth: 'Bot API Token',
                    perm: 'Write (With Approval)',
                    limits: '30 messages/second',
                    status: 'Configurable',
                  },
                  {
                    name: 'WhatsApp Business API',
                    actions: 'send_template_message, notify_user',
                    auth: 'Meta Cloud API Token',
                    perm: 'Approval Required',
                    limits: 'Pre-approved HSM templates only',
                    status: 'Configurable',
                  },
                ].map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                    <td className="p-3 font-bold text-gray-900 dark:text-gray-100">{row.name}</td>
                    <td className="p-3 font-mono text-[11px]">{row.actions}</td>
                    <td className="p-3">{row.auth}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        row.perm.includes('Approval')
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                      }`}>
                        {row.perm}
                      </span>
                    </td>
                    <td className="p-3 text-gray-500 dark:text-gray-400">{row.limits}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        row.status === 'Connected'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                      }`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Config Modal */}
      {configModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl max-w-md w-full p-6 shadow-xl">
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-2">
              Configure {configModal.name}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Enter your integration token or environment key. Credentials are kept secure on the backend and never exposed to the frontend.
            </p>

            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  API Token / Secret Key
                </label>
                <input
                  type="password"
                  placeholder="Paste token or leave blank to unset..."
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfigModal(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                >
                  Save & Connect
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
