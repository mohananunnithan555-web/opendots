import { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Key,
  Shield,
  Loader2,
  Cpu,
} from 'lucide-react';
import { api } from './api';
import type { Connector } from '../shared/types';

interface OpenAiModalProps {
  open: boolean;
  onClose: () => void;
  onStatusChange?: () => void;
}

export function OpenAiModal({ open, onClose, onStatusChange }: OpenAiModalProps) {
  const [connector, setConnector] = useState<Connector | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const loadStatus = async () => {
    try {
      setLoading(true);
      const data = await api<Connector>('/api/connectors/openai');
      setConnector(data);
    } catch (err) {
      console.warn('Could not load openai connector:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadStatus();
      setTestResult(null);
      setKeyInput('');
    }
  }, [open]);

  if (!open) return null;

  const handleSaveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyInput.trim()) return;

    try {
      setSaving(true);
      await api('/api/connectors/openai', 'PUT', {
        status: 'connected',
        config: { apiKey: keyInput.trim() },
        error: undefined,
      });
      setKeyInput('');
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
      const res = await api<{ success: boolean; message: string }>('/api/connectors/openai/test', 'POST');
      setTestResult(res);
      await loadStatus();
      onStatusChange?.();
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Key validation test failed',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect OpenAI API Key?')) return;
    try {
      setSaving(true);
      await api('/api/connectors/openai/disconnect', 'POST');
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
            <Cpu size={20} style={{ color: '#10a37f' }} />
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#f8fafc' }}>
              OpenAI Platform Configuration
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
                <CheckCircle2 size={18} style={{ color: '#10a37f' }} />
              ) : (
                <AlertCircle size={18} style={{ color: '#94a3b8' }} />
              )}
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc' }}>
                  {isConnected ? 'OpenAI Key Configured' : 'No API Key Configured'}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  {isConnected
                    ? 'Custom model inference available via user-supplied API key'
                    : 'Optional: add your OpenAI key to enable GPT models alongside Gemini'}
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
                  {testing ? 'Testing...' : 'Test Key'}
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
                  Remove Key
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
                background: testResult.success ? 'rgba(16, 163, 127, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                border: `1px solid ${testResult.success ? 'rgba(16, 163, 127, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
                color: testResult.success ? '#10a37f' : '#f87171',
              }}
            >
              {testResult.message}
            </div>
          )}

          {/* Key entry form */}
          <form onSubmit={handleSaveKey} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Key size={14} style={{ color: '#10a37f' }} />
              {isConnected ? 'Replace OpenAI API Key' : 'OpenAI API Key'}
            </label>
            <input
              type="password"
              placeholder="sk-proj-xxxxxxxxxxxxxxxxxxxxxxxx"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
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
              disabled={saving || !keyInput.trim()}
              style={{
                background: 'linear-gradient(135deg, #10a37f 0%, #059669 100%)',
                border: 'none',
                borderRadius: 8,
                padding: '10px 16px',
                color: '#ffffff',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: keyInput.trim() ? 'pointer' : 'not-allowed',
                opacity: keyInput.trim() ? 1 : 0.6,
                marginTop: 4,
                boxShadow: '0 4px 12px rgba(16, 163, 127, 0.3)',
              }}
            >
              {saving ? 'Saving...' : isConnected ? 'Update Key' : 'Save OpenAI Key'}
            </button>
          </form>

          {/* Privacy info */}
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
            <Shield size={16} style={{ color: '#10a37f', flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>₹0 Budget Default:</strong> OpenDots works completely free out-of-the-box using Google Gemini.
              Configuring an OpenAI key is entirely optional. Your key is never logged or leaked to clients.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
