import { useMemo, useState } from 'react';
import {
  FileText,
  Plus,
  Search,
  LayoutGrid,
  List,
  ArrowUpRight,
  Download,
  Target,
  Edit3,
  Save,
  X,
  Compass,
} from 'lucide-react';
import type { Page } from '../server/pages';
import type { Space } from '../shared/types';
import { api } from './api';
export function pageExcerpt(content: string) {
  return content
    .replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s*(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/gm, '')
    .replace(/```[\s\S]*?```/g, 'Code block')
    .replace(/!?\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`|~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150);
}
export function SpaceLibrary({
  space,
  pages,
  onPage,
  onNew,
  onRefresh,
}: {
  space: Space;
  pages: Page[];
  onPage: (id: string) => void;
  onNew: () => void;
  onRefresh?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [sort, setSort] = useState('recent');
  const [isEditing, setIsEditing] = useState(false);
  const [goal, setGoal] = useState(space.goal ?? '');
  const [instructions, setInstructions] = useState(space.instructions ?? '');
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSaveMetadata = async () => {
    setSaving(true);
    try {
      await api(`/spaces/${space.id}`, 'PATCH', {
        goal: goal.trim() || null,
        instructions: instructions.trim() || null,
      });
      setIsEditing(false);
      onRefresh?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to update project settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await api<{ markdown: string }>(`/spaces/${space.id}/export`);
      const blob = new Blob([res.markdown], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${space.name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}-deliverables.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to export deliverables.');
    } finally {
      setExporting(false);
    }
  };

  const filtered = useMemo(
    () =>
      pages
        .filter((page) =>
          `${page.title} ${page.content}`
            .toLocaleLowerCase()
            .includes(query.toLocaleLowerCase()),
        )
        .sort((a, b) =>
          sort === 'name'
            ? a.title.localeCompare(b.title)
            : b.updatedAt - a.updatedAt || a.title.localeCompare(b.title),
        ),
    [pages, query, sort],
  );
  return (
    <section
      className="space-library"
      aria-label={`${space.name} page library`}
    >
      <header className="library-heading" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'stretch' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span className="library-eyebrow">PROJECT WORKSPACE</span>
              <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', background: 'var(--color-surface-hover, rgba(0,0,0,0.06))', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {space.status ?? 'active'}
              </span>
            </div>
            <h1 style={{ margin: '0 0 0.5rem 0' }}>{space.name}</h1>
            {space.description && <p style={{ margin: 0, opacity: 0.8 }}>{space.description}</p>}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              className="icon-button"
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.5rem 0.85rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}
              onClick={handleExport}
              disabled={exporting}
              title="Download all project deliverables and documents as Markdown"
            >
              <Download size={15} />
              <span>{exporting ? 'Exporting...' : 'Export Deliverables'}</span>
            </button>
            <button
              className="icon-button"
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.5rem 0.85rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}
              onClick={() => setIsEditing(!isEditing)}
              title="Edit project goal and instructions"
            >
              <Edit3 size={15} />
              <span>Project Goals</span>
            </button>
            <button className="document-primary" onClick={onNew}>
              <Plus size={17} /> New page
            </button>
          </div>
        </div>

        {/* Project Goal & Instructions Card */}
        {isEditing ? (
          <div style={{ padding: '1rem', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'var(--color-surface, rgba(0,0,0,0.02))' }}>
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Target size={16} /> Edit Project Goals & Instructions
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Project Goal / Objective</label>
                <input
                  type="text"
                  placeholder="e.g., Deliver a high-performance recommendation algorithm with documentation"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'transparent' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Project Instructions for Dot Agent</label>
                <textarea
                  rows={3}
                  placeholder="e.g., Always format output as clean Markdown tables, focus on security and efficiency"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'transparent', resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  className="icon-button"
                  style={{ padding: '0.4rem 0.8rem', borderRadius: '6px' }}
                  onClick={() => setIsEditing(false)}
                >
                  <X size={15} /> Cancel
                </button>
                <button
                  className="document-primary"
                  style={{ padding: '0.4rem 0.8rem', borderRadius: '6px' }}
                  onClick={handleSaveMetadata}
                  disabled={saving}
                >
                  <Save size={15} /> {saving ? 'Saving...' : 'Save Goals'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          (space.goal || space.instructions) && (
            <div style={{ padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'var(--color-surface, rgba(0,0,0,0.02))', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {space.goal && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                  <Target size={15} style={{ color: 'var(--color-primary, #3b82f6)', flexShrink: 0 }} />
                  <strong>Goal:</strong> <span>{space.goal}</span>
                </div>
              )}
              {space.instructions && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.85rem', opacity: 0.9 }}>
                  <Compass size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div><strong>Agent Instructions:</strong> {space.instructions}</div>
                </div>
              )}
            </div>
          )
        )}
      </header>
      <div className="library-tools">
        <label className="library-search">
          <Search size={17} />
          <input
            aria-label="Search pages"
            placeholder="Search pages"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="library-sort">
          <span className="sr-only">Sort pages</span>
          <select
            aria-label="Sort pages"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="recent">Recently edited</option>
            <option value="name">Name A–Z</option>
          </select>
        </label>
        <div
          className="library-view-toggle"
          role="group"
          aria-label="Library view"
        >
          <button
            aria-label="Grid view"
            aria-pressed={layout === 'grid'}
            onClick={() => setLayout('grid')}
          >
            <LayoutGrid size={17} />
          </button>
          <button
            aria-label="List view"
            aria-pressed={layout === 'list'}
            onClick={() => setLayout('list')}
          >
            <List size={18} />
          </button>
        </div>
      </div>
      <div className="library-section-label">
        <h2>{query ? 'Search results' : 'All pages'}</h2>
        <span>
          {filtered.length} {filtered.length === 1 ? 'page' : 'pages'}
        </span>
      </div>
      {filtered.length ? (
        <div className={`library-pages ${layout}`}>
          {filtered.map((page) => (
            <button
              className="library-page-card"
              key={page.id}
              onClick={() => onPage(page.id)}
            >
              <span className="library-page-icon">
                <FileText size={20} strokeWidth={1.5} />
              </span>
              <div className="library-card-body">
                <h3>{page.title}</h3>
                <p>
                  {pageExcerpt(page.content) ||
                    'An empty page, ready to write.'}
                </p>
                <div className="library-page-meta">
                  <span title={new Date(page.updatedAt).toLocaleString()}>
                    Edited{' '}
                    {new Date(page.updatedAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  {page.parentId && (
                    <span className="library-parent">
                      {
                        pages.find((parent) => parent.id === page.parentId)
                          ?.title
                      }
                    </span>
                  )}
                </div>
              </div>
              <ArrowUpRight className="library-card-arrow" size={15} />
            </button>
          ))}
        </div>
      ) : (
        <div className="library-empty">
          <FileText size={30} strokeWidth={1.3} />
          <h2>{query ? 'No matching pages' : 'No pages yet'}</h2>
          <p>
            {query
              ? 'Try a different title or phrase.'
              : 'Create your first page to start organizing this Space.'}
          </p>
          {!query && (
            <button className="document-primary" onClick={onNew}>
              <Plus size={16} /> New page
            </button>
          )}
        </div>
      )}
    </section>
  );
}
