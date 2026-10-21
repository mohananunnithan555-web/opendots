import { useEffect, useState } from 'react';
import {
  X,
  Plus,
  Zap,
  Copy,
  Trash2,
  CheckCircle,
  ToggleLeft,
  ToggleRight,
  Search,
  BookOpen,
  Code,
  Sparkles,
  BarChart,
  Shield,
  Edit2,
  Save,
} from 'lucide-react';
import { api } from './api';

export interface CustomSkill {
  id: string;
  name: string;
  description: string;
  version: string;
  instructions: string;
  category: 'analysis' | 'utility' | 'generation' | 'research' | 'coding';
  requiredPermissions: string[];
  allowedTools: string[];
  timeoutMs: number;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface BuiltinSkill {
  id: string;
  name: string;
  description: string;
  version: string;
  category: string;
  requiredPermissions: string[];
}

export function SkillModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [builtinSkills, setBuiltinSkills] = useState<BuiltinSkill[]>([]);
  const [customSkills, setCustomSkills] = useState<CustomSkill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Form state for creating / editing custom skills
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formInstructions, setFormInstructions] = useState('');
  const [formCategory, setFormCategory] = useState<'analysis' | 'utility' | 'generation' | 'research' | 'coding'>('utility');
  const [formTools, setFormTools] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadSkills = async () => {
    setLoading(true);
    try {
      const data = await api<{ builtin: BuiltinSkill[]; custom: CustomSkill[] }>('/skills');
      setBuiltinSkills(data.builtin || []);
      setCustomSkills(data.custom || []);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load skills.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void loadSkills();
  }, [open]);

  const handleToggle = async (id: string, current: boolean) => {
    try {
      await api(`/skills/${id}/toggle`, 'POST', { enabled: !current });
      setCustomSkills((prev) =>
        prev.map((s) => (s.id === id ? { ...s, enabled: !current } : s)),
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to toggle skill.');
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const duplicated = await api<CustomSkill>(`/skills/${id}/duplicate`, 'POST');
      setCustomSkills((prev) => [duplicated, ...prev]);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to duplicate skill.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this custom skill?')) return;
    try {
      await api(`/skills/${id}`, 'DELETE');
      setCustomSkills((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete skill.');
    }
  };

  const handleOpenEdit = (skill: CustomSkill) => {
    setEditId(skill.id);
    setFormName(skill.name);
    setFormDesc(skill.description);
    setFormInstructions(skill.instructions);
    setFormCategory(skill.category);
    setFormTools(skill.allowedTools.join(', '));
    setIsEditing(true);
  };

  const handleOpenNew = () => {
    setEditId(null);
    setFormName('');
    setFormDesc('');
    setFormInstructions('');
    setFormCategory('utility');
    setFormTools('analyze_text, calculate');
    setIsEditing(true);
  };

  const handleSaveSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formDesc.trim() || !formInstructions.trim()) {
      alert('Please fill out name, description, and instructions.');
      return;
    }
    setSubmitting(true);
    try {
      const tools = formTools
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      if (editId) {
        const updated = await api<CustomSkill>(`/skills/${editId}`, 'PUT', {
          name: formName.trim(),
          description: formDesc.trim(),
          instructions: formInstructions.trim(),
          category: formCategory,
          allowedTools: tools,
        });
        setCustomSkills((prev) =>
          prev.map((s) => (s.id === editId ? updated : s)),
        );
      } else {
        const created = await api<CustomSkill>('/skills', 'POST', {
          name: formName.trim(),
          description: formDesc.trim(),
          instructions: formInstructions.trim(),
          category: formCategory,
          allowedTools: tools,
        });
        setCustomSkills((prev) => [created, ...prev]);
      }
      setIsEditing(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save skill.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const filteredCustom = customSkills.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase());
    const matchesCat = selectedCategory === 'all' || s.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'research':
        return <BookOpen size={14} />;
      case 'coding':
        return <Code size={14} />;
      case 'generation':
        return <Sparkles size={14} />;
      case 'analysis':
        return <BarChart size={14} />;
      default:
        return <Zap size={14} />;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="skill-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: 'var(--color-bg, #ffffff)',
          color: 'var(--color-text, #111827)',
          width: '100%',
          maxWidth: '780px',
          maxHeight: '90vh',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid var(--color-border, #e5e7eb)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--color-border, #e5e7eb)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Zap size={22} style={{ color: 'var(--color-primary, #3b82f6)' }} />
            <div>
              <h2 id="skill-modal-title" style={{ margin: 0, fontSize: '1.25rem' }}>
                Skills & Workflows
              </h2>
              <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.7 }}>
                Configure, build, and toggle reusable AI capabilities
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="icon-button"
            aria-label="Close"
            style={{ padding: '0.4rem', borderRadius: '8px' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Area */}
        <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1 }}>
          {error && (
            <div
              style={{
                padding: '0.75rem',
                borderRadius: '8px',
                background: '#fee2e2',
                color: '#991b1b',
                marginBottom: '1rem',
                fontSize: '0.875rem',
              }}
            >
              {error}
            </div>
          )}

          {isEditing ? (
            /* Skill Editor Form */
            <form onSubmit={handleSaveSkill} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Edit2 size={16} /> {editId ? 'Edit Skill' : 'Create New Skill'}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="icon-button"
                  style={{ fontSize: '0.85rem', padding: '0.3rem 0.6rem' }}
                >
                  Back to List
                </button>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Skill Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Security & Quality Code Review"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'transparent' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Description (shown to AI and user)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Inspect code for vulnerabilities, edge cases, and performance bottlenecks."
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'transparent' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Category
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as any)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'transparent' }}
                  >
                    <option value="utility">Utility</option>
                    <option value="research">Research</option>
                    <option value="coding">Coding</option>
                    <option value="generation">Generation</option>
                    <option value="analysis">Analysis</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Allowed Tools (comma separated)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., analyze_text, calculate, search_web"
                    value={formTools}
                    onChange={(e) => setFormTools(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'transparent' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Execution Instructions & Guidelines
                </label>
                <textarea
                  rows={5}
                  required
                  placeholder="Define step-by-step instructions the AI must follow when executing this skill..."
                  value={formInstructions}
                  onChange={(e) => setFormInstructions(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'transparent', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="icon-button"
                  style={{ padding: '0.5rem 1rem', borderRadius: '8px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="document-primary"
                  style={{ padding: '0.5rem 1.25rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <Save size={16} /> {submitting ? 'Saving...' : 'Save Skill'}
                </button>
              </div>
            </form>
          ) : (
            /* Skill List View */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Search & Actions Bar */}
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
                  <Search size={16} style={{ position: 'absolute', left: '10px', top: '10px', opacity: 0.5 }} />
                  <input
                    type="text"
                    placeholder="Search skills..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.45rem 0.75rem 0.45rem 2rem',
                      borderRadius: '8px',
                      border: '1px solid var(--color-border)',
                      background: 'transparent',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  {['all', 'research', 'coding', 'generation', 'utility'].map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      style={{
                        padding: '0.35rem 0.75rem',
                        borderRadius: '20px',
                        border: '1px solid var(--color-border)',
                        background: selectedCategory === cat ? 'var(--color-primary, #3b82f6)' : 'transparent',
                        color: selectedCategory === cat ? '#ffffff' : 'inherit',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        textTransform: 'capitalize',
                      }}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleOpenNew}
                  className="document-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 0.9rem', borderRadius: '8px', fontSize: '0.85rem' }}
                >
                  <Plus size={16} /> Create Skill
                </button>
              </div>

              {/* Custom Skills Section */}
              <div>
                <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.6, margin: '0 0 0.6rem 0' }}>
                  Configured Skills ({filteredCustom.length})
                </h3>
                {loading ? (
                  <p style={{ fontSize: '0.85rem', opacity: 0.6 }}>Loading skills...</p>
                ) : filteredCustom.length === 0 ? (
                  <p style={{ fontSize: '0.85rem', opacity: 0.6 }}>No skills found matching your filters.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {filteredCustom.map((skill) => (
                      <div
                        key={skill.id}
                        style={{
                          padding: '0.85rem 1rem',
                          borderRadius: '10px',
                          border: '1px solid var(--color-border)',
                          background: skill.enabled ? 'var(--color-surface, rgba(0,0,0,0.02))' : 'rgba(0,0,0,0.05)',
                          opacity: skill.enabled ? 1 : 0.65,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '1rem',
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', background: 'var(--color-border)', textTransform: 'capitalize' }}>
                              {getCategoryIcon(skill.category)} {skill.category}
                            </span>
                            <strong style={{ fontSize: '0.95rem' }}>{skill.name}</strong>
                            <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>v{skill.version}</span>
                          </div>
                          <p style={{ margin: '0 0 0.35rem 0', fontSize: '0.825rem', opacity: 0.8 }}>
                            {skill.description}
                          </p>
                          {skill.allowedTools.length > 0 && (
                            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                              {skill.allowedTools.map((tool) => (
                                <span
                                  key={tool}
                                  style={{
                                    fontSize: '0.7rem',
                                    padding: '1px 6px',
                                    borderRadius: '4px',
                                    background: 'var(--color-border)',
                                    fontFamily: 'monospace',
                                  }}
                                >
                                  {tool}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Controls */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <button
                            onClick={() => handleToggle(skill.id, skill.enabled)}
                            className="icon-button"
                            title={skill.enabled ? 'Disable Skill' : 'Enable Skill'}
                            style={{ padding: '0.4rem' }}
                          >
                            {skill.enabled ? (
                              <ToggleRight size={22} style={{ color: 'var(--color-primary, #3b82f6)' }} />
                            ) : (
                              <ToggleLeft size={22} style={{ opacity: 0.5 }} />
                            )}
                          </button>
                          <button
                            onClick={() => handleDuplicate(skill.id)}
                            className="icon-button"
                            title="Duplicate Skill"
                            style={{ padding: '0.4rem' }}
                          >
                            <Copy size={16} />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(skill)}
                            className="icon-button"
                            title="Edit Skill"
                            style={{ padding: '0.4rem' }}
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(skill.id)}
                            className="icon-button"
                            title="Delete Skill"
                            style={{ padding: '0.4rem', color: '#ef4444' }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Built-in Core Skills */}
              {builtinSkills.length > 0 && (
                <div style={{ marginTop: '0.5rem' }}>
                  <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.6, margin: '0 0 0.6rem 0' }}>
                    Core Built-in Skills ({builtinSkills.length})
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {builtinSkills.map((b) => (
                      <div
                        key={b.id}
                        style={{
                          padding: '0.65rem 0.85rem',
                          borderRadius: '8px',
                          border: '1px solid var(--color-border)',
                          background: 'var(--color-surface, rgba(0,0,0,0.01))',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '0.85rem',
                        }}
                      >
                        <div>
                          <strong>{b.name}</strong> <span style={{ opacity: 0.6 }}>— {b.description}</span>
                        </div>
                        <span style={{ fontSize: '0.75rem', opacity: 0.6, display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                          <CheckCircle size={13} style={{ color: '#10b981' }} /> Built-in
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
