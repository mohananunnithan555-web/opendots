import { useState } from 'react';
import {
  X,
  Sparkles,
  Download,
  RotateCw,
  ExternalLink,
  Check,
  Sliders,
  Image as ImageIcon,
  CheckCircle2,
} from 'lucide-react';
import { downloadImageFile, parseImageMetadata } from './image-download';

export interface ImageModalProps {
  open: boolean;
  onClose: () => void;
  initialPrompt?: string;
  initialQuality?: 'standard' | 'hd' | '4k';
  initialAspectRatio?: '16:9' | '1:1' | '4:3' | '3:4' | '9:16';
  onInsertToChat?: (markdown: string) => void;
}

export function ImageModal({
  open,
  onClose,
  initialPrompt = '',
  initialQuality = 'hd',
  initialAspectRatio = '16:9',
  onInsertToChat,
}: ImageModalProps) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [quality, setQuality] = useState<'standard' | 'hd' | '4k'>(initialQuality);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '1:1' | '4:3' | '3:4' | '9:16'>(initialAspectRatio);
  const [style, setStyle] = useState<'photorealistic' | 'cinematic' | 'anime' | '3d' | 'digital-art'>('photorealistic');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedResult, setGeneratedResult] = useState<any | null>(null);

  const [downloadFormat, setDownloadFormat] = useState<'png' | 'jpeg' | 'webp'>('png');
  const [downloading, setDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  if (!open) return null;

  const getTargetDimensions = () => {
    switch (quality) {
      case '4k':
        if (aspectRatio === '16:9') return { width: 3840, height: 2160, label: '3840 × 2160 (4K UHD)' };
        if (aspectRatio === '9:16') return { width: 2160, height: 3840, label: '2160 × 3840 (4K Mobile)' };
        if (aspectRatio === '4:3') return { width: 2880, height: 2160, label: '2880 × 2160 (4K Landscape)' };
        if (aspectRatio === '3:4') return { width: 2160, height: 2880, label: '2160 × 2880 (4K Portrait)' };
        return { width: 2160, height: 2160, label: '2160 × 2160 (4K Square)' };
      case 'hd':
        if (aspectRatio === '16:9') return { width: 1920, height: 1080, label: '1920 × 1080 (Full HD)' };
        if (aspectRatio === '9:16') return { width: 1080, height: 1920, label: '1080 × 1920 (Full HD Mobile)' };
        if (aspectRatio === '4:3') return { width: 1440, height: 1080, label: '1440 × 1080 (HD Standard)' };
        if (aspectRatio === '3:4') return { width: 1080, height: 1440, label: '1080 × 1440 (HD Portrait)' };
        return { width: 1080, height: 1080, label: '1080 × 1080 (HD Square)' };
      case 'standard':
      default:
        if (aspectRatio === '16:9') return { width: 1280, height: 720, label: '1280 × 720 (Standard HD)' };
        if (aspectRatio === '9:16') return { width: 720, height: 1280, label: '720 × 1280 (Standard Mobile)' };
        if (aspectRatio === '4:3') return { width: 1024, height: 768, label: '1024 × 768 (Standard 4:3)' };
        if (aspectRatio === '3:4') return { width: 768, height: 1024, label: '768 × 1024 (Standard 3:4)' };
        return { width: 1024, height: 1024, label: '1024 × 1024 (Standard Square)' };
    }
  };

  const targetDim = getTargetDimensions();

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setError(null);
    setDownloadSuccess(false);

    try {
      const res = await fetch('/api/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          quality,
          aspectRatio,
          style,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Generation failed (${res.status})`);
      }

      const data = await res.json();
      setGeneratedResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image generation failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!generatedResult?.imageUrl) return;

    setDownloading(true);
    setDownloadSuccess(false);

    try {
      await downloadImageFile({
        url: generatedResult.imageUrl,
        quality,
        aspectRatio,
        targetWidth: targetDim.width,
        targetHeight: targetDim.height,
        format: downloadFormat,
        filename: `opendots-${quality}-${targetDim.width}x${targetDim.height}.${downloadFormat}`,
      });
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 4000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Download failed.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: '16px',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: 'var(--color-bg, #ffffff)',
          color: 'var(--color-text, #1f2937)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '780px',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid var(--border-color, #e5e7eb)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-color, #e5e7eb)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
              }}
            >
              <Sparkles size={18} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 600 }}>
                AI Image Studio
              </h2>
              <span style={{ fontSize: '11px', color: '#6b7280' }}>
                Full HD 1080p, 4K UHD & Aspect Ratio Controls
              </span>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {error && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                background: '#fef2f2',
                color: '#b91c1c',
                fontSize: '13px',
                border: '1px solid #fecaca',
              }}
            >
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleGenerate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Prompt Textarea */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  marginBottom: '6px',
                }}
              >
                Image Description / Visual Prompt
              </label>
              <textarea
                rows={3}
                required
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. A futuristic bioluminescent greenhouse on Mars, cinematic atmospheric lighting, crystalline architecture, 8k..."
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color, #d1d5db)',
                  background: 'var(--color-surface, #ffffff)',
                  fontFamily: 'inherit',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Quality Selector */}
            <div>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  marginBottom: '8px',
                }}
              >
                <Sliders size={14} /> Quality & Resolution Preset
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setQuality('standard')}
                  style={{
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid',
                    borderColor: quality === 'standard' ? '#3b82f6' : 'var(--border-color, #e5e7eb)',
                    background: quality === 'standard' ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: '13px' }}>Standard</div>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                    1024px — Fast generation
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setQuality('hd')}
                  style={{
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid',
                    borderColor: quality === 'hd' ? '#3b82f6' : 'var(--border-color, #e5e7eb)',
                    background: quality === 'hd' ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    Full HD 1080p
                    <span style={{ fontSize: '9px', background: '#e0e7ff', color: '#3730a3', padding: '1px 5px', borderRadius: '4px' }}>
                      Sharp
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                    1920 × 1080 — Crisp details
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setQuality('4k')}
                  style={{
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid',
                    borderColor: quality === '4k' ? '#3b82f6' : 'var(--border-color, #e5e7eb)',
                    background: quality === '4k' ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    4K Ultra HD
                    <span style={{ fontSize: '9px', background: '#dcfce7', color: '#166534', padding: '1px 5px', borderRadius: '4px' }}>
                      Max Res
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                    3840 × 2160 — Poster / Print
                  </div>
                </button>
              </div>
            </div>

            {/* Aspect Ratio & Style Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                  Aspect Ratio
                </label>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, #d1d5db)',
                    background: 'var(--color-surface, #ffffff)',
                  }}
                >
                  <option value="16:9">16:9 — Widescreen / Desktop Wallpaper</option>
                  <option value="1:1">1:1 — Square / Social Avatar</option>
                  <option value="9:16">9:16 — Vertical Story / Phone Wallpaper</option>
                  <option value="4:3">4:3 — Classic Landscape Photo</option>
                  <option value="3:4">3:4 — Classic Portrait Photo</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                  Artistic Style Preset
                </label>
                <select
                  value={style}
                  onChange={(e) => setStyle(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, #d1d5db)',
                    background: 'var(--color-surface, #ffffff)',
                  }}
                >
                  <option value="photorealistic">Photorealistic (Flux Base)</option>
                  <option value="cinematic">Cinematic 35mm (Dramatic Lighting)</option>
                  <option value="anime">Modern Anime / Illustration</option>
                  <option value="3d">3D CGI Render (Octane / Unreal)</option>
                  <option value="digital-art">Digital Concept Art</option>
                </select>
              </div>
            </div>

            {/* Resolution Transparency Badge */}
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                background: 'var(--color-surface, rgba(0,0,0,0.03))',
                border: '1px solid var(--border-color, #e5e7eb)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '12px',
              }}
            >
              <div>
                <span style={{ fontWeight: 600 }}>Target Output: </span>
                <span style={{ color: '#2563eb', fontWeight: 600 }}>{targetDim.label}</span>
              </div>
              <span style={{ color: '#6b7280', fontSize: '11px' }}>
                {quality === '4k'
                  ? 'Flux GPU generation + Stepped 4K Canvas Upscale ($0 cost)'
                  : quality === 'hd'
                    ? 'Flux GPU generation + Full HD 1080p delivery'
                    : 'Standard generation'}
              </span>
            </div>

            {/* Submit Button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" className="button" onClick={onClose}>
                Cancel
              </button>
              <button
                type="submit"
                className="primary"
                disabled={loading || !prompt.trim()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Sparkles size={15} />
                {loading ? 'Generating High-Resolution Image...' : 'Generate Image'}
              </button>
            </div>
          </form>

          {/* Generated Result Preview & Download Section */}
          {generatedResult && (
            <div
              style={{
                marginTop: '12px',
                padding: '16px',
                borderRadius: '12px',
                border: '1px solid var(--border-color, #e5e7eb)',
                background: 'var(--color-surface, #f9fafb)',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ImageIcon size={16} color="#3b82f6" /> Generated Preview
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <span
                    style={{
                      fontSize: '11px',
                      background: quality === '4k' ? '#dcfce7' : '#e0e7ff',
                      color: quality === '4k' ? '#166534' : '#3730a3',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '12px',
                    }}
                  >
                    {quality.toUpperCase()} • {targetDim.label.split(' ')[0]}
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      background: '#f3f4f6',
                      color: '#4b5563',
                      padding: '2px 8px',
                      borderRadius: '12px',
                    }}
                  >
                    Ratio: {aspectRatio}
                  </span>
                </div>
              </div>

              {/* Image Preview */}
              <div
                style={{
                  width: '100%',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  background: '#000',
                  display: 'flex',
                  justifyContent: 'center',
                  maxHeight: '380px',
                }}
              >
                <img
                  src={generatedResult.imageUrl}
                  alt={prompt}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '380px',
                    objectFit: 'contain',
                    display: 'block',
                  }}
                />
              </div>

              {/* Download Controls */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  paddingTop: '8px',
                  borderTop: '1px solid var(--border-color, #e5e7eb)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 500 }}>Download Format:</label>
                  <select
                    value={downloadFormat}
                    onChange={(e) => setDownloadFormat(e.target.value as any)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      border: '1px solid #ccc',
                      fontSize: '12px',
                    }}
                  >
                    <option value="png">PNG (Lossless High Detail)</option>
                    <option value="jpeg">JPEG (95% Quality)</option>
                    <option value="webp">WebP (Optimized)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  {onInsertToChat && (
                    <button
                      type="button"
                      className="button"
                      onClick={() => {
                        onInsertToChat(generatedResult.markdown);
                        onClose();
                      }}
                      style={{ fontSize: '12px' }}
                    >
                      Insert to Chat
                    </button>
                  )}

                  <button
                    type="button"
                    className="primary"
                    onClick={handleDownload}
                    disabled={downloading}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '13px',
                      background: downloadSuccess ? '#16a34a' : undefined,
                    }}
                  >
                    {downloadSuccess ? (
                      <>
                        <CheckCircle2 size={15} /> Downloaded ({downloadFormat.toUpperCase()})
                      </>
                    ) : (
                      <>
                        <Download size={15} />
                        {downloading ? 'Processing Download...' : `Download ${quality.toUpperCase()} Image`}
                      </>
                    )}
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
