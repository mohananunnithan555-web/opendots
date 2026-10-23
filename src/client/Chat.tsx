import { PageReviewCard } from './PageReviewCard';
import { pageReviewSchema, pageReviewTool } from '../shared/page-review';
import {
  connectionActionSchema,
  connectionActionTool,
} from '../shared/connection-types';
import { ConnectionActionCard } from './ConnectionActionCard';
import { contextualMessage, type PageContext } from './page-context';
import { api } from './api';
import type { Page } from '../server/pages';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CopilotKitCoreErrorCode } from '@copilotkit/core';
import {
  CopilotChatToolCallsView,
  useRenderTool,
  useHumanInTheLoop,
  useAgent,
  useCopilotKit,
} from '@copilotkit/react-core/v2';
import {
  FilePlus,
  ArrowUp,
  Clock3,
  Link2,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Square,
  X,
  Sparkles,
  Image as ImageIcon,
  Plus,
  Loader2,
  Search,
} from 'lucide-react';
import { ImageModal } from './ImageModal';
import { ToolsMenu } from './ToolsMenu';
import { SketchModal, type UploadedAttachment } from './SketchModal';
import { LibraryModal } from './LibraryModal';
import { BrowserTabsModal } from './BrowserTabsModal';
import { GitHubConnectModal } from './GitHubConnectModal';
import { OpenAiModal } from './OpenAiModal';
import { getSpeechRecognition } from './speech';
import { useDictation } from './useDictation';
import {
  ComputerToolCard,
  type ComputerToolRenderProps,
} from './ComputerToolCard';
import { ChatTranscript, isInternalVoiceReceipt } from './ChatTranscript';
import type { CallReceipt, Conversation, Dot } from '../shared/types';
import { Mascot } from './Mascot';
import { useVoice } from './useVoice';
import { CallView } from './CallView';
import { shouldSubmitComposerOnKeyDown } from './chat-composer';

export function Chat({
  thread,
  dot,
  initialPrompt,
  onConsumed,
  voiceReady,
  calls,
  paused,
  onSaved,
  onSchedule,
  onComputer,
}: {
  thread: Conversation;
  dot: Dot;
  initialPrompt?: string;
  onConsumed: () => void;
  voiceReady: boolean;
  calls: CallReceipt[];
  paused: boolean;
  onSaved: () => void;
  onSchedule: () => void;
  onComputer?: () => void;
}) {
  const { agent, isReady } = useAgent({
    agentId: `chat-${thread.id}`,
    runtimeAgentId: dot.id,
    threadId: thread.id,
  });
  const { copilotkit } = useCopilotKit();
  const [pageContext, setPageContext] = useState<PageContext | null>();
  const [contextError, setContextError] = useState('');
  const [contextAttempt, setContextAttempt] = useState(0);
  const contextReady = pageContext !== undefined;
  useEffect(() => {
    let active = true;
    setPageContext(undefined);
    setContextError('');
    void api<PageContext | null>(
      `/conversations/${thread.id}/page-context`,
      'GET',
      undefined,
      AbortSignal.timeout(10000),
    )
      .then((page) => {
        if (active) setPageContext(page);
      })
      .catch(() => {
        if (active)
          setContextError(
            'Conversation context could not load. Retry before sending your message.',
          );
      });
    return () => {
      active = false;
    };
  }, [thread.id, contextAttempt]);
  const [draft, setDraft] = useState('');
  const [source, setSource] = useState('');
  const [sourceOpen, setSourceOpen] = useState(false);
  const [error, setError] = useState('');
  const [runError, setRunError] = useState('');
  const chatError = error || runError;
  const [loaded, setLoaded] = useState(false);
  const [running, setRunning] = useState(false);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [imageModalInitial, setImageModalInitial] = useState<{
    prompt?: string;
    quality?: 'standard' | 'hd' | '4k';
    aspectRatio?: '16:9' | '1:1' | '4:3' | '3:4' | '9:16';
  }>({});
  const [grokMode, setGrokMode] = useState<'normal' | 'think' | 'fun' | 'deepsearch' | 'de-hype'>('normal');
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const [sketchModalOpen, setSketchModalOpen] = useState(false);
  const [libraryModalOpen, setLibraryModalOpen] = useState(false);
  const [browserTabsModalOpen, setBrowserTabsModalOpen] = useState(false);
  const [gitHubModalOpen, setGitHubModalOpen] = useState(false);
  const [openAiModalOpen, setOpenAiModalOpen] = useState(false);
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [isWebSearchActive, setIsWebSearchActive] = useState(false);
  const [isGitHubConnected, setIsGitHubConnected] = useState(false);
  const [isOpenAiConfigured, setIsOpenAiConfigured] = useState(false);

  const checkIntegrationsStatus = useCallback(async () => {
    try {
      if (typeof fetch === 'undefined') return;
      const res = await fetch('/api/connectors');
      if (!res.ok) return;
      const connectors = (await res.json()) as any[];
      if (Array.isArray(connectors)) {
        const gh = connectors.find((c) => c.type === 'github');
        setIsGitHubConnected(gh?.status === 'connected');
        const oai = connectors.find((c) => c.type === 'openai');
        setIsOpenAiConfigured(oai?.status === 'connected');
      }
    } catch {}
  }, []);

  useEffect(() => {
    checkIntegrationsStatus();
  }, [checkIntegrationsStatus]);

  const handleUploadFile = async (file: File) => {
    try {
      setUploadingAttachment(true);
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Upload failed');
      }

      const data = await res.json();
      if (data.file) {
        setAttachments((prev) => [...prev, data.file]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'File upload failed');
    } finally {
      setUploadingAttachment(false);
    }
  };

  useEffect(() => {
    const handleOpenStudio = (e: Event) => {
      const custom = e as CustomEvent;
      if (custom.detail) {
        setImageModalInitial({
          prompt: custom.detail.prompt,
          quality: custom.detail.quality,
          aspectRatio: custom.detail.aspectRatio,
        });
      }
      setImageModalOpen(true);
    };
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('opendots:open-image-studio', handleOpenStudio);
      return () => window.removeEventListener('opendots:open-image-studio', handleOpenStudio);
    }
  }, []);
  const onVoiceInterrupt = useCallback(() => {
    setRunning(false);
  }, []);

  const onVoiceTurn = useCallback(
    async (text: string): Promise<string> => {
      if (!text.trim() || !loaded || !contextReady || paused)
        return '';
      setError('');
      setRunError('');
      setRunning(true);
      agent.addMessage({
        id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
        role: 'user',
        content: contextualMessage(text, pageContext),
      });
      try {
        const result = await copilotkit.runAgent({ agent });
        onSaved();
        const assistantMsg = result.newMessages.findLast(
          (m) =>
            m.role === 'assistant' &&
            typeof m.content === 'string' &&
            m.content.trim(),
        );
        const reply =
          typeof assistantMsg?.content === 'string'
            ? assistantMsg.content
            : 'I have finished thinking about that.';
        return reply;
      } finally {
        setRunning(false);
      }
    },
    [
      agent,
      copilotkit,
      contextReady,
      loaded,
      onSaved,
      pageContext,
      paused,
    ],
  );

  const voice = useVoice(
    thread.id,
    onSaved,
    agent.messages.at(-1)?.id,
    onVoiceTurn,
    onVoiceInterrupt,
  );

  const dictation = useDictation({
    onTranscriptChange: (text) => {
      setDraft(text);
    },
    onError: (err) => {
      setError(err);
    },
  });
  const sent = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const subscription = copilotkit.subscribe({
      onError: ({ error, code }) => {
        if (
          code === CopilotKitCoreErrorCode.AGENT_RUN_ERROR_EVENT ||
          code === CopilotKitCoreErrorCode.AGENT_RUN_FAILED_EVENT ||
          code === CopilotKitCoreErrorCode.AGENT_RUN_FAILED ||
          code === CopilotKitCoreErrorCode.AGENT_THREAD_LOCKED
        )
          setRunError(error.message);
        else setError(error.message);
      },
    });
    const events = agent.subscribe({
      onRunErrorEvent: ({ event }) => setRunError(event.message),
      onRunFinishedEvent: ({ outcome }) => {
        if (outcome === 'success') setRunError('');
      },
    });
    return () => {
      subscription.unsubscribe();
      events.unsubscribe();
    };
  }, [agent, copilotkit]);
  useEffect(() => {
    if (!isReady) return;
    let active = true;
    void copilotkit
      .connectAgent({ agent })
      .then(() => {
        if (active) setLoaded(true);
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : 'Conversation could not connect.',
          );
      });
    return () => {
      active = false;
    };
  }, [agent, copilotkit, isReady]);
  const send = async (text: string) => {
    if (!text.trim() || running || !loaded || !contextReady || paused) return;
    setError('');
    setRunError('');
    setRunning(true);
    agent.addMessage({
      id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      role: 'user',
      content: contextualMessage(text, pageContext),
    });
    setDraft('');
    setSource('');
    setSourceOpen(false);
    try {
      const result = await copilotkit.runAgent({ agent });
      if (!result.newMessages.some((message) => message.role === 'assistant'))
        throw new Error(
          'The current turn returned no response. Check the runtime connection and retry.',
        );
      onSaved();
    } catch (e) {
      setRunError(
        e instanceof Error
          ? e.message
          : 'The turn failed. Your conversation remains saved.',
      );
    } finally {
      setRunning(false);
    }
  };
  useEffect(() => {
    if (loaded && contextReady && !paused && initialPrompt && !sent.current) {
      sent.current = true;
      onConsumed();
      void send(initialPrompt);
    }
  }, [loaded, contextReady, paused, initialPrompt]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'instant', block: 'end' });
  }, [agent.messages.length, running]);
  useEffect(() => {
    if (paused) {
      if (voice.status !== 'idle') void voice.end();
      if (dictation.isListening) dictation.stop();
    }
  }, [paused, dictation.isListening]);
  useHumanInTheLoop(
    {
      name: pageReviewTool.name,
      description: pageReviewTool.description,
      parameters: pageReviewSchema,
      render: (props) => (
        <PageReviewCard {...props} threadId={thread.id} onSaved={onSaved} />
      ),
    },
    [thread.id, onSaved],
  );
  useHumanInTheLoop(
    {
      name: connectionActionTool.name,
      description: connectionActionTool.description,
      parameters: connectionActionSchema,
      render: (props) => (
        <ConnectionActionCard {...props} threadId={thread.id} />
      ),
    },
    [thread.id],
  );
  const computerCalls = agent.messages.flatMap((message) =>
    message.role === 'assistant' ? (message.toolCalls ?? []) : [],
  );
  const latestBrowserCall = computerCalls.findLast((call) =>
    [
      'navigate',
      'snapshot',
      'read',
      'screenshot',
      'click',
      'type',
      'key',
      'scroll',
    ].some((action) => call.function.name === `computer_${action}`),
  );
  useRenderTool(
    {
      name: '*',
      render: (props: ComputerToolRenderProps) =>
        props.name.startsWith('computer_') ? (
          <ComputerToolCard
            {...props}
            dotId={dot.id}
            dotName={dot.name}
            running={running}
            showScreen={props.toolCallId === latestBrowserCall?.id}
            onExpand={onComputer}
          />
        ) : null,
    },
    [dot.id, dot.name, running, latestBrowserCall?.id, onComputer],
  );
  const visible = agent.messages.filter(
    (message) =>
      !isInternalVoiceReceipt(message) &&
      ['user', 'assistant'].includes(message.role) &&
      ((typeof message.content === 'string' && message.content.trim()) ||
        (message.role === 'assistant' &&
          message.toolCalls?.some(
            (call) =>
              call.function.name.startsWith('computer_') ||
              call.function.name === 'COMPOSIO_MANAGE_CONNECTIONS' ||
              call.function.name === pageReviewTool.name ||
              call.function.name === connectionActionTool.name,
          ))),
  );
  return (
    <div className="live-chat">
      <header className="chat-persona">
        <Mascot
          identity={dot.id}
          name={dot.name}
          small
          state={running ? 'working' : paused ? 'paused' : 'idle'}
        />
        <div>
          <strong>{dot.name}</strong>
          <span>
            {paused
              ? 'Paused'
              : running
                ? 'Thinking…'
                : loaded && contextReady
                  ? 'Here with you'
                  : 'Connecting to your conversation…'}
          </span>
        </div>
        <div className="chat-persona-actions">
          <button
            className="icon-button"
            aria-label="Save conversation as page"
            disabled={running}
            onClick={async () => {
              const title = window.prompt('Page title', thread.title);
              if (!title) return;
              try {
                const page = await api<Page>(
                  `/conversations/${thread.id}/page`,
                  'POST',
                  { title },
                );
                if (typeof window !== 'undefined' && window.location) {
                  window.location.hash = `/spaces/${page.spaceId}/pages/${page.id}`;
                }
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : 'Could not save conversation.',
                );
              }
            }}
          >
            <FilePlus size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Schedule a task in this conversation"
            onClick={onSchedule}
          >
            <Clock3 size={18} />
          </button>
          <button
            className={`icon-button ${voice.status === 'active' ? 'on-call' : ''}`}
            aria-label={
              voice.status === 'idle' ? 'Start voice call' : 'End voice call'
            }
            title={
              voice.status === 'idle'
                ? 'Talk with your Dot'
                : 'End voice call'
            }
            disabled={paused || !loaded || !contextReady}
            onClick={() =>
              voice.status === 'idle' ? void voice.start() : void voice.end()
            }
          >
            {voice.status === 'idle' ? (
              <Phone size={18} />
            ) : (
              <PhoneOff size={18} />
            )}
          </button>
        </div>
      </header>
      {pageContext && (
        <div className="page-chat-context">
          Working on{' '}
          <a href={`/#/spaces/${pageContext.spaceId}/pages/${pageContext.id}`}>
            {pageContext.title}
          </a>
        </div>
      )}
      <div className="chat-transcript">
        {!visible.length && (
          <div className="chat-welcome">
            <span className="eyebrow">A LITTLE SPACE TO THINK</span>
            <h1>What’s on your mind?</h1>
            <p>{dot.instructions}</p>
            <p className="muted">
              Your conversation stays with this Dot, across text and calls.
            </p>
          </div>
        )}
        <ChatTranscript
          messages={visible}
          calls={calls}
          renderTools={(message) => (
            <CopilotChatToolCallsView
              message={message}
              messages={agent.messages}
            />
          )}
        />
        {running && (
          <div className="thinking">
            <span />
            <span />
            <span />
            <span>{dot.name} is thinking</span>
          </div>
        )}
        <div ref={bottom} />
      </div>
      {contextError && (
        <div className="chat-error" role="alert">
          {contextError}
          <button onClick={() => setContextAttempt((value) => value + 1)}>
            Retry context
          </button>
        </div>
      )}
      {(chatError || voice.error) && (
        <div className="chat-error" role="alert">
          {chatError || voice.error}
          {chatError && (
            <button
              onClick={() => {
                setError('');
                setRunError('');
                void copilotkit
                  .connectAgent({ agent })
                  .then(() => setLoaded(true))
                  .catch((e) => setError(e.message));
              }}
            >
              Reconnect
            </button>
          )}
        </div>
      )}
      <CallView
        key={voice.status === 'idle' ? 'idle' : 'call'}
        dot={dot}
        voice={voice}
      />
      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          if (dictation.isListening) {
            dictation.stop();
          }
          const modeInstruction =
            grokMode === 'think'
              ? '[GROK THINK MODE: Write your step-by-step reasoning scratchpad in <thought>...</thought> tags, then provide the final verified response.]\n'
              : grokMode === 'fun'
              ? '[GROK FUN MODE: Respond with wit, sarcasm, and playful Hitchhiker’s Guide-style humor.]\n'
              : grokMode === 'deepsearch'
              ? '[GROK DEEPSEARCH MODE: Perform an exhaustive multi-source investigation with citations and confidence metrics.]\n'
              : grokMode === 'de-hype'
              ? '[GROK DE-HYPE MODE: Cut through marketing jargon and objectively balance tradeoffs and competing viewpoints.]\n'
              : '';

          const searchInstruction = isWebSearchActive
            ? '[WEB SEARCH ENABLED: Inspect current real-time web sources and provide citations]\n'
            : '';

          let attachmentBlock = '';
          if (attachments.length > 0) {
            const list = attachments
              .map((att) => {
                let s = `- Attached ${att.type}: "${att.name}" (${att.previewUrl})`;
                if (att.textSnippet) {
                  s += `\n  Content Snippet:\n  \`\`\`\n  ${att.textSnippet}\n  \`\`\``;
                }
                return s;
              })
              .join('\n\n');
            attachmentBlock = `[ATTACHED FILES:\n${list}\n]\n\n`;
          }

          const userText = draft.trim() || (attachments.length > 0 ? 'Please inspect and analyze the attached file(s).' : '');
          const fullDraft = `${source ? `From ${source}:\n\n` : ''}${modeInstruction}${searchInstruction}${attachmentBlock}${userText}`;

          setAttachments([]);
          void send(fullDraft);
        }}
      >
        {/* Grok Mode Selector Bar */}
        <div
          className="grok-mode-bar"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 8,
            overflowX: 'auto',
            paddingBottom: 2,
          }}
        >
          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, marginRight: 2 }}>
            <Sparkles size={12} style={{ color: '#6366f1' }} /> Mode:
          </span>
          {[
            { id: 'normal', label: 'Normal' },
            { id: 'think', label: '🧠 Think (CoT)' },
            { id: 'fun', label: '✨ Fun' },
            { id: 'deepsearch', label: '🔍 DeepSearch' },
            { id: 'de-hype', label: '⚡ De-Hype' },
          ].map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setGrokMode(m.id as any)}
              style={{
                border: 'none',
                background: grokMode === m.id ? '#4f46e5' : '#f1f5f9',
                color: grokMode === m.id ? '#ffffff' : '#475569',
                borderRadius: 14,
                padding: '2px 8px',
                fontSize: '0.72rem',
                fontWeight: grokMode === m.id ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
        {sourceOpen && (
          <div className="source-input">
            <Link2 size={15} />
            <input
              aria-label="Source page URL"
              type="url"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="https://example.com/page"
            />
            <button
              type="button"
              className="icon-button"
              aria-label="Remove source"
              onClick={() => {
                setSourceOpen(false);
                setSource('');
              }}
            >
              <X size={14} />
            </button>
          </div>
        )}
        {/* Voice Dictation Live Indicators */}
        {dictation.isListening && (
          <div
            className="voice-dictation-active-pill"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 12px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#991b1b',
              borderRadius: 8,
              fontSize: '0.8rem',
              marginBottom: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#dc2626',
                  display: 'inline-block',
                  animation: 'pulse-read 1s infinite',
                }}
              />
              <span>
                <strong>Listening…</strong> Speak clearly into your microphone
                {dictation.interimSnippet ? `: "${dictation.interimSnippet}"` : ''}
              </span>
            </div>
            <button
              type="button"
              onClick={() => dictation.stop()}
              style={{
                background: '#dc2626',
                color: '#ffffff',
                border: 'none',
                borderRadius: 4,
                padding: '2px 8px',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Done
            </button>
          </div>
        )}

        {dictation.status === 'requesting-permission' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              color: '#1e40af',
              borderRadius: 8,
              fontSize: '0.8rem',
              marginBottom: 8,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2563eb', display: 'inline-block' }} />
            <span>Please allow microphone access in your browser prompt…</span>
          </div>
        )}

        {/* Attachment Chips Preview Tray */}
        {(attachments.length > 0 || uploadingAttachment) && (
          <div
            className="chat-attachments-tray"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 8,
              overflowX: 'auto',
              paddingBottom: 4,
            }}
          >
            {attachments.map((att, idx) => {
              const isImg = att.type === 'image' || att.type === 'sketch';
              return (
                <div
                  key={att.id + idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '4px 8px',
                    background: '#141925',
                    border: '1px solid #252b38',
                    borderRadius: 10,
                    fontSize: '0.75rem',
                    color: '#f8fafc',
                    maxWidth: '220px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                    flexShrink: 0,
                  }}
                >
                  {isImg ? (
                    <img
                      src={att.previewUrl}
                      alt={att.name}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        objectFit: 'cover',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        background: '#1a2030',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#818cf8',
                        flexShrink: 0,
                      }}
                    >
                      <FilePlus size={14} />
                    </div>
                  )}
                  <div style={{ overflow: 'hidden', flex: 1 }}>
                    <div
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontWeight: 500,
                      }}
                      title={att.name}
                    >
                      {att.name}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                      {(att.size / 1024).toFixed(0)} KB
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      padding: 2,
                      borderRadius: 4,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    title="Remove attachment"
                  >
                    <X size={13} />
                  </button>
                </div>
              );
            })}
            {uploadingAttachment && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  background: '#141925',
                  border: '1px dashed #6366f1',
                  borderRadius: 10,
                  fontSize: '0.72rem',
                  color: '#818cf8',
                  flexShrink: 0,
                }}
              >
                <Loader2 size={13} className="animate-spin" /> Uploading file...
              </div>
            )}
          </div>
        )}

        <div className="chat-compose-row">
          {/* Tools & Integrations (+) Button */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <button
              type="button"
              className={`icon-button tools-plus-button ${toolsMenuOpen ? 'active' : ''}`}
              aria-label="Open tools & integrations menu"
              title="Tools & integrations: Upload files, library, create image, browser tabs, web search, sketch, thinking mode, GitHub, OpenAI"
              onClick={() => setToolsMenuOpen(!toolsMenuOpen)}
              style={{
                background: toolsMenuOpen ? '#6366f1' : undefined,
                color: toolsMenuOpen ? '#ffffff' : undefined,
                transition: 'all 0.15s ease',
              }}
            >
              <Plus
                size={19}
                style={{
                  transform: toolsMenuOpen ? 'rotate(45deg)' : 'none',
                  transition: 'transform 0.15s ease',
                }}
              />
            </button>
            <ToolsMenu
              open={toolsMenuOpen}
              onClose={() => setToolsMenuOpen(false)}
              onUploadFile={handleUploadFile}
              onOpenLibrary={() => setLibraryModalOpen(true)}
              onOpenImageStudio={() => {
                setImageModalInitial({ prompt: draft });
                setImageModalOpen(true);
              }}
              onOpenBrowserTabs={() => setBrowserTabsModalOpen(true)}
              onToggleWebSearch={() => setIsWebSearchActive((v) => !v)}
              isWebSearchActive={isWebSearchActive}
              onToggleDeepResearch={() => {
                setGrokMode((m) => (m === 'deepsearch' ? 'normal' : 'deepsearch'));
              }}
              isDeepResearchActive={grokMode === 'deepsearch'}
              onOpenSketch={() => setSketchModalOpen(true)}
              onToggleThinkingMode={() => {
                setGrokMode((m) => (m === 'think' ? 'normal' : 'think'));
              }}
              isThinkingModeActive={grokMode === 'think'}
              onOpenGitHub={() => setGitHubModalOpen(true)}
              isGitHubConnected={isGitHubConnected}
              onOpenOpenAI={() => setOpenAiModalOpen(true)}
              isOpenAiConfigured={isOpenAiConfigured}
              onOpenConnectorsHub={() => {
                if (typeof window !== 'undefined' && window.location) {
                  window.location.hash = '#integrations';
                }
              }}
            />
          </div>

          <button
            type="button"
            className="icon-button"
            aria-label="Add source page link"
            onClick={() => setSourceOpen(!sourceOpen)}
          >
            <Link2 size={19} />
          </button>
          <button
            type="button"
            className={`icon-button voice-typing-btn ${dictation.isListening ? 'on-call listening' : ''} ${!dictation.isSupported ? 'unsupported' : ''}`}
            aria-label={
              !dictation.isSupported
                ? 'Voice typing unsupported in this browser'
                : dictation.isListening
                ? 'Stop voice typing'
                : 'Voice typing (dictate message)'
            }
            title={
              !dictation.isSupported
                ? 'Speech recognition is not supported in this browser (supported in Chrome, Edge, Safari)'
                : dictation.isListening
                ? 'Listening… Click to finish voice typing'
                : 'Voice typing (dictate your message)'
            }
            onClick={() => {
              if (!dictation.isSupported) {
                setError(
                  'Speech recognition is not supported in this browser. Please use Chrome, Edge, Safari, or an Android/iOS browser.',
                );
                return;
              }
              void dictation.toggle(draft);
            }}
            disabled={running || paused || !loaded || !contextReady}
          >
            {dictation.isListening ? <Square size={16} fill="currentColor" /> : <Mic size={19} />}
          </button>
          <textarea
            aria-label="Message your Dot"
            placeholder={
              isWebSearchActive
                ? `Search web & message ${dot.name}…`
                : attachments.length > 0
                ? `Ask ${dot.name} about attached file(s)…`
                : `Message ${dot.name}…`
            }
            rows={1}
            value={draft}
            maxLength={4000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (shouldSubmitComposerOnKeyDown(e)) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          {running ? (
            <button
              type="button"
              className="send-button"
              aria-label="Stop response"
              onClick={() => copilotkit.stopAgent({ agent })}
            >
              <Square size={16} />
            </button>
          ) : (
            <button
              className="send-button"
              aria-label="Send message"
              disabled={(!draft.trim() && attachments.length === 0) || !loaded || !contextReady || paused}
            >
              <ArrowUp size={19} />
            </button>
          )}
        </div>
        <div className="chat-compose-note">
          {voiceReady
            ? 'Text and voice, one conversation.'
            : 'Text is ready. Voice needs separate server configuration.'}
        </div>
      </form>
      <ImageModal
        open={imageModalOpen}
        onClose={() => setImageModalOpen(false)}
        initialPrompt={imageModalInitial.prompt}
        initialQuality={imageModalInitial.quality}
        initialAspectRatio={imageModalInitial.aspectRatio}
        onInsertToChat={(md) => void send(md)}
      />
      <SketchModal
        open={sketchModalOpen}
        onClose={() => setSketchModalOpen(false)}
        onAttach={(att) => setAttachments((prev) => [...prev, att])}
      />
      <LibraryModal
        open={libraryModalOpen}
        onClose={() => setLibraryModalOpen(false)}
        onSelect={(att) => setAttachments((prev) => [...prev, att])}
      />
      <BrowserTabsModal
        open={browserTabsModalOpen}
        onClose={() => setBrowserTabsModalOpen(false)}
        onAddTabUrl={(url) => {
          setSource(url);
          setSourceOpen(true);
        }}
      />
      <GitHubConnectModal
        open={gitHubModalOpen}
        onClose={() => setGitHubModalOpen(false)}
        onStatusChange={checkIntegrationsStatus}
      />
      <OpenAiModal
        open={openAiModalOpen}
        onClose={() => setOpenAiModalOpen(false)}
        onStatusChange={checkIntegrationsStatus}
      />
    </div>
  );
}
