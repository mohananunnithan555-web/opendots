import { useState } from 'react';
import {
  X,
  Globe,
  Puzzle,
  Copy,
  Check,
  ExternalLink,
  ShieldAlert,
  ArrowRight,
  BookOpen,
} from 'lucide-react';

interface BrowserTabsModalProps {
  open: boolean;
  onClose: () => void;
  onAddTabUrl: (url: string) => void;
}

export function BrowserTabsModal({ open, onClose, onAddTabUrl }: BrowserTabsModalProps) {
  const [tabUrl, setTabUrl] = useState('');
  const [copiedManifest, setCopiedManifest] = useState(false);
  const [activeView, setActiveView] = useState<'quick' | 'guide'>('quick');

  if (!open) return null;

  const handleAddUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tabUrl.trim()) return;
    onAddTabUrl(tabUrl.trim());
    setTabUrl('');
    onClose();
  };

  const manifestCode = `{
  "manifest_version": 3,
  "name": "OpenDots Browser Companion",
  "version": "1.0.0",
  "description": "Send active browser tab URLs and page context directly into OpenDots workspace.",
  "permissions": ["activeTab", "scripting"],
  "action": {
    "default_title": "Send Tab to OpenDots"
  },
  "background": {
    "service_worker": "background.js"
  }
}`;

  const handleCopyManifest = () => {
    navigator.clipboard.writeText(manifestCode);
    setCopiedManifest(true);
    setTimeout(() => setCopiedManifest(false), 2000);
  };

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
          maxWidth: '680px',
          maxHeight: '85vh',
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
            <Globe size={18} style={{ color: '#818cf8' }} />
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#f8fafc' }}>
              Add Browser Tabs
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

        {/* Tab switchers */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid #252b38',
            background: '#121622',
            padding: '0 20px',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveView('quick')}
            style={{
              padding: '12px 16px',
              border: 'none',
              borderBottom: activeView === 'quick' ? '2px solid #6366f1' : '2px solid transparent',
              background: 'transparent',
              color: activeView === 'quick' ? '#f8fafc' : '#94a3b8',
              fontSize: '0.85rem',
              fontWeight: activeView === 'quick' ? 600 : 500,
              cursor: 'pointer',
            }}
          >
            Quick Tab URL (Instant)
          </button>
          <button
            type="button"
            onClick={() => setActiveView('guide')}
            style={{
              padding: '12px 16px',
              border: 'none',
              borderBottom: activeView === 'guide' ? '2px solid #6366f1' : '2px solid transparent',
              background: 'transparent',
              color: activeView === 'guide' ? '#f8fafc' : '#94a3b8',
              fontSize: '0.85rem',
              fontWeight: activeView === 'guide' ? 600 : 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Puzzle size={14} /> Chrome Extension Guide
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            padding: '20px',
            overflowY: 'auto',
            backgroundColor: '#090b10',
            flex: 1,
          }}
        >
          {activeView === 'quick' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                style={{
                  background: '#141925',
                  border: '1px solid #252b38',
                  borderRadius: 12,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Globe size={16} style={{ color: '#38bdf8' }} />
                  <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#f8fafc' }}>
                    Share Active Web Page with Dot
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.5 }}>
                  Paste the URL of any browser tab you are researching. OpenDots will inspect and extract
                  the live page content using the built-in ₹0 Web Reader engine.
                </p>

                <form onSubmit={handleAddUrl} style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <input
                    type="url"
                    placeholder="https://example.com/article-or-documentation"
                    value={tabUrl}
                    onChange={(e) => setTabUrl(e.target.value)}
                    required
                    style={{
                      flex: 1,
                      background: '#090b10',
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
                    style={{
                      background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                      border: 'none',
                      borderRadius: 8,
                      padding: '10px 16px',
                      color: '#ffffff',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
                    }}
                  >
                    Add Tab <ArrowRight size={15} />
                  </button>
                </form>
              </div>

              <div
                style={{
                  background: 'rgba(99, 102, 241, 0.08)',
                  border: '1px solid rgba(99, 102, 241, 0.25)',
                  borderRadius: 12,
                  padding: 14,
                  display: 'flex',
                  gap: 12,
                }}
              >
                <BookOpen size={18} style={{ color: '#818cf8', flexShrink: 0, marginTop: 2 }} />
                <div style={{ fontSize: '0.78rem', color: '#cbd5e1', lineHeight: 1.5 }}>
                  <strong>How it works:</strong> When you add a tab URL, Dot reads and cites the source
                  in conversation. To enable automatic one-click tab syncing directly from your browser toolbar,
                  view the companion Chrome Extension guide.
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                style={{
                  background: 'rgba(234, 179, 8, 0.08)',
                  border: '1px solid rgba(234, 179, 8, 0.25)',
                  borderRadius: 12,
                  padding: 14,
                  display: 'flex',
                  gap: 12,
                }}
              >
                <ShieldAlert size={18} style={{ color: '#facc15', flexShrink: 0, marginTop: 2 }} />
                <div style={{ fontSize: '0.78rem', color: '#fef08a', lineHeight: 1.5 }}>
                  <strong>Browser Sandbox Security Boundary:</strong> Standard web browsers do not permit any
                  website (including ChatGPT or OpenDots) from reading your other open tabs or private windows
                  without an explicit companion extension installed by the user.
                </div>
              </div>

              <div
                style={{
                  background: '#141925',
                  border: '1px solid #252b38',
                  borderRadius: 12,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc' }}>
                  Step-by-step Installation (Chrome / Edge / Brave):
                </span>
                <ol
                  style={{
                    margin: 0,
                    paddingLeft: 20,
                    fontSize: '0.8rem',
                    color: '#94a3b8',
                    lineHeight: 1.7,
                  }}
                >
                  <li>Create a local folder named <code style={{ color: '#818cf8' }}>opendots-extension</code>.</li>
                  <li>Save the Manifest V3 file below as <code style={{ color: '#818cf8' }}>manifest.json</code>.</li>
                  <li>Open <code style={{ color: '#e2e8f0' }}>chrome://extensions</code> in your browser.</li>
                  <li>Toggle <strong>Developer mode</strong> in the top-right corner.</li>
                  <li>Click <strong>Load unpacked</strong> and select the folder.</li>
                </ol>

                <div style={{ position: 'relative', marginTop: 6 }}>
                  <pre
                    style={{
                      background: '#090b10',
                      border: '1px solid #252b38',
                      borderRadius: 8,
                      padding: '12px 14px',
                      fontSize: '0.75rem',
                      color: '#a5b4fc',
                      overflowX: 'auto',
                      margin: 0,
                      fontFamily: 'monospace',
                    }}
                  >
                    {manifestCode}
                  </pre>
                  <button
                    type="button"
                    onClick={handleCopyManifest}
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      background: '#1a2030',
                      border: '1px solid #252b38',
                      borderRadius: 6,
                      padding: '4px 8px',
                      color: '#e2e8f0',
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {copiedManifest ? <Check size={12} style={{ color: '#34d399' }} /> : <Copy size={12} />}
                    {copiedManifest ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
