import { openPageLink } from './page-navigation';
import { Fragment, useRef, useState, type ReactNode } from 'react';
import { PhoneOff, Volume2, Square, RotateCw, ExternalLink } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { AssistantMessage, Message } from '@ag-ui/core';
import type { CallReceipt } from '../shared/types';
import { voiceReceiptMessagePrefix } from '../shared/voice-receipt';
import { isScheduledTaskMessage } from '../shared/scheduled-message';
import { speakWithGemini } from './speech';
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

  const isPollinations = src?.includes('pollinations.ai');

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

  return (
    <div
      className="chat-image-block"
      style={{
        marginTop: '8px',
        marginBottom: '8px',
        maxWidth: '100%',
        display: 'inline-block',
      }}
    >
      <img
        src={currentSrc}
        alt={alt ?? 'Generated image'}
        className="chat-image"
        loading="lazy"
        style={{
          maxWidth: '100%',
          borderRadius: '12px',
          display: 'block',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        }}
      />
      {isPollinations && (
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
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '6px',
              padding: '3px 8px',
              fontSize: '11px',
              cursor: isRefreshing ? 'wait' : 'pointer',
              color: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
            title="Reloads image with a new seed. If throttled by 45s cooldown, wait 45s and click this!"
          >
            <RotateCw size={11} />
            {isRefreshing ? 'Refreshing...' : 'Retry / Refresh'}
          </button>
          <a
            href={currentSrc}
            target="_blank"
            rel="noreferrer"
            style={{
              fontSize: '11px',
              color: 'inherit',
              textDecoration: 'underline',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              opacity: 0.8,
            }}
          >
            <ExternalLink size={11} />
            Open full size
          </a>
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
