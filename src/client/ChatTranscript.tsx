import { openPageLink } from './page-navigation';
import { Fragment, useRef, useState, type ReactNode } from 'react';
import {
  PhoneOff,
  Volume2,
  Square,
  RotateCw,
  ExternalLink,
  Download,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { AssistantMessage, Message } from '@ag-ui/core';
import type { CallReceipt } from '../shared/types';
import { voiceReceiptMessagePrefix } from '../shared/voice-receipt';
import { isScheduledTaskMessage } from '../shared/scheduled-message';
import { speakWithGemini } from './speech';
import { downloadImageFile, parseImageMetadata } from './image-download';
// These markers only control rendering; they do not confer trust or permissions.
export function isInternalVoiceReceipt(message: Message): boolean {
  const metadata = message.metadata;
  return (
    message.role === 'user' &&
    (message.id.startsWith(voiceReceiptMessagePrefix) ||
      (!!metadata &&
        typeof metadata === 'object' &&
        'opendotsSource' in metadata &&
        metadata.opendotsSource === 'voice_receipt'))
  );
}
function Receipt({ call }: { call: CallReceipt }) {
  return (
    <div className="call-receipt">
      <PhoneOff size={13} />
      <span>
        {call.status === 'failed'
          ? 'Call failed'
          : call.endedAt
            ? `${Math.round((call.endedAt - call.startedAt) / 1000)}s · Call ended`
            : 'Call in progress'}
      </span>
      {call.error && <small>{call.error}</small>}
    </div>
  );
}
function ChatVideo({ src, title }: { src: string; title?: string }) {
  return (
    <div
      className="chat-video-block"
      style={{
        marginTop: '8px',
        marginBottom: '8px',
        maxWidth: '100%',
        width: '460px',
        display: 'block',
      }}
    >
      <video
        src={src}
        controls
        playsInline
        preload="metadata"
        style={{
          width: '100%',
          maxHeight: '340px',
          borderRadius: '12px',
          display: 'block',
          backgroundColor: '#0a0a0a',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
        }}
      >
        Your browser does not support playing this video.
      </video>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          marginTop: '6px',
          fontSize: '11px',
          opacity: 0.85,
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '75%',
          }}
        >
          {title && !title.startsWith('http') ? title : '🎬 AI Generated Video'}
        </span>
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          download
          style={{
            fontSize: '11px',
            color: 'inherit',
            textDecoration: 'underline',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
          }}
        >
          <ExternalLink size={11} />
          Download / Open
        </a>
      </div>
    </div>
  );
}

function ChatImage({ src, alt }: { src?: string; alt?: string }) {
  if (
    src &&
    (src.endsWith('.mp4') || src.endsWith('.webm') || src.includes('/video/'))
  ) {
    return <ChatVideo src={src} title={alt} />;
  }

  const [currentSrc, setCurrentSrc] = useState(src);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<'png' | 'jpeg' | 'webp'>('png');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadDone, setDownloadDone] = useState(false);

  const meta = parseImageMetadata(currentSrc || '', alt);

  const handleRefresh = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!src) return;
    setIsRefreshing(true);
    try {
      const url = new URL(src, window.location.href);
      url.searchParams.set(
        'seed',
        Math.floor(Math.random() * 10_000_000).toString(),
      );
      url.searchParams.set('t', Date.now().toString());
      setCurrentSrc(url.toString());
    } catch {
      setCurrentSrc(`${src}&t=${Date.now()}`);
    }
    setTimeout(() => setIsRefreshing(false), 1500);
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!currentSrc) return;
    setIsDownloading(true);
    setDownloadDone(false);
    try {
      await downloadImageFile({
        url: currentSrc,
        quality: meta.quality,
        aspectRatio: meta.aspectRatio,
        targetWidth: meta.width,
        targetHeight: meta.height,
        format: downloadFormat,
        filename: `opendots-image-${meta.quality}-${meta.width}x${meta.height}.${downloadFormat}`,
      });
      setDownloadDone(true);
      setTimeout(() => setDownloadDone(false), 3000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Download failed.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleGenerateAnother = (e: React.MouseEvent) => {
    e.preventDefault();
    window.dispatchEvent(
      new CustomEvent('opendots:open-image-studio', {
        detail: {
          prompt: meta.prompt,
          quality: meta.quality,
          aspectRatio: meta.aspectRatio,
        },
      }),
    );
  };

  return (
    <div
      className="chat-image-block"
      style={{
        marginTop: '10px',
        marginBottom: '10px',
        maxWidth: '100%',
        display: 'inline-flex',
        flexDirection: 'column',
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid var(--border-color, rgba(255, 255, 255, 0.15))',
        background: 'var(--color-surface, rgba(0, 0, 0, 0.04))',
      }}
    >
      {/* Top Metadata Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          background: 'rgba(0, 0, 0, 0.03)',
          borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
          fontSize: '11px',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              fontWeight: 600,
              color: meta.quality === '4k' ? '#16a34a' : meta.quality === 'hd' ? '#2563eb' : '#6b7280',
              background:
                meta.quality === '4k'
                  ? 'rgba(22, 163, 74, 0.12)'
                  : meta.quality === 'hd'
                    ? 'rgba(37, 99, 235, 0.12)'
                    : 'rgba(107, 114, 128, 0.12)',
              padding: '2px 6px',
              borderRadius: '4px',
            }}
          >
            {meta.label}
          </span>
          <span style={{ opacity: 0.7 }}>Ratio: {meta.aspectRatio}</span>
        </div>
        <span style={{ fontSize: '10px', opacity: 0.65 }}>
          {meta.isUpscaled ? 'HD / 4K Scaled' : 'Native'}
        </span>
      </div>

      {/* Image Preview */}
      <img
        src={currentSrc}
        alt={alt ?? 'Generated image'}
        className="chat-image"
        loading="lazy"
        style={{
          maxWidth: '100%',
          maxHeight: '450px',
          objectFit: 'contain',
          display: 'block',
        }}
      />

      {/* Bottom Action Controls */}
      {meta.isPollinations && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            padding: '8px 12px',
            background: 'rgba(0, 0, 0, 0.03)',
            borderTop: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
            fontSize: '11px',
          }}
        >
          {/* Download Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={handleDownload}
              disabled={isDownloading}
              style={{
                background: downloadDone ? '#16a34a' : '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: isDownloading ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
              title={`Download actual image at ${meta.width} × ${meta.height} in ${downloadFormat.toUpperCase()}`}
            >
              {downloadDone ? (
                <>
                  <CheckCircle2 size={12} /> Saved!
                </>
              ) : (
                <>
                  <Download size={12} />
                  {isDownloading ? 'Downloading...' : `Download ${meta.quality.toUpperCase()}`}
                </>
              )}
            </button>

            <select
              value={downloadFormat}
              onChange={(e) => setDownloadFormat(e.target.value as any)}
              style={{
                fontSize: '11px',
                padding: '3px 6px',
                borderRadius: '6px',
                border: '1px solid rgba(150, 150, 150, 0.3)',
                background: 'transparent',
                color: 'inherit',
              }}
            >
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
              <option value="webp">WebP</option>
            </select>
          </div>

          {/* Secondary Actions: Generate Another, Refresh, Full Size */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={handleGenerateAnother}
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(150, 150, 150, 0.25)',
                borderRadius: '6px',
                padding: '3px 8px',
                fontSize: '11px',
                cursor: 'pointer',
                color: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title="Open Image Studio with this prompt to customize quality, ratio, or style"
            >
              <Sparkles size={11} /> Generate Another
            </button>

            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(150, 150, 150, 0.25)',
                borderRadius: '6px',
                padding: '3px 8px',
                fontSize: '11px',
                cursor: isRefreshing ? 'wait' : 'pointer',
                color: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title="Generate a new variation with random seed"
            >
              <RotateCw size={11} className={isRefreshing ? 'spin' : ''} />
              {isRefreshing ? '...' : 'Retry'}
            </button>

            <a
              href={currentSrc}
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize: '11px',
                color: 'inherit',
                opacity: 0.8,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                textDecoration: 'none',
              }}
              title="Open raw image in new tab"
            >
              <ExternalLink size={11} />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export function ChatTranscript({
  messages,
  calls,
  renderTools,
}: {
  messages: Message[];
  calls: CallReceipt[];
  renderTools?: (message: AssistantMessage) => ReactNode;
}) {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const cancelSpeechRef = useRef<(() => void) | null>(null);

  const toggleSpeak = async (id: string, text: string) => {
    if (speakingId === id) {
      cancelSpeechRef.current?.();
      setSpeakingId(null);
      return;
    }
    cancelSpeechRef.current?.();
    setSpeakingId(id);
    const speech = await speakWithGemini(
      text,
      () => setSpeakingId(id),
      () => setSpeakingId(null),
    );
    cancelSpeechRef.current = speech.cancel;
  };

  const ids = new Set(messages.map((message) => message.id));
  return (
    <>
      {calls
        .filter(
          (call) => !call.anchorMessageId || !ids.has(call.anchorMessageId),
        )
        .map((call) => (
          <Receipt key={call.id} call={call} />
        ))}
      {messages.map((message) => (
        <Fragment key={message.id}>
          {typeof message.content === 'string' && message.content.trim() && (
            <div
              className={`chat-bubble ${message.role}${isScheduledTaskMessage(message) ? ' scheduled' : ''}`}
            >
              {isScheduledTaskMessage(message) && (
                <span className="scheduled-message-label">Scheduled</span>
              )}
              <ReactMarkdown
                components={{
                  img: ({ src, alt }) => <ChatImage src={src} alt={alt} />,
                  a: ({ href, children }) => {
                    if (
                      href &&
                      (href.endsWith('.mp4') ||
                        href.endsWith('.webm') ||
                        href.includes('/video/'))
                    ) {
                      return <ChatVideo src={href} title={String(children)} />;
                    }
                    return (
                      <a
                        onClick={(event) => {
                          if (href?.startsWith('/#/spaces/')) {
                            event.preventDefault();
                            openPageLink(href);
                          }
                        }}
                        href={href}
                        target={
                          href?.startsWith('/#/spaces/') ? undefined : '_blank'
                        }
                        rel="noreferrer"
                      >
                        {children}
                      </a>
                    );
                  },
                }}
              >
                {String(message.content)}
              </ReactMarkdown>
              {message.role === 'assistant' && (
                <div className="chat-bubble-actions">
                  <button
                    type="button"
                    className={`bubble-action-btn ${speakingId === message.id ? 'active' : ''}`}
                    title={
                      speakingId === message.id ? 'Stop reading' : 'Read aloud'
                    }
                    aria-label={
                      speakingId === message.id ? 'Stop reading' : 'Read aloud'
                    }
                    onClick={() =>
                      toggleSpeak(message.id, String(message.content))
                    }
                  >
                    {speakingId === message.id ? (
                      <Square size={13} />
                    ) : (
                      <Volume2 size={13} />
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
          {message.role === 'assistant' && renderTools?.(message)}
          {calls
            .filter((call) => call.anchorMessageId === message.id)
            .map((call) => (
              <Receipt key={call.id} call={call} />
            ))}
        </Fragment>
      ))}
    </>
  );
}
