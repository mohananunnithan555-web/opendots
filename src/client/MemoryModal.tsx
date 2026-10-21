import { useState, useEffect } from 'react';
import { X, Search, Trash2, Pin, Plus, Brain } from 'lucide-react';
import { api } from './api';

export interface MemoryRecord {
  id: string;
  category: 'preference' | 'project' | 'conversation_summary' | 'task_context';
  text: string;
  confidence: number;
  pinned: boolean;
  source: 'user_explicit' | 'agent_inferred';
  createdAt: number;
  updatedAt: number;
}

interface MemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MemoryModal({ isOpen, onClose }: MemoryModalProps) {
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [newText, setNewText] = useState('');
  const [newCategory, setNewCategory] = useState<MemoryRecord['category']>('preference');

  const fetchMemories = async () => {
    setLoading(true);
    setError(null);
    try {
      const url =
        selectedCategory === 'all'
          ? '/api/memories'
          : `/api/memories?category=${encodeURIComponent(selectedCategory)}`;
      const data = await api<MemoryRecord[]>(url);
      setMemories(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load memories.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchMemories();
    }
  }, [isOpen, selectedCategory]);

  const handleDelete = async (id: string) => {
    try {
      await api(`/api/memories/${id}`, { method: 'DELETE' });
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete memory.');
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim()) return;
    try {
      const added = await api<MemoryRecord>('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: newText.trim(),
          category: newCategory,
        }),
      });
      setMemories((prev) => [added, ...prev]);
      setNewText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add memory.');
    }
  };

  const filteredMemories = memories.filter((m) => {
    if (!searchQuery.trim()) return true;
    return m.text.toLowerCase().includes(searchQuery.toLowerCase());
  });

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        className="modal-content"
        style={{
          background: 'var(--bg-panel, #1e1e24)',
          color: 'var(--text-primary, #fff)',
          borderRadius: '16px',
          width: '90%',
          maxWidth: '650px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Brain size={20} color="var(--accent, #6366f1)" />
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
              Personal Memory Manager
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              opacity: 0.7,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Categories Tab Bar */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            padding: '12px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            overflowX: 'auto',
          }}
        >
          {[
            { id: 'all', label: 'All' },
            { id: 'preference', label: 'Preferences' },
            { id: 'project', label: 'Projects' },
            { id: 'conversation_summary', label: 'Summaries' },
            { id: 'task_context', label: 'Task Context' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                border: 'none',
                background:
                  selectedCategory === cat.id
                    ? 'var(--accent, #6366f1)'
                    : 'rgba(255,255,255,0.06)',
                color: selectedCategory === cat.id ? '#fff' : 'inherit',
                transition: 'all 0.15s ease',
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div style={{ padding: '12px 20px 6px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(255,255,255,0.05)',
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <Search size={14} opacity={0.6} />
            <input
              type="text"
              placeholder="Search memories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'inherit',
                outline: 'none',
                width: '100%',
                fontSize: '13px',
              }}
            />
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div
            style={{
              padding: '8px 20px',
              color: '#f87171',
              fontSize: '12px',
            }}
          >
            {error}
          </div>
        )}

        {/* Memories List */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {loading ? (
            <div style={{ textAlign: 'center', padding: '24px', opacity: 0.6 }}>
              Loading memories...
            </div>
          ) : filteredMemories.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '32px 16px',
                opacity: 0.5,
                fontSize: '13px',
              }}
            >
              No memories found. As you chat, Dot remembers your preferences and goals here.
            </div>
          ) : (
            filteredMemories.map((m) => (
              <div
                key={m.id}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '12px',
                  border: '1px solid rgba(255,255,255,0.05)',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', lineHeight: 1.4 }}>{m.text}</div>
                  <div
                    style={{
                      display: 'flex',
                      gap: '8px',
                      alignItems: 'center',
                      marginTop: '6px',
                      fontSize: '11px',
                      opacity: 0.6,
                    }}
                  >
                    <span
                      style={{
                        textTransform: 'uppercase',
                        fontWeight: 600,
                        fontSize: '9px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: 'rgba(255,255,255,0.1)',
                      }}
                    >
                      {m.category.replace('_', ' ')}
                    </span>
                    <span>{new Date(m.createdAt).toLocaleDateString()}</span>
                    {m.pinned && <Pin size={10} color="#f59e0b" />}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(m.id)}
                  title="Forget memory"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#f87171',
                    cursor: 'pointer',
                    padding: '4px',
                    opacity: 0.7,
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Add Memory Footer */}
        <form
          onSubmit={handleAdd}
          style={{
            padding: '12px 20px',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
          }}
        >
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value as any)}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'inherit',
              borderRadius: '8px',
              padding: '6px 8px',
              fontSize: '12px',
              outline: 'none',
            }}
          >
            <option value="preference">Preference</option>
            <option value="project">Project</option>
            <option value="conversation_summary">Summary</option>
            <option value="task_context">Context</option>
          </select>
          <input
            type="text"
            placeholder="Add a new memory..."
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: 'inherit',
              borderRadius: '8px',
              padding: '6px 12px',
              fontSize: '13px',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={!newText.trim()}
            style={{
              background: 'var(--accent, #6366f1)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 500,
              cursor: newText.trim() ? 'pointer' : 'default',
              opacity: newText.trim() ? 1 : 0.5,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Plus size={14} />
            Add
          </button>
        </form>
      </div>
    </div>
  );
}
