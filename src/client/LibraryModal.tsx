import { useState, useEffect } from 'react';
import {
  X,
  Search,
  FileText,
  Image as ImageIcon,
  Code2,
  Database,
  Pen,
  Paperclip,
  Loader2,
  Calendar,
  HardDrive,
} from 'lucide-react';
import type { UploadedAttachment } from './SketchModal';

interface LibraryFile {
  id: string;
  name: string;
  path: string;
  size: number;
  extension: string;
  category: string;
  type: 'image' | 'document' | 'code' | 'data' | 'sketch' | 'general';
  previewUrl: string;
  modifiedAt: number;
}

interface LibraryModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (attachment: UploadedAttachment) => void;
}

export function LibraryModal({ open, onClose, onSelect }: LibraryModalProps) {
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'image' | 'document' | 'code' | 'data' | 'sketch'>('all');
  const [error, setError] = useState<string | null>(null);

  const loadLibrary = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (search.trim()) params.append('query', search.trim());
      if (typeFilter !== 'all') params.append('type', typeFilter);

      const res = await fetch(`/api/files/library?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load file library');
      const data = await res.json();
      setFiles(data.files || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading files');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadLibrary();
    }
  }, [open, typeFilter]);

  if (!open) return null;

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadLibrary();
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'image':
        return <ImageIcon size={20} style={{ color: '#38bdf8' }} />;
      case 'sketch':
        return <Pen size={20} style={{ color: '#818cf8' }} />;
      case 'document':
        return <FileText size={20} style={{ color: '#fbbf24' }} />;
      case 'code':
        return <Code2 size={20} style={{ color: '#34d399' }} />;
      case 'data':
        return <Database size={20} style={{ color: '#f472b6' }} />;
      default:
        return <Paperclip size={20} style={{ color: '#94a3b8' }} />;
    }
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
          maxWidth: '820px',
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
            <HardDrive size={18} style={{ color: '#818cf8' }} />
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#f8fafc' }}>
              Workspace File Library
            </h3>
            <span
              style={{
                fontSize: '0.72rem',
                color: '#94a3b8',
                background: '#1a2030',
                padding: '2px 8px',
                borderRadius: '12px',
                border: '1px solid #252b38',
              }}
            >
              Browse & reuse uploaded files, images, and sketches
            </span>
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

        {/* Filter Bar & Search */}
        <div
          style={{
            padding: '12px 20px',
            borderBottom: '1px solid #252b38',
            background: '#121622',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          {/* Category Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto' }}>
            {[
              { id: 'all', label: 'All Files' },
              { id: 'image', label: 'Images' },
              { id: 'sketch', label: 'Sketches' },
              { id: 'document', label: 'Documents' },
              { id: 'code', label: 'Code' },
              { id: 'data', label: 'Data' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTypeFilter(tab.id as any)}
                style={{
                  border: 'none',
                  borderRadius: 14,
                  padding: '4px 10px',
                  fontSize: '0.75rem',
                  fontWeight: typeFilter === tab.id ? 600 : 500,
                  cursor: 'pointer',
                  background: typeFilter === tab.id ? '#6366f1' : '#1a2030',
                  color: typeFilter === tab.id ? '#ffffff' : '#94a3b8',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Search
                size={14}
                style={{ position: 'absolute', left: 10, color: '#64748b', pointerEvents: 'none' }}
              />
              <input
                type="text"
                placeholder="Search files..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  background: '#090b10',
                  border: '1px solid #252b38',
                  borderRadius: 8,
                  padding: '6px 12px 6px 30px',
                  fontSize: '0.8rem',
                  color: '#f8fafc',
                  outline: 'none',
                  width: '180px',
                }}
              />
            </div>
            <button
              type="submit"
              style={{
                background: '#1a2030',
                border: '1px solid #252b38',
                borderRadius: 8,
                padding: '6px 10px',
                color: '#e2e8f0',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              Search
            </button>
          </form>
        </div>

        {/* Content Area */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px',
            backgroundColor: '#090b10',
          }}
        >
          {loading ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '60px 0',
                gap: 12,
                color: '#94a3b8',
              }}
            >
              <Loader2 size={28} className="animate-spin" style={{ color: '#818cf8' }} />
              <span style={{ fontSize: '0.85rem' }}>Loading workspace files...</span>
            </div>
          ) : error ? (
            <div
              style={{
                padding: '30px',
                textAlign: 'center',
                color: '#f87171',
                fontSize: '0.85rem',
              }}
            >
              {error}
            </div>
          ) : files.length === 0 ? (
            <div
              style={{
                padding: '60px 20px',
                textAlign: 'center',
                color: '#64748b',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <HardDrive size={36} style={{ strokeWidth: 1.5, color: '#334155' }} />
              <p style={{ margin: 0, fontSize: '0.9rem', color: '#94a3b8' }}>
                No files found in workspace
              </p>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
                Upload photos, documents, or create a sketch to build your library.
              </p>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 16,
              }}
            >
              {files.map((file) => {
                const isImg = file.type === 'image' || file.type === 'sketch';
                return (
                  <div
                    key={file.id}
                    style={{
                      background: '#141925',
                      border: '1px solid #252b38',
                      borderRadius: 12,
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      transition: 'transform 0.15s ease, border-color 0.15s ease',
                    }}
                  >
                    {/* Thumbnail or Icon Preview */}
                    <div
                      style={{
                        height: '110px',
                        background: '#0e121a',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        position: 'relative',
                        borderBottom: '1px solid #252b38',
                      }}
                    >
                      {isImg ? (
                        <img
                          src={file.previewUrl}
                          alt={file.name}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                          }}
                          loading="lazy"
                        />
                      ) : (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          {getFileIcon(file.type)}
                          <span
                            style={{
                              fontSize: '0.68rem',
                              color: '#64748b',
                              textTransform: 'uppercase',
                              fontWeight: 600,
                            }}
                          >
                            {file.extension || file.type}
                          </span>
                        </div>
                      )}
                      <span
                        style={{
                          position: 'absolute',
                          top: 8,
                          right: 8,
                          background: 'rgba(9, 11, 16, 0.75)',
                          backdropFilter: 'blur(4px)',
                          padding: '2px 6px',
                          borderRadius: 6,
                          fontSize: '0.65rem',
                          color: '#e2e8f0',
                        }}
                      >
                        {formatSize(file.size)}
                      </span>
                    </div>

                    {/* File Info & Action */}
                    <div
                      style={{
                        padding: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        flex: 1,
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div
                          title={file.name}
                          style={{
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            color: '#f8fafc',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {file.name}
                        </div>
                        <div
                          style={{
                            fontSize: '0.7rem',
                            color: '#64748b',
                            marginTop: 2,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <Calendar size={11} /> {formatDate(file.modifiedAt)}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          onSelect({
                            id: file.path,
                            name: file.name,
                            path: file.path,
                            relativePath: file.path,
                            size: file.size,
                            type: file.type,
                            mimeType: isImg ? 'image/png' : 'application/octet-stream',
                            previewUrl: file.previewUrl,
                            uploadedAt: file.modifiedAt,
                          });
                          onClose();
                        }}
                        style={{
                          background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                          border: 'none',
                          borderRadius: 8,
                          padding: '6px 12px',
                          color: '#ffffff',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          width: '100%',
                          boxShadow: '0 2px 6px rgba(99, 102, 241, 0.25)',
                        }}
                      >
                        <Paperclip size={13} /> Attach to Chat
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
