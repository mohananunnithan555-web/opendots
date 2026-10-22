import { useState, useEffect } from 'react';
import {
  Plug,
  ExternalLink,
  Shield,
  CheckCircle2,
  AlertCircle,
  Plus,
  RefreshCw,
  X,
  Search,
  Key,
} from 'lucide-react';
import { api } from './api';
import type { McpDirectoryItem, Dot } from '../shared/types';

interface McpDirectoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  dots?: Dot[];
  activeDotId?: string;
  onConnected?: () => void;
  onInstalled?: () => void;
}

export function McpDirectoryModal({
  isOpen,
  onClose,
  dots = [],
  activeDotId,
  onConnected,
}: McpDirectoryModalProps) {
  const [directory, setDirectory] = useState<McpDirectoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDotId, setSelectedDotId] = useState(activeDotId || dots[0]?.id || 'main');
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [tokenInputs, setTokenInputs] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState<{ [id: string]: { success: boolean; msg: string } }>({});
  const [searchQuery, setSearchQuery] = useState('');

  const loadDirectory = async () => {
    try {
      setLoading(true);
      const data = await api<McpDirectoryItem[]>('/mcp/directory');
      setDirectory(data);
    } catch (err) {
      console.error('Failed to load MCP directory:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadDirectory();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConnect = async (item: McpDirectoryItem) => {
    setConnectingId(item.id);
    setStatusMessage((prev) => ({ ...prev, [item.id]: { success: false, msg: 'Connecting...' } }));
    try {
      const token = tokenInputs[item.id]?.trim();
      await api(`/dots/${encodeURIComponent(selectedDotId)}/connections`, 'POST', {
        name: item.name,
        url: item.defaultUrl,
        ...(token ? { token } : {}),
      });

      setStatusMessage((prev) => ({
        ...prev,
        [item.id]: { success: true, msg: `Connected successfully to Dot "${selectedDotId}".` },
      }));
      onConnected?.();
    } catch (err) {
      setStatusMessage((prev) => ({
        ...prev,
        [item.id]: {
          success: false,
          msg: err instanceof Error ? err.message : 'Connection failed.',
        },
      }));
    } finally {
      setConnectingId(null);
    }
  };

  const filtered = directory.filter(
    (item) =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl max-w-3xl w-full p-6 shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 rounded-xl">
              <Plug className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                Model Context Protocol (MCP) Directory
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Connect verified external tool servers using standardized, least-privilege MCP protocols.
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

        {/* Search & Target Dot */}
        <div className="py-3 flex flex-col sm:flex-row gap-3 items-center justify-between border-b border-gray-100 dark:border-gray-800">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search MCP servers by name, tools, or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {dots.length > 0 && (
            <div className="flex items-center gap-2 text-xs shrink-0">
              <span className="text-gray-500 font-medium">Connect to Dot:</span>
              <select
                value={selectedDotId}
                onChange={(e) => setSelectedDotId(e.target.value)}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                {dots.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.id})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Directory Items List */}
        <div className="flex-1 overflow-y-auto py-3 space-y-3">
          {loading ? (
            <div className="text-center py-12 text-xs text-gray-400">Loading verified MCP catalog...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-xs text-gray-400">No matching MCP servers found.</div>
          ) : (
            filtered.map((item) => {
              const status = statusMessage[item.id];
              return (
                <div
                  key={item.id}
                  className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/60 shadow-sm flex flex-col gap-2.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                          {item.name}
                        </h3>
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                          {item.category}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {item.description}
                      </p>
                      <span className="text-[10px] text-gray-400 font-mono mt-0.5 block truncate max-w-md">
                        {item.defaultUrl}
                      </span>
                    </div>

                    <button
                      onClick={() => handleConnect(item)}
                      disabled={connectingId === item.id}
                      className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-sm disabled:opacity-50 transition shrink-0 flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {connectingId === item.id ? 'Connecting...' : 'Connect Server'}
                    </button>
                  </div>

                  {/* Token input if required */}
                  {item.requiresToken && (
                    <div className="flex items-center gap-2 pt-1">
                      <Key className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <input
                        type="password"
                        placeholder={item.tokenPlaceholder || 'Enter API token / secret key...'}
                        value={tokenInputs[item.id] || ''}
                        onChange={(e) =>
                          setTokenInputs((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                        className="text-xs px-2.5 py-1 rounded border border-gray-200 dark:border-gray-700 bg-transparent text-gray-900 dark:text-gray-100 flex-1 max-w-sm"
                      />
                    </div>
                  )}

                  {/* Discovered Tools */}
                  <div className="pt-2 border-t border-gray-100 dark:border-gray-800 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mr-1">
                      Discovered Tools:
                    </span>
                    {item.availableTools.map((t, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-100 dark:border-gray-700 flex items-center gap-1"
                      >
                        {t.name}
                        {t.readOnly ? (
                          <span className="text-[9px] text-emerald-600 font-sans">(read)</span>
                        ) : (
                          <span className="text-[9px] text-amber-600 font-sans">(approval)</span>
                        )}
                      </span>
                    ))}
                  </div>

                  {/* Connection result feedback */}
                  {status && (
                    <div
                      className={`text-[11px] p-2 rounded flex items-center gap-1.5 ${
                        status.success
                          ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
                      }`}
                    >
                      {status.success ? (
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span>{status.msg}</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
