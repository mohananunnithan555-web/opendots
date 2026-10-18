import { openPageLink } from './page-navigation';
import { Fragment, useRef, useState, type ReactNode } from 'react';
import { PhoneOff, Volume2, Square } from 'lucide-react';
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
                  img: ({ alt }) => <span>{alt}</span>,
                  a: ({ href, children }) => (
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
                  ),
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
