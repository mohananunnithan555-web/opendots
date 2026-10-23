import { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  AlertCircle,
  Key,
  Shield,
  Loader2,
  ExternalLink,
  GitBranch,
} from 'lucide-react';
import { GitHubIcon } from './GitHubIcon';
import { api } from './api';
import type { Connector } from '../shared/types';

interface GitHubConnectModalProps {
  open: boolean;
  onClose: () => void;
  onStatusChange?: () => void;
}

export function GitHubConnectModal({ open, onClose, onStatusChange }: GitHubConnectModalProps) {
  const [connector, setConnector] = useState<Connector | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const loadStatus = async () => {
    try {
      setLoading(true);
      const data = await api<Connector>('/api/connectors/github');
      setConnector(data);
    } catch (err) {
      console.warn('Could not load github connector:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadStatus();
      setTestResult(null);
      setTokenInput('');
    }
  }, [open]);

  if (!open) return null;

  const handleSaveToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;

    try {
      setSaving(true);
      await api('/api/connectors/github', 'PUT', {
        status: 'connected',
        config: { apiKey: tokenInput.trim() },
        error: undefined,
      });
      setTokenInput('');
      await loadStatus();
      onStatusChange?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    try {
      setTesting(true);
      setTestResult(null);
      const res = await api<{ success: boolean; message: string }>('/api/connectors/github/test', 'POST');
      setTestResult(res);
      await loadStatus();
      onStatusChange?.();
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Connection test failed',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect GitHub integration?')) return;
    try {
      setSaving(true);
      await api('/api/connectors/github/disconnect', 'POST');
      await loadStatus();
      setTestResult(null);
      onStatusChange?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Disconnect failed');
    } finally {
      setSaving(false);
    }
  };

  const isConnected = connector?.status === 'connected';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 7, 12, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          background: '#141925',
          border: '1px solid #252b38',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid #252b38',
            background: '#0e121a',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <GitHubIcon size={20} color="#ffffff" />
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#f8fafc' }}>
              GitHub Integration
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px', backgroundColor: '#090b10', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Status Box */}
          <div
            style={{
              background: '#141925',
              border: '1px solid #252b38',
              borderRadius: 12,
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {isConnected ? (
                <CheckCircle2 size={18} style={{ color: '#34d399' }} />
              ) : (
                <AlertCircle size={18} style={{ color: '#94a3b8' }} />
              )}
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc' }}>
                  {isConnected ? 'GitHub Connected' : 'Not Connected'}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  {isConnected
                    ? 'Authorized for repository, PR, and issue analysis'
                    : 'Add a personal access token to authorize code workflows'}
                </div>
              </div>
            </div>

            {isConnected && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={testing}
                  style={{
                    background: '#1a2030',
                    border: '1px solid #252b38',
                    borderRadius: 6,
                    padding: '4px 10px',
                    color: '#e2e8f0',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                  }}
                >
                  {testing ? 'Testing...' : 'Test'}
                </button>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={saving}
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    borderRadius: 6,
                    padding: '4px 10px',
                    color: '#f87171',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                  }}
                >
                  Disconnect
                </button>
              </div>
            )}
          </div>

          {testResult && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                fontSize: '0.75rem',
                background: testResult.success ? 'rgba(52, 211, 153, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                border: `1px solid ${testResult.success ? 'rgba(52, 211, 153, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
                color: testResult.success ? '#34d399' : '#f87171',
              }}
            >
              {testResult.message}
            </div>
          )}

          {/* Token entry form */}
          <form onSubmit={handleSaveToken} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Key size={14} style={{ color: '#818cf8' }} />
              {isConnected ? 'Update Personal Access Token' : 'Personal Access Token (PAT)'}
            </label>
            <input
              type="password"
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              style={{
                background: '#141925',
                border: '1px solid #252b38',
                borderRadius: 8,
                padding: '10px 14px',
                color: '#f8fafc',
                fontSize: '0.85rem',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={saving || !tokenInput.trim()}
              style={{
                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                border: 'none',
                borderRadius: 8,
                padding: '10px 16px',
                color: '#ffffff',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: tokenInput.trim() ? 'pointer' : 'not-allowed',
                opacity: tokenInput.trim() ? 1 : 0.6,
                marginTop: 4,
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
              }}
            >
              {saving ? 'Saving...' : isConnected ? 'Update Token' : 'Connect GitHub'}
            </button>
          </form>

          {/* Privacy & scopes info */}
          <div
            style={{
              background: '#141925',
              border: '1px solid #252b38',
              borderRadius: 10,
              padding: 12,
              display: 'flex',
              gap: 10,
              fontSize: '0.73rem',
              color: '#94a3b8',
              lineHeight: 1.5,
            }}
          >
            <Shield size={16} style={{ color: '#818cf8', flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>Zero-Exposure Security:</strong> Your token is stored server-side in encrypted form.
              Recommended minimal scopes: <code style={{ color: '#818cf8' }}>repo</code> (full repository access)
              or <code style={{ color: '#818cf8' }}>read:user</code> for public repository inspection only.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
