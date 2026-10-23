import { useState, useRef, useEffect } from 'react';
import {
  X,
  Pen,
  Eraser,
  RotateCcw,
  Trash2,
  Check,
  Palette,
  Loader2,
} from 'lucide-react';

export interface UploadedAttachment {
  id: string;
  name: string;
  path: string;
  relativePath: string;
  size: number;
  type: 'image' | 'document' | 'code' | 'data' | 'sketch' | 'general';
  mimeType: string;
  previewUrl: string;
  textSnippet?: string;
  uploadedAt: number;
}

interface SketchModalProps {
  open: boolean;
  onClose: () => void;
  onAttach: (attachment: UploadedAttachment) => void;
}

const PALETTE = [
  { label: 'White', color: '#ffffff' },
  { label: 'Electric Violet', color: '#818cf8' },
  { label: 'Sky Blue', color: '#38bdf8' },
  { label: 'Emerald', color: '#34d399' },
  { label: 'Amber', color: '#fbbf24' },
  { label: 'Coral Red', color: '#f87171' },
  { label: 'Rose Pink', color: '#f472b6' },
  { label: 'Slate Gray', color: '#64748b' },
];

const BRUSH_SIZES = [2, 4, 8, 14, 22];

export function SketchModal({ open, onClose, onAttach }: SketchModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [color, setColor] = useState('#818cf8');
  const [brushSize, setBrushSize] = useState(4);
  const [isDrawing, setIsDrawing] = useState(false);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize canvas
  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set background to midnight canvas
    ctx.fillStyle = '#0f141f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHistory([ctx.getImageData(0, 0, canvas.width, canvas.height)]);
  }, [open]);

  if (!open) return null;

  const saveState = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    setHistory((prev) => [...prev.slice(-15), ctx.getImageData(0, 0, canvas.width, canvas.height)]);
  };

  const undo = () => {
    if (history.length <= 1) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const newHist = [...history];
    newHist.pop(); // Pop current
    const previous = newHist[newHist.length - 1];
    if (previous) {
      ctx.putImageData(previous, 0, 0);
      setHistory(newHist);
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#0f141f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    saveState();
  };

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.setPointerCapture(e.pointerId);
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brushSize;
    ctx.strokeStyle = tool === 'eraser' ? '#0f141f' : color;

    setIsDrawing(true);
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    setIsDrawing(false);
    saveState();
  };

  const handleAttach = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      setSaving(true);
      setError(null);
      const dataUrl = canvas.toDataURL('image/png');
      const filename = `sketch_${Date.now()}.png`;

      const res = await fetch('/api/files/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: filename,
          content: dataUrl,
          mimeType: 'image/png',
          category: 'sketch',
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to save sketch');
      }

      const json = await res.json();
      if (json.file) {
        onAttach(json.file);
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload error');
    } finally {
      setSaving(false);
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
          maxWidth: '760px',
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
            padding: '14px 20px',
            borderBottom: '1px solid #252b38',
            background: '#0e121a',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Pen size={18} style={{ color: '#818cf8' }} />
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#f8fafc' }}>
              Sketch & Annotate
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
              Draw or sketch an idea to attach to chat
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

        {/* Toolbar */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '10px 16px',
            borderBottom: '1px solid #252b38',
            background: '#121622',
          }}
        >
          {/* Tool switchers */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              onClick={() => setTool('pen')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid',
                borderColor: tool === 'pen' ? '#6366f1' : '#252b38',
                background: tool === 'pen' ? 'rgba(99, 102, 241, 0.15)' : '#181f2f',
                color: tool === 'pen' ? '#818cf8' : '#94a3b8',
                fontSize: '0.8rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <Pen size={14} /> Pen
            </button>
            <button
              type="button"
              onClick={() => setTool('eraser')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid',
                borderColor: tool === 'eraser' ? '#6366f1' : '#252b38',
                background: tool === 'eraser' ? 'rgba(99, 102, 241, 0.15)' : '#181f2f',
                color: tool === 'eraser' ? '#818cf8' : '#94a3b8',
                fontSize: '0.8rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <Eraser size={14} /> Eraser
            </button>
          </div>

          {/* Palette */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {PALETTE.map((p) => (
              <button
                key={p.color}
                type="button"
                title={p.label}
                onClick={() => {
                  setColor(p.color);
                  setTool('pen');
                }}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  backgroundColor: p.color,
                  border: color === p.color && tool === 'pen' ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.2)',
                  cursor: 'pointer',
                  transform: color === p.color && tool === 'pen' ? 'scale(1.15)' : 'scale(1)',
                  transition: 'all 0.15s ease',
                  padding: 0,
                }}
              />
            ))}
          </div>

          {/* Brush Sizes */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Size:</span>
            {BRUSH_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setBrushSize(size)}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  border: '1px solid',
                  borderColor: brushSize === size ? '#6366f1' : '#252b38',
                  background: brushSize === size ? 'rgba(99, 102, 241, 0.2)' : '#181f2f',
                  color: brushSize === size ? '#818cf8' : '#94a3b8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <div
                  style={{
                    width: Math.min(size, 14),
                    height: Math.min(size, 14),
                    borderRadius: '50%',
                    backgroundColor: brushSize === size ? '#818cf8' : '#94a3b8',
                  }}
                />
              </button>
            ))}
          </div>

          {/* Actions: Undo / Clear */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              onClick={undo}
              disabled={history.length <= 1}
              title="Undo last stroke"
              style={{
                background: '#181f2f',
                border: '1px solid #252b38',
                borderRadius: 8,
                padding: '6px 10px',
                color: history.length > 1 ? '#e2e8f0' : '#475569',
                cursor: history.length > 1 ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: '0.75rem',
              }}
            >
              <RotateCcw size={13} /> Undo
            </button>
            <button
              type="button"
              onClick={clearCanvas}
              title="Clear canvas"
              style={{
                background: '#181f2f',
                border: '1px solid #252b38',
                borderRadius: 8,
                padding: '6px 10px',
                color: '#f87171',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: '0.75rem',
              }}
            >
              <Trash2 size={13} /> Clear
            </button>
          </div>
        </div>

        {/* Canvas Workspace */}
        <div
          style={{
            padding: 16,
            display: 'flex',
            justifyContent: 'center',
            backgroundColor: '#090b10',
          }}
        >
          <canvas
            ref={canvasRef}
            width={700}
            height={420}
            onPointerDown={startDrawing}
            onPointerMove={draw}
            onPointerUp={stopDrawing}
            onPointerLeave={stopDrawing}
            style={{
              width: '100%',
              maxWidth: '700px',
              height: 'auto',
              aspectRatio: '700 / 420',
              borderRadius: '12px',
              border: '1px solid #252b38',
              cursor: tool === 'pen' ? 'crosshair' : 'cell',
              touchAction: 'none',
              boxShadow: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.4)',
            }}
          />
        </div>

        {/* Footer */}
        {error && (
          <div style={{ padding: '4px 20px', color: '#f87171', fontSize: '0.75rem' }}>
            {error}
          </div>
        )}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 10,
            padding: '12px 20px',
            borderTop: '1px solid #252b38',
            background: '#121622',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#181f2f',
              border: '1px solid #252b38',
              borderRadius: 8,
              padding: '8px 16px',
              color: '#94a3b8',
              fontSize: '0.85rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAttach}
            disabled={saving}
            style={{
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              border: 'none',
              borderRadius: 8,
              padding: '8px 18px',
              color: '#ffffff',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: saving ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
            }}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            Attach to Chat
          </button>
        </div>
      </div>
    </div>
  );
}
