import { useState, useEffect } from 'react';
import {
  Briefcase,
  FileText,
  Copy,
  Download,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Upload,
  Layers,
  FileSpreadsheet,
  Presentation,
  ShieldCheck,
  FileDiff,
  BookOpen,
  Mail,
  Code,
  Search,
  Check,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { api } from './api';
import type { Space, WorkspaceState } from '../shared/types';

export interface CoworkTemplate {
  id: string;
  title: string;
  description: string;
  category: 'research' | 'documents' | 'analysis' | 'presentation' | 'code' | 'operations';
  steps: Array<{
    title: string;
    description: string;
    tool?: string;
    assignedSpecialist?: string;
    validationCriteria?: string[];
  }>;
}

export interface WorkspaceFileInfo {
  path: string;
  size: number;
  updatedAt: number;
  category: 'source' | 'intermediate' | 'deliverable' | 'archive' | 'general';
  version: number;
  lastModifiedBy?: string;
}

export interface CoworkTaskPlan {
  id: string;
  goal: string;
  status: 'pending' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled' | 'paused';
  currentStepIndex: number;
  spaceId?: string;
  steps: Array<{
    id: string;
    title: string;
    description: string;
    status: 'pending' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled' | 'skipped';
    tool?: string;
    assignedSpecialist?: string;
    validationCriteria?: string[];
    deliverablePath?: string;
    output?: unknown;
    error?: string;
  }>;
  finalResult?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

interface CoworkProjectWorkspaceProps {
  spaces: Space[];
  activeSpaceId?: string;
  onSelectSpace?: (spaceId: string) => void;
  onRefreshWorkspace?: () => void;
}

export function CoworkProjectWorkspace({
  spaces,
  activeSpaceId,
  onSelectSpace,
  onRefreshWorkspace,
}: CoworkProjectWorkspaceProps) {
  const [selectedSpaceId, setSelectedSpaceId] = useState<string>(
    activeSpaceId || (spaces.length > 0 ? spaces[0].id : '')
  );
  const [activeTab, setActiveTab] = useState<'workflows' | 'files' | 'execution' | 'grok-hub'>('workflows');
  const [templates, setTemplates] = useState<CoworkTemplate[]>([]);
  const [files, setFiles] = useState<WorkspaceFileInfo[]>([]);
  const [plans, setPlans] = useState<CoworkTaskPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Grok Hub States
  const [redditTopic, setRedditTopic] = useState('technology');
  const [redditQuery, setRedditQuery] = useState('');
  const [redditData, setRedditData] = useState<any | null>(null);
  const [redditBusy, setRedditBusy] = useState(false);

  const [ytInput, setYtInput] = useState('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  const [ytData, setYtData] = useState<any | null>(null);
  const [ytBusy, setYtBusy] = useState(false);

  const [codeReviewInput, setCodeReviewInput] = useState(
    '// Sample function to review\nfunction computeStats(items) {\n  if (!items || items.length === 0) return null;\n  const sum = items.reduce((a, b) => a + b, 0);\n  return { sum, avg: sum / items.length };\n}'
  );
  const [codeReviewData, setCodeReviewData] = useState<any | null>(null);
  const [codeReviewBusy, setCodeReviewBusy] = useState(false);
  const [generatedTestCode, setGeneratedTestCode] = useState<string | null>(null);

  const [codeSymbolQuery, setCodeSymbolQuery] = useState('');
  const [symbolData, setSymbolData] = useState<any | null>(null);
  const [symbolBusy, setSymbolBusy] = useState(false);

  // File Upload / Create Modal State
  const [showFileModal, setShowFileModal] = useState(false);
  const [newFilePath, setNewFilePath] = useState('');
  const [newFileContent, setNewFileContent] = useState('');
  const [newFileCategory, setNewFileCategory] = useState<'source' | 'intermediate' | 'deliverable' | 'archive' | 'general'>('source');
  const [newFileComment, setNewFileComment] = useState('Initial draft');

  // File Diff Modal State
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [diffData, setDiffData] = useState<{
    file: string;
    v1: number;
    v2: number;
    diff: string;
    changes: { added: number; removed: number };
  } | null>(null);

  // Template Run Modal State
  const [instantiatingTemplate, setInstantiatingTemplate] = useState<CoworkTemplate | null>(null);
  const [customGoal, setCustomGoal] = useState('');

  // Replan Modal State
  const [replanningStepId, setReplanningStepId] = useState<string | null>(null);
  const [replanReason, setReplanReason] = useState('');

  // Synchronize space selection
  useEffect(() => {
    if (activeSpaceId) {
      setSelectedSpaceId(activeSpaceId);
    } else if (spaces.length > 0 && !selectedSpaceId) {
      setSelectedSpaceId(spaces[0].id);
    }
  }, [activeSpaceId, spaces]);

  // Load Templates
  useEffect(() => {
    api<CoworkTemplate[]>('/planner/templates')
      .then(setTemplates)
      .catch((err) => console.warn('Could not load templates', err));
  }, []);

  // Load Files and Plans for selected Space
  const loadSpaceData = async (spaceId: string) => {
    if (!spaceId) return;
    setLoading(true);
    setError(null);
    try {
      const [filesRes, plansRes] = await Promise.all([
        api<{ files: WorkspaceFileInfo[] }>(`/projects/${spaceId}/files`).catch(() => ({ files: [] })),
        api<CoworkTaskPlan[]>('/plans').catch(() => []),
      ]);
      setFiles(filesRes.files || []);
      const spacePlans = (plansRes || []).filter((p) => !p.spaceId || p.spaceId === spaceId);
      setPlans(spacePlans);
      if (spacePlans.length > 0 && !selectedPlanId) {
        setSelectedPlanId(spacePlans[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading project data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSpaceId) {
      loadSpaceData(selectedSpaceId);
    }
  }, [selectedSpaceId]);

  const activeSpace = spaces.find((s) => s.id === selectedSpaceId);

  // Duplicate Space Handler
  const handleDuplicateSpace = async () => {
    if (!selectedSpaceId) return;
    try {
      const newName = prompt('Enter name for duplicate project:', `${activeSpace?.name || 'Project'} (Copy)`);
      if (!newName) return;
      const created = await api<Space>(`/spaces/${selectedSpaceId}/duplicate`, 'POST', { name: newName });
      setSuccessMsg(`Project duplicated successfully as "${created.name}"`);
      onRefreshWorkspace?.();
      setSelectedSpaceId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate project');
    }
  };

  // Export Space Deliverable Handler
  const handleExportDeliverable = async () => {
    if (!selectedSpaceId) return;
    try {
      const res = await api<{ markdown: string }>(`/spaces/${selectedSpaceId}/export`);
      const blob = new Blob([res.markdown], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeSpace?.name || 'project'}-deliverable.md`;
      a.click();
      URL.revokeObjectURL(url);
      setSuccessMsg('Project deliverable exported successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export deliverable');
    }
  };

  // Instantiate Cowork Template Handler
  const handleInstantiate = async (template: CoworkTemplate) => {
    try {
      const plan = await api<CoworkTaskPlan>(`/planner/templates/${template.id}/instantiate`, 'POST', {
        goal: customGoal.trim() || undefined,
        spaceId: selectedSpaceId || undefined,
      });
      setSuccessMsg(`Workflow "${template.title}" initiated!`);
      setInstantiatingTemplate(null);
      setCustomGoal('');
      await loadSpaceData(selectedSpaceId);
      setSelectedPlanId(plan.id);
      setActiveTab('execution');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to instantiate template');
    }
  };

  // Plan Pause / Resume Handler
  const handleTogglePause = async (plan: CoworkTaskPlan) => {
    try {
      const endpoint = plan.status === 'paused' ? `/plans/${plan.id}/resume` : `/plans/${plan.id}/pause`;
      await api(endpoint, 'POST');
      await loadSpaceData(selectedSpaceId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    }
  };

  // Execute Next Step Handler
  const handleExecuteStep = async (planId: string) => {
    try {
      await api(`/plans/${planId}/step`, 'POST');
      await loadSpaceData(selectedSpaceId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Step execution failed');
    }
  };

  // Replan Step Handler
  const handleReplanStep = async (planId: string, stepId: string) => {
    if (!replanReason.trim()) return;
    try {
      await api(`/plans/${planId}/steps/${stepId}/replan`, 'POST', {
        reason: replanReason.trim(),
      });
      setSuccessMsg('Step replanned successfully');
      setReplanningStepId(null);
      setReplanReason('');
      await loadSpaceData(selectedSpaceId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Replanning failed');
    }
  };

  // File Upload Handler
  const handleCreateFile = async () => {
    if (!newFilePath.trim() || !newFileContent) {
      setError('Path and content are required');
      return;
    }
    try {
      await api(`/projects/${selectedSpaceId}/files`, 'POST', {
        path: newFilePath.trim(),
        content: newFileContent,
        category: newFileCategory,
        comment: newFileComment.trim(),
      });
      setSuccessMsg(`File "${newFilePath}" saved`);
      setShowFileModal(false);
      setNewFilePath('');
      setNewFileContent('');
      await loadSpaceData(selectedSpaceId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save file');
    }
  };

  // View Diff Handler
  const handleViewDiff = async (file: WorkspaceFileInfo) => {
    try {
      const v2 = file.version;
      const v1 = Math.max(1, v2 - 1);
      const res = await api<{
        file: string;
        v1: number;
        v2: number;
        diff: string;
        changes: { added: number; removed: number };
      }>(`/files/diff?path=${encodeURIComponent(file.path)}&v1=${v1}&v2=${v2}&projectId=${selectedSpaceId}`);
      setDiffData(res);
      setShowDiffModal(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to compute diff');
    }
  };

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'research':
        return <Search size={18} />;
      case 'documents':
        return <FileText size={18} />;
      case 'analysis':
        return <FileSpreadsheet size={18} />;
      case 'presentation':
        return <Presentation size={18} />;
      case 'code':
        return <Code size={18} />;
      case 'operations':
        return <Briefcase size={18} />;
      default:
        return <Layers size={18} />;
    }
  };

  const handleQueryReddit = async () => {
    setRedditBusy(true);
    try {
      const q = encodeURIComponent(redditQuery.trim());
      const sub = encodeURIComponent(redditTopic);
      const res = await api<any>(`/social/reddit?query=${q}&subreddit=${sub}&limit=5`);
      setRedditData(res?.data || res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reddit query failed');
    } finally {
      setRedditBusy(false);
    }
  };

  const handleLookupYouTube = async () => {
    if (!ytInput.trim()) return;
    setYtBusy(true);
    try {
      const t = encodeURIComponent(ytInput.trim());
      const res = await api<any>(`/social/youtube?target=${t}&fetchTranscript=true`);
      setYtData(res?.data || res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'YouTube lookup failed');
    } finally {
      setYtBusy(false);
    }
  };

  const handleReviewCode = async () => {
    if (!codeReviewInput.trim()) return;
    setCodeReviewBusy(true);
    setGeneratedTestCode(null);
    try {
      const res = await api<any>('/code/review', 'POST', { code: codeReviewInput });
      setCodeReviewData(res?.data || res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Code review failed');
    } finally {
      setCodeReviewBusy(false);
    }
  };

  const handleGenerateTests = async () => {
    if (!codeReviewInput.trim()) return;
    setCodeReviewBusy(true);
    try {
      const res = await api<any>('/code/test-gen', 'POST', {
        code: codeReviewInput,
        framework: 'vitest',
      });
      const data = res?.data || res;
      setGeneratedTestCode(data.testCode || '');
      setSuccessMsg('Unit tests generated successfully!');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Test generation failed');
    } finally {
      setCodeReviewBusy(false);
    }
  };

  const handleSearchSymbols = async () => {
    setSymbolBusy(true);
    try {
      const res = await api<any>('/code/symbols', 'POST', { query: codeSymbolQuery.trim() });
      setSymbolData(res?.data || res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Symbol search failed');
    } finally {
      setSymbolBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%', maxWidth: 1200, margin: '0 auto', paddingBottom: 40 }}>
      {/* Header & Space Control Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: '18px 24px',
          background: 'var(--card-bg, #ffffff)',
          borderRadius: 12,
          border: '1px solid var(--border-color, #e5e7eb)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
            }}
          >
            <Briefcase size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Claude Cowork Workspace</h2>
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '2px 8px',
                  borderRadius: 9999,
                  background: '#e0e7ff',
                  color: '#4338ca',
                  fontWeight: 600,
                }}
              >
                Project Engine
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted, #6b7280)' }}>
              Project workspaces, office document generation, 12 Cowork templates & verified deliverables
            </p>
          </div>
        </div>

        {/* Space Picker & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <select
            value={selectedSpaceId}
            onChange={(e) => {
              setSelectedSpaceId(e.target.value);
              onSelectSpace?.(e.target.value);
            }}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--border-color, #d1d5db)',
              background: 'var(--input-bg, #fff)',
              fontSize: '0.9rem',
              fontWeight: 500,
            }}
          >
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <button
            className="button"
            onClick={handleDuplicateSpace}
            title="Duplicate this project workspace (Phase 2)"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
          >
            <Copy size={14} />
            Duplicate
          </button>

          <button
            className="button"
            onClick={handleExportDeliverable}
            title="Export full project deliverable as markdown (Phase 14)"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
          >
            <Download size={14} />
            Export Deliverable
          </button>
        </div>
      </div>

      {/* Notifications / Alerts */}
      {error && (
        <div
          style={{
            padding: '12px 16px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
          <button className="icon-button" onClick={() => setError(null)}>
            ✕
          </button>
        </div>
      )}

      {successMsg && (
        <div
          style={{
            padding: '12px 16px',
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            color: '#166534',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={18} />
            <span>{successMsg}</span>
          </div>
          <button className="icon-button" onClick={() => setSuccessMsg(null)}>
            ✕
          </button>
        </div>
      )}

      {/* Sub Tabs */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          borderBottom: '2px solid var(--border-color, #e5e7eb)',
          paddingBottom: 4,
        }}
      >
        <button
          className={activeTab === 'workflows' ? 'primary' : 'button'}
          onClick={() => setActiveTab('workflows')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          <Layers size={16} />
          12 Cowork Templates ({templates.length})
        </button>
        <button
          className={activeTab === 'files' ? 'primary' : 'button'}
          onClick={() => setActiveTab('files')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          <FileText size={16} />
          Project Files & Deliverables ({files.length})
        </button>
        <button
          className={activeTab === 'execution' ? 'primary' : 'button'}
          onClick={() => setActiveTab('execution')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          <Clock size={16} />
          Active Workflows ({plans.length})
        </button>
        <button
          className={activeTab === 'grok-hub' ? 'primary' : 'button'}
          onClick={() => setActiveTab('grok-hub')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          <Sparkles size={16} />
          Grok AI Hub (Free Tools)
        </button>
      </div>

      {/* TAB 1: 12 COWORK WORKFLOW TEMPLATES */}
      {activeTab === 'workflows' && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '1.1rem' }}>Claude Cowork Workflow Catalog</h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted, #6b7280)' }}>
              1-click autonomous workflows equipped with multi-step validation, specialist assignment, and office artifact generation.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 16,
            }}
          >
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                style={{
                  background: 'var(--card-bg, #ffffff)',
                  border: '1px solid var(--border-color, #e5e7eb)',
                  borderRadius: 10,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#4f46e5' }}>
                      {getCategoryIcon(tpl.category)}
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
                        {tpl.category}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        background: '#f3f4f6',
                        padding: '2px 8px',
                        borderRadius: 12,
                        color: '#4b5563',
                      }}
                    >
                      {tpl.steps.length} steps
                    </span>
                  </div>

                  <h4 style={{ margin: '0 0 6px 0', fontSize: '1rem', fontWeight: 600 }}>{tpl.title}</h4>
                  <p style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: 'var(--text-muted, #6b7280)', lineHeight: 1.4 }}>
                    {tpl.description}
                  </p>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                    {tpl.steps.map((st, i) => (
                      <span
                        key={i}
                        title={st.title}
                        style={{
                          fontSize: '0.7rem',
                          background: '#f9fafb',
                          border: '1px solid #e5e7eb',
                          padding: '2px 6px',
                          borderRadius: 4,
                          color: '#374151',
                        }}
                      >
                        {st.assignedSpecialist ? `${st.assignedSpecialist}: ` : ''}
                        {st.title.slice(0, 24)}...
                      </span>
                    ))}
                  </div>
                </div>

                <button
                  className="primary"
                  onClick={() => {
                    setInstantiatingTemplate(tpl);
                    setCustomGoal(tpl.description);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    fontSize: '0.85rem',
                    width: '100%',
                  }}
                >
                  <Play size={14} />
                  Launch in {activeSpace?.name || 'Project'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: PROJECT FILES & DELIVERABLES */}
      {activeTab === 'files' && (
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '1.1rem' }}>
                Files & Artifacts for {activeSpace?.name || 'Project'}
              </h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted, #6b7280)' }}>
                Isolated project file repository with version control, line diffs, and safe downloads.
              </p>
            </div>
            <button
              className="primary"
              onClick={() => setShowFileModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Upload size={14} />
              Add Project File
            </button>
          </div>

          {files.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '40px 20px',
                background: 'var(--card-bg, #fff)',
                borderRadius: 10,
                border: '1px solid var(--border-color, #e5e7eb)',
              }}
            >
              <FileText size={36} style={{ color: '#9ca3af', marginBottom: 12 }} />
              <h4 style={{ margin: '0 0 6px 0' }}>No files in this project workspace yet</h4>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted, #6b7280)' }}>
                Run an autonomous Cowork workflow or click "Add Project File" above.
              </p>
            </div>
          ) : (
            <div
              style={{
                background: 'var(--card-bg, #fff)',
                border: '1px solid var(--border-color, #e5e7eb)',
                borderRadius: 10,
                overflow: 'hidden',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ padding: '10px 14px', fontWeight: 600 }}>File Path</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600 }}>Category</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600 }}>Version</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600 }}>Size</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600 }}>Last Modified</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((file) => (
                    <tr key={file.path} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 500, fontFamily: 'monospace' }}>
                        {file.path}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            padding: '2px 8px',
                            borderRadius: 12,
                            fontWeight: 600,
                            background:
                              file.category === 'deliverable'
                                ? '#dcfce7'
                                : file.category === 'intermediate'
                                ? '#fef3c7'
                                : '#e0e7ff',
                            color:
                              file.category === 'deliverable'
                                ? '#166534'
                                : file.category === 'intermediate'
                                ? '#92400e'
                                : '#3730a3',
                          }}
                        >
                          {file.category}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>v{file.version}</td>
                      <td style={{ padding: '10px 14px' }}>{(file.size / 1024).toFixed(1)} KB</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted, #6b7280)' }}>
                        {new Date(file.updatedAt).toLocaleString()}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            className="button"
                            onClick={() => handleViewDiff(file)}
                            title="View line diff between versions"
                            style={{ padding: '4px 8px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          >
                            <FileDiff size={12} /> Diff
                          </button>
                          <a
                            href={`/api/files/download?path=${encodeURIComponent(file.path)}&projectId=${selectedSpaceId}`}
                            download
                            className="button"
                            style={{
                              padding: '4px 8px',
                              fontSize: '0.75rem',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              textDecoration: 'none',
                            }}
                          >
                            <Download size={12} /> Download
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: ACTIVE WORKFLOW EXECUTION */}
      {activeTab === 'execution' && (
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16 }}>
          {/* Plans List */}
          <div
            style={{
              background: 'var(--card-bg, #fff)',
              border: '1px solid var(--border-color, #e5e7eb)',
              borderRadius: 10,
              padding: 12,
              maxHeight: 600,
              overflowY: 'auto',
            }}
          >
            <h4 style={{ margin: '0 0 10px 0', fontSize: '0.95rem' }}>Project Workflows</h4>
            {plans.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: '#9ca3af' }}>No workflows active.</p>
            ) : (
              plans.map((p) => {
                const completedSteps = p.steps.filter((s) => s.status === 'completed').length;
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedPlanId(p.id)}
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      marginBottom: 8,
                      cursor: 'pointer',
                      border: p.id === selectedPlanId ? '2px solid #4f46e5' : '1px solid #e5e7eb',
                      background: p.id === selectedPlanId ? '#f5f3ff' : '#fff',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          padding: '1px 6px',
                          borderRadius: 9999,
                          fontWeight: 600,
                          background:
                            p.status === 'completed'
                              ? '#dcfce7'
                              : p.status === 'paused'
                              ? '#fef3c7'
                              : p.status === 'running'
                              ? '#dbeafe'
                              : '#f3f4f6',
                          color:
                            p.status === 'completed'
                              ? '#166534'
                              : p.status === 'paused'
                              ? '#92400e'
                              : p.status === 'running'
                              ? '#1e40af'
                              : '#374151',
                        }}
                      >
                        {p.status}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        {completedSteps}/{p.steps.length}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 500, lineHeight: 1.3 }}>
                      {p.goal.slice(0, 50)}...
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Selected Plan Details & Steps */}
          {selectedPlan ? (
            <div
              style={{
                background: 'var(--card-bg, #fff)',
                border: '1px solid var(--border-color, #e5e7eb)',
                borderRadius: 10,
                padding: 20,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 16,
                  borderBottom: '1px solid #e5e7eb',
                  paddingBottom: 12,
                }}
              >
                <div>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '1.15rem' }}>{selectedPlan.goal}</h3>
                  <div style={{ display: 'flex', gap: 12, fontSize: '0.8rem', color: '#6b7280' }}>
                    <span>Status: <strong>{selectedPlan.status}</strong></span>
                    <span>Created: {new Date(selectedPlan.createdAt).toLocaleTimeString()}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  {selectedPlan.status !== 'completed' && selectedPlan.status !== 'cancelled' && (
                    <>
                      <button
                        className="button"
                        onClick={() => handleTogglePause(selectedPlan)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        {selectedPlan.status === 'paused' ? <Play size={14} /> : <Pause size={14} />}
                        {selectedPlan.status === 'paused' ? 'Resume' : 'Pause'}
                      </button>
                      <button
                        className="primary"
                        onClick={() => handleExecuteStep(selectedPlan.id)}
                        disabled={selectedPlan.status === 'paused'}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <Play size={14} />
                        Run Next Step
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Steps Progress */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {selectedPlan.steps.map((st, idx) => (
                  <div
                    key={st.id}
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: 8,
                      padding: 12,
                      background:
                        st.status === 'completed'
                          ? '#f0fdf4'
                          : st.status === 'running'
                          ? '#eff6ff'
                          : st.status === 'waiting_approval'
                          ? '#fffbeb'
                          : '#fff',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: '50%',
                            background: st.status === 'completed' ? '#166534' : '#6b7280',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                          }}
                        >
                          {idx + 1}
                        </span>
                        <strong style={{ fontSize: '0.9rem' }}>{st.title}</strong>
                        {st.assignedSpecialist && (
                          <span
                            style={{
                              fontSize: '0.75rem',
                              background: '#e0e7ff',
                              color: '#3730a3',
                              padding: '2px 6px',
                              borderRadius: 4,
                            }}
                          >
                            {st.assignedSpecialist}
                          </span>
                        )}
                        {st.tool && (
                          <span
                            style={{
                              fontSize: '0.75rem',
                              background: '#f3f4f6',
                              color: '#4b5563',
                              padding: '2px 6px',
                              borderRadius: 4,
                              fontFamily: 'monospace',
                            }}
                          >
                            tool: {st.tool}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color:
                              st.status === 'completed'
                                ? '#166534'
                                : st.status === 'waiting_approval'
                                ? '#b45309'
                                : st.status === 'running'
                                ? '#1d4ed8'
                                : '#6b7280',
                          }}
                        >
                          {st.status}
                        </span>
                        {st.status !== 'completed' && (
                          <button
                            className="button"
                            onClick={() => {
                              setReplanningStepId(st.id);
                              setReplanReason('');
                            }}
                            style={{ padding: '2px 6px', fontSize: '0.75rem' }}
                          >
                            Replan
                          </button>
                        )}
                      </div>
                    </div>

                    <p style={{ margin: '0 0 6px 0', fontSize: '0.85rem', color: '#4b5563' }}>
                      {st.description}
                    </p>

                    {/* Deliverable Path */}
                    {st.deliverablePath && (
                      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: '#166534' }}>
                        <CheckCircle2 size={14} />
                        <span>Deliverable saved: <strong>{st.deliverablePath}</strong></span>
                        <a
                          href={`/api/files/download?path=${encodeURIComponent(st.deliverablePath)}&projectId=${selectedSpaceId}`}
                          download
                          style={{ color: '#4f46e5', textDecoration: 'underline', marginLeft: 8 }}
                        >
                          Download
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
              Select a workflow from the list to view its execution details.
            </div>
          )}
        </div>
      )}

      {/* TAB 4: GROK AI HUB (FREE RESEARCH & CODING SUITE) */}
      {activeTab === 'grok-hub' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Zero-Cost Banner */}
          <div
            style={{
              padding: '16px 20px',
              background: '#ecfdf5',
              border: '1px solid #a7f3d0',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  background: '#10b981',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ShieldCheck size={24} />
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '1rem', color: '#065f46' }}>
                  Free-Only Mode Active (Strict ₹0 / $0 Cost Policy)
                </h4>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.85rem', color: '#047857' }}>
                  Zero paid APIs • Zero credit billing • Permitted public endpoints (Reddit JSON, YouTube oEmbed, Static Analysis)
                </p>
              </div>
            </div>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                background: '#047857',
                color: '#fff',
                padding: '4px 10px',
                borderRadius: 20,
              }}
            >
              Cost: ₹0.00 Guaranteed
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: 20 }}>
            {/* Tool 1: Reddit Public Research */}
            <div
              style={{
                background: 'var(--card-bg, #fff)',
                border: '1px solid var(--border-color, #e5e7eb)',
                borderRadius: 12,
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Search size={20} style={{ color: '#ff4500' }} />
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.98rem' }}>Reddit Public Research</h4>
                  <small style={{ color: 'var(--text-muted, #6b7280)' }}>
                    Permitted public Reddit JSON endpoint with real citations and scores
                  </small>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  value={redditTopic}
                  onChange={(e) => setRedditTopic(e.target.value)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1px solid #d1d5db',
                    fontSize: '0.85rem',
                  }}
                >
                  <option value="technology">r/technology</option>
                  <option value="artificial">r/artificial</option>
                  <option value="programming">r/programming</option>
                  <option value="webdev">r/webdev</option>
                  <option value="news">r/news</option>
                </select>
                <input
                  type="text"
                  placeholder="Keyword filter (optional)..."
                  value={redditQuery}
                  onChange={(e) => setRedditQuery(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid #d1d5db',
                    fontSize: '0.85rem',
                  }}
                />
                <button className="primary" onClick={handleQueryReddit} disabled={redditBusy}>
                  {redditBusy ? 'Searching...' : 'Explore Reddit'}
                </button>
              </div>

              {redditData?.posts && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                  {redditData.posts.map((p: any, idx: number) => (
                    <div
                      key={idx}
                      style={{
                        padding: 10,
                        borderRadius: 8,
                        background: '#f9fafb',
                        border: '1px solid #f3f4f6',
                        fontSize: '0.85rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, color: '#374151' }}>{p.subreddit}</span>
                        <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>★ {p.score} upvotes</span>
                      </div>
                      <a
                        href={p.permalink || p.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontWeight: 500, color: '#2563eb', textDecoration: 'none' }}
                      >
                        {p.title} <ExternalLink size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />
                      </a>
                      {p.previewText && (
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#6b7280' }}>
                          {p.previewText.slice(0, 140)}...
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tool 2: YouTube Video & Transcript Inspector */}
            <div
              style={{
                background: 'var(--card-bg, #fff)',
                border: '1px solid var(--border-color, #e5e7eb)',
                borderRadius: 12,
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Play size={20} style={{ color: '#dc2626' }} />
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.98rem' }}>YouTube Public Video & Transcript Inspector</h4>
                  <small style={{ color: 'var(--text-muted, #6b7280)' }}>
                    Free YouTube oEmbed & public timedtext subtitles without paid API keys
                  </small>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  placeholder="Paste YouTube Video URL or ID..."
                  value={ytInput}
                  onChange={(e) => setYtInput(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid #d1d5db',
                    fontSize: '0.85rem',
                  }}
                />
                <button className="primary" onClick={handleLookupYouTube} disabled={ytBusy}>
                  {ytBusy ? 'Inspecting...' : 'Lookup Video'}
                </button>
              </div>

              {ytData?.video && (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    background: '#f9fafb',
                    border: '1px solid #f3f4f6',
                    display: 'flex',
                    gap: 12,
                  }}
                >
                  {ytData.video.thumbnailUrl && (
                    <img
                      src={ytData.video.thumbnailUrl}
                      alt="Thumbnail"
                      style={{ width: 100, height: 60, objectFit: 'cover', borderRadius: 6 }}
                    />
                  )}
                  <div style={{ flex: 1, fontSize: '0.85rem' }}>
                    <a
                      href={ytData.video.watchUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontWeight: 600, color: '#2563eb', textDecoration: 'none' }}
                    >
                      {ytData.video.title} <ExternalLink size={12} style={{ display: 'inline' }} />
                    </a>
                    <div style={{ color: '#4b5563', fontSize: '0.8rem', marginTop: 2 }}>
                      Channel: <strong>{ytData.video.channelName}</strong>
                    </div>
                    {ytData.video.transcriptSnippet && (
                      <div
                        style={{
                          marginTop: 6,
                          padding: 6,
                          background: '#fff',
                          borderRadius: 4,
                          fontSize: '0.75rem',
                          color: '#374151',
                          maxHeight: 80,
                          overflowY: 'auto',
                        }}
                      >
                        <strong>Transcript extract:</strong> {ytData.video.transcriptSnippet}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Tool 3: Static Code Review & Unit Test Generator */}
            <div
              style={{
                background: 'var(--card-bg, #fff)',
                border: '1px solid var(--border-color, #e5e7eb)',
                borderRadius: 12,
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Code size={20} style={{ color: '#6366f1' }} />
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.98rem' }}>Static Code Review & Unit Test Generator</h4>
                  <small style={{ color: 'var(--text-muted, #6b7280)' }}>
                    Bracket balance checking, vulnerability scans, anti-pattern checks & Vitest test scaffolding
                  </small>
                </div>
              </div>

              <textarea
                rows={5}
                value={codeReviewInput}
                onChange={(e) => setCodeReviewInput(e.target.value)}
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 6,
                  border: '1px solid #d1d5db',
                  fontFamily: 'monospace',
                  fontSize: '0.82rem',
                }}
              />

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="button" onClick={handleReviewCode} disabled={codeReviewBusy}>
                  {codeReviewBusy ? 'Analyzing...' : 'Run Code Review'}
                </button>
                <button className="primary" onClick={handleGenerateTests} disabled={codeReviewBusy}>
                  Generate Unit Tests (Vitest)
                </button>
              </div>

              {codeReviewData && (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    background: codeReviewData.syntaxValid ? '#f0fdf4' : '#fef2f2',
                    border: `1px solid ${codeReviewData.syntaxValid ? '#bbf7d0' : '#fecaca'}`,
                    fontSize: '0.85rem',
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    {codeReviewData.syntaxValid ? '✓ Static Check Passed' : '⚠️ Structural Issues Detected'}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.82rem' }}>{codeReviewData.summary}</p>
                </div>
              )}

              {generatedTestCode && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <strong style={{ fontSize: '0.82rem' }}>Scaffolded Test Suite:</strong>
                    <button
                      className="button"
                      onClick={() => navigator.clipboard.writeText(generatedTestCode)}
                      style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                    >
                      Copy Tests
                    </button>
                  </div>
                  <pre
                    style={{
                      background: '#1f2937',
                      color: '#f9fafb',
                      padding: 10,
                      borderRadius: 6,
                      fontSize: '0.78rem',
                      maxHeight: 140,
                      overflowY: 'auto',
                      margin: 0,
                    }}
                  >
                    {generatedTestCode}
                  </pre>
                </div>
              )}
            </div>

            {/* Tool 4: Symbol Navigation */}
            <div
              style={{
                background: 'var(--card-bg, #fff)',
                border: '1px solid var(--border-color, #e5e7eb)',
                borderRadius: 12,
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Search size={20} style={{ color: '#0ea5e9' }} />
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.98rem' }}>Workspace Code Symbol Navigator</h4>
                  <small style={{ color: 'var(--text-muted, #6b7280)' }}>
                    Instant regex/AST navigation of functions, classes, interfaces and types
                  </small>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  placeholder="Search symbol (e.g. calculate, User, Dot)..."
                  value={codeSymbolQuery}
                  onChange={(e) => setCodeSymbolQuery(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid #d1d5db',
                    fontSize: '0.85rem',
                  }}
                />
                <button className="primary" onClick={handleSearchSymbols} disabled={symbolBusy}>
                  {symbolBusy ? 'Searching...' : 'Find Symbols'}
                </button>
              </div>

              {symbolData?.symbols && (
                <div style={{ maxHeight: 220, overflowY: 'auto', fontSize: '0.82rem' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                        <th style={{ padding: '6px 10px', textAlign: 'left' }}>Symbol</th>
                        <th style={{ padding: '6px 10px', textAlign: 'left' }}>Kind</th>
                        <th style={{ padding: '6px 10px', textAlign: 'left' }}>File</th>
                        <th style={{ padding: '6px 10px', textAlign: 'right' }}>Line</th>
                      </tr>
                    </thead>
                    <tbody>
                      {symbolData.symbols.map((sym: any, idx: number) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontWeight: 600 }}>{sym.name}</td>
                          <td style={{ padding: '6px 10px' }}>
                            <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '1px 6px', borderRadius: 4 }}>
                              {sym.kind}
                            </span>
                          </td>
                          <td style={{ padding: '6px 10px', color: '#6b7280' }}>{sym.file}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right' }}>{sym.line}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: INSTANTIATE TEMPLATE */}
      {instantiatingTemplate && (
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
              borderRadius: 12,
              padding: 24,
              maxWidth: 500,
              width: '90%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <h3 style={{ margin: '0 0 8px 0' }}>Launch {instantiatingTemplate.title}</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '0.85rem', color: '#6b7280' }}>
              Configure the objective for this workflow before launching it in <strong>{activeSpace?.name}</strong>.
            </p>

            <label style={{ display: 'block', marginBottom: 8, fontSize: '0.85rem', fontWeight: 600 }}>
              Specific Goal or Topic:
            </label>
            <textarea
              value={customGoal}
              onChange={(e) => setCustomGoal(e.target.value)}
              rows={4}
              style={{
                width: '100%',
                padding: 10,
                borderRadius: 8,
                border: '1px solid #d1d5db',
                fontSize: '0.9rem',
                marginBottom: 16,
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="button" onClick={() => setInstantiatingTemplate(null)}>
                Cancel
              </button>
              <button className="primary" onClick={() => handleInstantiate(instantiatingTemplate)}>
                Launch Workflow
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD FILE */}
      {showFileModal && (
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
              borderRadius: 12,
              padding: 24,
              maxWidth: 600,
              width: '90%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <h3 style={{ margin: '0 0 8px 0' }}>Add File to {activeSpace?.name}</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '0.85rem', color: '#6b7280' }}>
              Create or attach source documents, data tables, or briefs to this workspace.
            </p>

            <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', fontWeight: 600 }}>
              File Name / Path (e.g. data/sales.csv or report.md):
            </label>
            <input
              type="text"
              value={newFilePath}
              onChange={(e) => setNewFilePath(e.target.value)}
              placeholder="e.g. budget.csv"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #d1d5db',
                marginBottom: 12,
                fontSize: '0.9rem',
              }}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', fontWeight: 600 }}>
                  Category:
                </label>
                <select
                  value={newFileCategory}
                  onChange={(e) => setNewFileCategory(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid #d1d5db',
                    fontSize: '0.85rem',
                  }}
                >
                  <option value="source">Source Material</option>
                  <option value="intermediate">Intermediate Draft</option>
                  <option value="deliverable">Deliverable</option>
                  <option value="archive">Archive</option>
                  <option value="general">General</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', fontWeight: 600 }}>
                  Version Note:
                </label>
                <input
                  type="text"
                  value={newFileComment}
                  onChange={(e) => setNewFileComment(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid #d1d5db',
                    fontSize: '0.85rem',
                  }}
                />
              </div>
            </div>

            <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', fontWeight: 600 }}>
              Content:
            </label>
            <textarea
              value={newFileContent}
              onChange={(e) => setNewFileContent(e.target.value)}
              rows={8}
              placeholder="Enter markdown, csv, or plain text..."
              style={{
                width: '100%',
                padding: 10,
                borderRadius: 6,
                border: '1px solid #d1d5db',
                fontSize: '0.85rem',
                fontFamily: 'monospace',
                marginBottom: 16,
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="button" onClick={() => setShowFileModal(false)}>
                Cancel
              </button>
              <button className="primary" onClick={handleCreateFile}>
                Save File
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: VIEW DIFF */}
      {showDiffModal && diffData && (
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
              borderRadius: 12,
              padding: 24,
              maxWidth: 700,
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <h3 style={{ margin: '0 0 4px 0' }}>Version Diff: {diffData.file}</h3>
                <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                  Comparing v{diffData.v1} → v{diffData.v2} (+{diffData.changes.added} / -{diffData.changes.removed})
                </span>
              </div>
              <button className="icon-button" onClick={() => setShowDiffModal(false)}>
                ✕
              </button>
            </div>

            <pre
              style={{
                background: '#1e293b',
                color: '#f8fafc',
                padding: 16,
                borderRadius: 8,
                fontSize: '0.85rem',
                overflowX: 'auto',
                lineHeight: 1.5,
              }}
            >
              {diffData.diff}
            </pre>
          </div>
        </div>
      )}

      {/* MODAL 4: REPLAN STEP */}
      {replanningStepId && (
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
              borderRadius: 12,
              padding: 24,
              maxWidth: 500,
              width: '90%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <h3 style={{ margin: '0 0 8px 0' }}>Replan Step</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '0.85rem', color: '#6b7280' }}>
              Explain why this step needs to be replanned or adapted (Phase 3 dynamic replanning).
            </p>

            <textarea
              value={replanReason}
              onChange={(e) => setReplanReason(e.target.value)}
              placeholder="e.g. The data source was empty, so we must fall back to alternative web research."
              rows={4}
              style={{
                width: '100%',
                padding: 10,
                borderRadius: 6,
                border: '1px solid #d1d5db',
                fontSize: '0.9rem',
                marginBottom: 16,
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="button" onClick={() => setReplanningStepId(null)}>
                Cancel
              </button>
              <button
                className="primary"
                onClick={() => selectedPlanId && handleReplanStep(selectedPlanId, replanningStepId)}
              >
                Submit Replan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
