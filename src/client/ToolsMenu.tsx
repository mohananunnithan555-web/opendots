import { useEffect, useRef, useState } from 'react';
import {
  Plus,
  FilePlus,
  HardDrive,
  Image as ImageIcon,
  Globe,
  Search,
  BookOpen,
  Pen,
  Brain,
  Cpu,
  Layers,
  Check,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { GitHubIcon } from './GitHubIcon';
import type { UploadedAttachment } from './SketchModal';

interface ToolsMenuProps {
  open: boolean;
  onClose: () => void;
  onUploadFile: (file: File) => void;
  onOpenLibrary: () => void;
  onOpenImageStudio: () => void;
  onOpenBrowserTabs: () => void;
  onToggleWebSearch: () => void;
  isWebSearchActive: boolean;
  onToggleDeepResearch: () => void;
  isDeepResearchActive: boolean;
  onOpenSketch: () => void;
  onToggleThinkingMode: () => void;
  isThinkingModeActive: boolean;
  onOpenGitHub: () => void;
  isGitHubConnected: boolean;
  onOpenOpenAI: () => void;
  isOpenAiConfigured: boolean;
  onOpenConnectorsHub: () => void;
}

export function ToolsMenu({
  open,
  onClose,
  onUploadFile,
  onOpenLibrary,
  onOpenImageStudio,
  onOpenBrowserTabs,
  onToggleWebSearch,
  isWebSearchActive,
  onToggleDeepResearch,
  isDeepResearchActive,
  onOpenSketch,
  onToggleThinkingMode,
  isThinkingModeActive,
  onOpenGitHub,
  isGitHubConnected,
  onOpenOpenAI,
  isOpenAiConfigured,
  onOpenConnectorsHub,
}: ToolsMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, onClose]);

  if (!open) return null;

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      onUploadFile(files[0]);
      onClose();
    }
    // Reset file input value so same file can be selected again
    e.target.value = '';
  };

  return (
    <div
      ref={menuRef}
      className="tools-composer-popover"
      style={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        marginBottom: '10px',
        width: '320px',
        background: '#141925',
        border: '1px solid #252b38',
        borderRadius: '16px',
        boxShadow: '0 20px 30px -10px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        backdropFilter: 'blur(16px)',
        zIndex: 50,
        overflow: 'hidden',
        animation: 'fadeInSlideUp 0.15s ease-out',
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
        accept="image/*,.pdf,.doc,.docx,.txt,.md,.rtf,.csv,.tsv,.json,.ts,.tsx,.js,.jsx,.py,.html,.css,.yaml,.yml"
      />

      {/* Header */}
      <div
        style={{
          padding: '12px 16px 8px 16px',
          borderBottom: '1px solid #1f2533',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontSize: '0.72rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: '#818cf8',
          }}
        >
          Tools & Integrations
        </span>
        <span
          style={{
            fontSize: '0.68rem',
            color: '#64748b',
            background: '#1a2030',
            padding: '1px 6px',
            borderRadius: 10,
          }}
        >
          ₹0 Free
        </span>
      </div>

      <div style={{ maxHeight: '380px', overflowY: 'auto', padding: '6px' }}>
        {/* SECTION 1: Files & Content */}
        <div style={{ padding: '4px 8px', fontSize: '0.68rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
          File & Content Tools
        </div>

        <button
          type="button"
          onClick={() => {
            fileInputRef.current?.click();
          }}
          className="tools-menu-item"
          style={menuItemStyle}
        >
          <div style={iconBoxStyle('#818cf8')}>
            <FilePlus size={16} />
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={titleStyle}>Add photos & files</div>
            <div style={descStyle}>Upload images, documents, PDF, or code</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenLibrary();
          }}
          className="tools-menu-item"
          style={menuItemStyle}
        >
          <div style={iconBoxStyle('#38bdf8')}>
            <HardDrive size={16} />
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={titleStyle}>Add from library</div>
            <div style={descStyle}>Reuse past workspace uploads & sketches</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenImageStudio();
          }}
          className="tools-menu-item"
          style={menuItemStyle}
        >
          <div style={iconBoxStyle('#f472b6')}>
            <ImageIcon size={16} />
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={titleStyle}>Create image</div>
            <div style={descStyle}>AI Image Studio in 1080p & 4K</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenBrowserTabs();
          }}
          className="tools-menu-item"
          style={menuItemStyle}
        >
          <div style={iconBoxStyle('#34d399')}>
            <Globe size={16} />
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={titleStyle}>Add browser tabs</div>
            <div style={descStyle}>Companion extension & active URL sync</div>
          </div>
        </button>

        {/* SECTION 2: Research & Thinking */}
        <div style={{ padding: '8px 8px 4px 8px', fontSize: '0.68rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', borderTop: '1px solid #1f2533', marginTop: 4 }}>
          Research & Thinking
        </div>

        <button
          type="button"
          onClick={() => {
            onToggleWebSearch();
            onClose();
          }}
          className="tools-menu-item"
          style={menuItemStyle}
        >
          <div style={iconBoxStyle('#38bdf8')}>
            <Search size={16} />
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={titleStyle}>Web search</div>
            <div style={descStyle}>Search web for current sources & citations</div>
          </div>
          {isWebSearchActive && (
            <span style={activeBadgeStyle}>ON</span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            onToggleDeepResearch();
            onClose();
          }}
          className="tools-menu-item"
          style={menuItemStyle}
        >
          <div style={iconBoxStyle('#a78bfa')}>
            <BookOpen size={16} />
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={titleStyle}>Deep research</div>
            <div style={descStyle}>Multi-step deep investigation report</div>
          </div>
          {isDeepResearchActive && (
            <span style={activeBadgeStyle}>ON</span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenSketch();
          }}
          className="tools-menu-item"
          style={menuItemStyle}
        >
          <div style={iconBoxStyle('#fbbf24')}>
            <Pen size={16} />
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={titleStyle}>Sketch</div>
            <div style={descStyle}>Draw or annotate a canvas diagram</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            onToggleThinkingMode();
          }}
          className="tools-menu-item"
          style={menuItemStyle}
        >
          <div style={iconBoxStyle('#c084fc')}>
            <Brain size={16} />
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={titleStyle}>Thinking mode</div>
            <div style={descStyle}>Step-by-step reasoning scratchpad</div>
          </div>
          <span
            style={{
              fontSize: '0.68rem',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 10,
              background: isThinkingModeActive ? '#6366f1' : '#1e2638',
              color: isThinkingModeActive ? '#ffffff' : '#94a3b8',
              transition: 'all 0.15s ease',
            }}
          >
            {isThinkingModeActive ? 'ON' : 'OFF'}
          </span>
        </button>

        {/* SECTION 3: Integrations */}
        <div style={{ padding: '8px 8px 4px 8px', fontSize: '0.68rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', borderTop: '1px solid #1f2533', marginTop: 4 }}>
          Integrations
        </div>

        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenGitHub();
          }}
          className="tools-menu-item"
          style={menuItemStyle}
        >
          <div style={iconBoxStyle('#e2e8f0')}>
            <GitHubIcon size={16} color="#e2e8f0" />
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={titleStyle}>GitHub</div>
            <div style={descStyle}>Repo, PR & issue analysis</div>
          </div>
          <span
            style={{
              fontSize: '0.68rem',
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: 8,
              background: isGitHubConnected ? 'rgba(52, 211, 153, 0.15)' : '#1e2638',
              color: isGitHubConnected ? '#34d399' : '#94a3b8',
            }}
          >
            {isGitHubConnected ? 'Connected' : 'Setup'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenOpenAI();
          }}
          className="tools-menu-item"
          style={menuItemStyle}
        >
          <div style={iconBoxStyle('#10a37f')}>
            <Cpu size={16} />
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={titleStyle}>OpenAI Platform</div>
            <div style={descStyle}>Optional user-supplied API key</div>
          </div>
          <span
            style={{
              fontSize: '0.68rem',
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: 8,
              background: isOpenAiConfigured ? 'rgba(16, 163, 127, 0.15)' : '#1e2638',
              color: isOpenAiConfigured ? '#10a37f' : '#94a3b8',
            }}
          >
            {isOpenAiConfigured ? 'Active' : 'Setup'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenConnectorsHub();
          }}
          className="tools-menu-item"
          style={menuItemStyle}
        >
          <div style={iconBoxStyle('#818cf8')}>
            <Layers size={16} />
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={titleStyle}>Integration directory</div>
            <div style={descStyle}>Browse all connected tools & services</div>
          </div>
          <ChevronRight size={14} style={{ color: '#64748b' }} />
        </button>
      </div>
    </div>
  );
}

// Sub-component styles
const menuItemStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 10px',
  borderRadius: 10,
  border: 'none',
  background: 'transparent',
  color: '#f8fafc',
  cursor: 'pointer',
  transition: 'background 0.12s ease',
  outline: 'none',
};

const iconBoxStyle = (color: string): React.CSSProperties => ({
  width: 28,
  height: 28,
  borderRadius: 8,
  background: `${color}18`,
  color: color,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
});

const titleStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  fontWeight: 600,
  color: '#f8fafc',
  lineHeight: 1.2,
};

const descStyle: React.CSSProperties = {
  fontSize: '0.68rem',
  color: '#94a3b8',
  lineHeight: 1.2,
  marginTop: 2,
};

const activeBadgeStyle: React.CSSProperties = {
  fontSize: '0.68rem',
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: 10,
  background: '#6366f1',
  color: '#ffffff',
};
