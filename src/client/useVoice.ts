import { useCallback, useEffect, useRef, useState } from 'react';
import { api, authHeaders } from './api';
import { getSpeechRecognition, speakWithGemini, speakText } from './speech';

// A single failed control poll is usually a network flap, not a dead call.
const CONTROL_POLL_FAILURE_LIMIT = 3;

const AUDIO_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
};

export function isStopCommand(text: string): boolean {
  if (!text) return false;
  const normalized = text.trim().toLowerCase().replace(/[.,!?;:]/g, '');
  const stopPhrases = [
    'stop',
    'wait',
    'hold on',
    'pause',
    'quiet',
    'never mind',
    'nevermind',
    'cancel',
    'stop speaking',
    'stop talking',
    'be quiet',
    'shut up',
    'hush',
    'silence',
    'shh',
    'hold up',
    'stop it',
    'wait a minute',
    'wait a second',
    'hang on',
  ];
  return stopPhrases.includes(normalized);
}

export function isEchoOfCaption(transcript: string, caption: string): boolean {
  if (!transcript || !caption) return false;
  const t = transcript.toLowerCase().replace(/[^\w\s]/g, '').trim();
  const c = caption.toLowerCase().replace(/[^\w\s]/g, '').trim();
  if (!t || !c) return false;
  if (isStopCommand(transcript)) {
    return false;
  }
  const tWords = t.split(/\s+/);
  if (tWords.length >= 2 && c.includes(t)) {
    return true;
  }
  return false;
}

type VoiceSession =
  | {
      mode: 'webrtc';
      pc: RTCPeerConnection;
      stream: MediaStream;
      audio: HTMLAudioElement;
      id?: string;
      channel: RTCDataChannel;
      transcript: string[];
      timer?: ReturnType<typeof setTimeout>;
      controlPollFailures: number;
      disconnectTimer?: ReturnType<typeof setTimeout>;
      cancelled: boolean;
    }
  | {
      mode: 'browser';
      recognition?: any;
      stream?: MediaStream;
      transcript: string[];
      cancelled: boolean;
      stopAudio?: () => void;
      timer?: ReturnType<typeof setTimeout>;
      restartListening?: () => void;
    };

export function useVoice(
  threadId: string,
  onSaved: () => void,
  anchorMessageId?: string,
  onTurn?: (request: string) => Promise<string>,
  onInterrupt?: () => void,
) {
  const [status, setStatus] = useState<
    'idle' | 'connecting' | 'active' | 'ending'
  >('idle');
  const generation = useRef(0);
  const connecting = useRef(false);
  const ending = useRef(false);
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(false);
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const [startedAt, setStartedAt] = useState<number>();
  const [phase, setPhase] = useState<'listening' | 'speaking' | 'thinking'>(
    'listening',
  );
  const [caption, setCaption] = useState('');
  const [userCaption, setUserCaption] = useState('');
  const session = useRef<VoiceSession | undefined>(undefined);
  const anchor = useRef(anchorMessageId);
  anchor.current = anchorMessageId;

  const turnEpoch = useRef(0);
  const phaseRef = useRef<'listening' | 'speaking' | 'thinking'>('listening');
  const activeCaptionRef = useRef('');
  activeCaptionRef.current = caption;

  const updatePhase = useCallback(
    (next: 'listening' | 'speaking' | 'thinking') => {
      phaseRef.current = next;
      setPhase(next);
    },
    [],
  );

  const closeMedia = useCallback(() => {
    turnEpoch.current++;
    const current = session.current;
    if (!current) return;
    current.cancelled = true;
    if (current.mode === 'webrtc') {
      current.stream.getTracks().forEach((track) => track.stop());
      try {
        current.channel.close();
      } catch {}
      try {
        current.pc.close();
      } catch {}
      current.audio.pause();
      current.audio.srcObject = null;
      clearTimeout(current.timer);
      clearTimeout(current.disconnectTimer);
    } else {
      current.stream?.getTracks().forEach((track) => track.stop());
      try {
        current.recognition?.abort();
      } catch {}
      current.stopAudio?.();
      current.stopAudio = undefined;
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        try {
          window.speechSynthesis.cancel();
        } catch {}
      }
      clearTimeout(current.timer);
    }
  }, []);

  const end = useCallback(async () => {
    if (ending.current) return;
    generation.current++;
    turnEpoch.current++;
    connecting.current = false;
    const current = session.current;
    if (!current) {
      setStatus('idle');
      return;
    }
    current.cancelled = true;
    if (current.mode === 'webrtc') {
      current.stream.getTracks().forEach((track) => {
        track.enabled = false;
      });
      current.audio.pause();
      clearTimeout(current.timer);
      clearTimeout(current.disconnectTimer);
    } else {
      try {
        current.recognition?.abort();
      } catch {}
      current.stopAudio?.();
      current.stopAudio = undefined;
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        try {
          window.speechSynthesis.cancel();
        } catch {}
      }
      clearTimeout(current.timer);
    }
    ending.current = true;
    setStatus('ending');
    try {
      if (current.mode === 'webrtc' && current.id) {
        await api(`/voice/calls/${current.id}/end`, 'POST', {
          transcript: current.transcript.join('\n').slice(0, 20000),
          anchorMessageId: anchor.current,
        });
      }
      onSaved();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Call ended, but its receipt could not be saved.',
      );
    } finally {
      closeMedia();
      session.current = undefined;
      ending.current = false;
      setStatus('idle');
    }
  }, [closeMedia, onSaved]);

  const interrupt = useCallback(
    (reason: 'button' | 'barge-in' | 'command' = 'button') => {
      turnEpoch.current++;
      const current = session.current;
      if (!current || current.cancelled) return;

      if (current.mode === 'browser') {
        current.stopAudio?.();
        current.stopAudio = undefined;
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          try {
            window.speechSynthesis.cancel();
          } catch {}
        }
        if (current.recognition) {
          current.recognition.abortedByVoice = true;
          try {
            current.recognition.abort();
          } catch {}
          current.recognition = undefined;
        }
      } else if (current.mode === 'webrtc') {
        try {
          current.audio.pause();
          current.audio.currentTime = 0;
        } catch {}
        if (current.channel && current.channel.readyState === 'open') {
          try {
            current.channel.send(JSON.stringify({ type: 'response.cancel' }));
          } catch {}
        }
      }

      onInterrupt?.();
      updatePhase('listening');

      if (reason === 'button') {
        setCaption('Interrupted. Listening to you…');
        setUserCaption('');
      } else if (reason === 'command') {
        setCaption('Stopped. I’m listening to you…');
        setUserCaption('');
      } else if (reason === 'barge-in') {
        setCaption('Listening to you…');
      }

      if (current.mode === 'browser' && !muted) {
        current.restartListening?.();
      }
    },
    [muted, onInterrupt, updatePhase],
  );

  useEffect(
    () => () => {
      generation.current++;
      const current = session.current;
      closeMedia();
      if (current && current.mode === 'webrtc' && current.id && !ending.current)
        void fetch(`/api/voice/calls/${current.id}/end`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({
            transcript: current.transcript.join('\n').slice(0, 20000),
            anchorMessageId: anchor.current,
          }),
          keepalive: true,
        }).catch(() => {});
    },
    [closeMedia],
  );

  useEffect(() => {
    if (status !== 'active' && status !== 'connecting') return;
    const current = session.current;
    if (!current || current.mode !== 'webrtc') return;

    const timer = setInterval(() => {
      const activeCurrent = session.current;
      if (!activeCurrent || activeCurrent.mode !== 'webrtc') return;
      const id = activeCurrent.id;
      if (id)
        void api<{ endedAt: number | null }>(`/voice/calls/${id}`)
          .then((call) => {
            if (session.current !== activeCurrent) return;
            if (call.endedAt) {
              void end();
              return;
            }
            activeCurrent.controlPollFailures = 0;
          })
          .catch(() => {
            if (session.current !== activeCurrent) return;
            activeCurrent.controlPollFailures += 1;
            if (activeCurrent.controlPollFailures < CONTROL_POLL_FAILURE_LIMIT)
              return;
            setError('Call control connection was lost.');
            void end();
          });
    }, 2000);
    return () => clearInterval(timer);
  }, [status, closeMedia, onSaved, end]);

  const startBrowserCall = async (attempt: number) => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      setError(
        'Speech Recognition is not supported in this browser. Please use Google Chrome, Microsoft Edge, or Safari.',
      );
      setStatus('idle');
      connecting.current = false;
      return;
    }

    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS);
    } catch {
      setError('Microphone permission was denied. Please allow microphone access.');
      setStatus('idle');
      connecting.current = false;
      return;
    }

    if (attempt !== generation.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    const current: VoiceSession = {
      mode: 'browser',
      transcript: [],
      cancelled: false,
      stream,
    };
    session.current = current;

    setStatus('active');
    setStartedAt(Date.now());
    updatePhase('listening');
    setError('');
    setCaption('Speak naturally. Your Dot is listening…');
    activeCaptionRef.current = '';
    setUserCaption('');

    current.timer = setTimeout(() => void end(), 15 * 60_000);

    const listenLoop = () => {
      if (current.cancelled || session.current !== current) return;
      if (muted) return;

      const SpeechRecognitionClass = getSpeechRecognition();
      if (!SpeechRecognitionClass) return;

      if (current.recognition) {
        current.recognition.abortedByVoice = true;
        try {
          current.recognition.abort();
        } catch {}
        current.recognition = undefined;
      }

      const recognition = new SpeechRecognitionClass();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = navigator.language || 'en-US';
      current.recognition = recognition;

      let finalCaptured = '';
      let interimCaptured = '';

      recognition.onresult = (event: any) => {
        if (current.cancelled || session.current !== current || recognition.abortedByVoice) return;
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          if (res.isFinal) {
            finalCaptured += res[0].transcript;
          } else {
            interim += res[0].transcript;
          }
        }
        interimCaptured = interim;
        const currentSpoken = (finalCaptured || interim).trim();

        // Real-time barge-in detection while Dot is speaking or thinking
        if (phaseRef.current === 'speaking' || phaseRef.current === 'thinking') {
          if (currentSpoken && !isEchoOfCaption(currentSpoken, activeCaptionRef.current)) {
            if (isStopCommand(currentSpoken)) {
              interrupt('command');
            } else {
              // Instantly halt audio and switch to listening
              interrupt('barge-in');
              setUserCaption(currentSpoken);
            }
            return;
          }
        }

        setUserCaption(currentSpoken);
      };

      recognition.onerror = (event: any) => {
        if (current.cancelled || session.current !== current || recognition.abortedByVoice) return;
        if (event.error === 'no-speech') {
          setTimeout(() => {
            if (!current.cancelled && session.current === current && !muted) {
              listenLoop();
            }
          }, 200);
          return;
        }
        if (event.error === 'not-allowed') {
          setError('Microphone access was blocked.');
          void end();
          return;
        }
        // If aborted or transient error, retry unless cancelled
        setTimeout(() => {
          if (
            !current.cancelled &&
            session.current === current &&
            !muted &&
            phaseRef.current !== 'speaking'
          ) {
            listenLoop();
          }
        }, 500);
      };

      recognition.onend = async () => {
        if (
          current.cancelled ||
          session.current !== current ||
          recognition.abortedByVoice ||
          current.recognition !== recognition
        ) {
          return;
        }

        // If Dot is still speaking, keep recognition active to catch future barge-in
        if (phaseRef.current === 'speaking') {
          setTimeout(() => {
            if (
              !current.cancelled &&
              session.current === current &&
              phaseRef.current === 'speaking' &&
              !muted
            ) {
              listenLoop();
            }
          }, 150);
          return;
        }

        const query = (finalCaptured || interimCaptured).trim();
        finalCaptured = '';
        interimCaptured = '';
        if (!query) {
          listenLoop();
          return;
        }

        // Conversational interjection check: "stop", "wait", "hold on", "cancel"
        if (isStopCommand(query)) {
          interrupt('command');
          setTimeout(() => {
            if (!current.cancelled && session.current === current && !muted) {
              listenLoop();
            }
          }, 300);
          return;
        }

        // Genuine turn
        const thisTurnEpoch = ++turnEpoch.current;
        current.transcript.push(`User: ${query}`);
        updatePhase('thinking');

        // Keep recognition ready while thinking so user can cancel or barge-in
        setTimeout(() => {
          if (
            !current.cancelled &&
            session.current === current &&
            phaseRef.current === 'thinking' &&
            !muted
          ) {
            listenLoop();
          }
        }, 100);

        try {
          if (!onTurn) throw new Error('Turn handler unavailable.');
          const reply = await onTurn(query);
          if (
            current.cancelled ||
            session.current !== current ||
            turnEpoch.current !== thisTurnEpoch
          ) {
            return;
          }

          current.transcript.push(`Dot: ${reply}`);
          setCaption(reply);
          activeCaptionRef.current = reply;
          updatePhase('speaking');

          // Keep recognition active during speaking for real-time barge-in
          setTimeout(() => {
            if (
              !current.cancelled &&
              session.current === current &&
              phaseRef.current === 'speaking' &&
              !muted
            ) {
              listenLoop();
            }
          }, 100);

          const speech = await speakWithGemini(
            reply,
            () => {
              if (!current.cancelled && turnEpoch.current === thisTurnEpoch) {
                updatePhase('speaking');
              }
            },
            () => {
              if (
                !current.cancelled &&
                session.current === current &&
                turnEpoch.current === thisTurnEpoch
              ) {
                updatePhase('listening');
                setUserCaption('');
                setCaption('Speak naturally. Your Dot is listening…');
                activeCaptionRef.current = '';
                listenLoop();
              }
            },
          );
          current.stopAudio = speech.cancel;
        } catch (err) {
          if (current.cancelled || turnEpoch.current !== thisTurnEpoch) return;
          setError(
            err instanceof Error ? err.message : 'Error processing speech.',
          );
          updatePhase('listening');
          setTimeout(() => {
            if (!current.cancelled && session.current === current && !muted) {
              listenLoop();
            }
          }, 1500);
        }
      };

      try {
        recognition.start();
      } catch {
        setTimeout(() => {
          if (!current.cancelled && session.current === current && !muted) {
            listenLoop();
          }
        }, 400);
      }
    };

    current.restartListening = listenLoop;
    listenLoop();
  };

  const start = async (preferBrowser = true) => {
    if (session.current || connecting.current || ending.current) return;
    connecting.current = true;
    const attempt = ++generation.current;
    setStatus('connecting');
    setError('');
    setMuted(false);
    setSpeakerMuted(false);
    setStartedAt(undefined);
    updatePhase('listening');
    setCaption('');
    activeCaptionRef.current = '';
    setUserCaption('');

    // If caller explicitly prefers free browser mode or if WebRTC is bypassed
    if (preferBrowser && onTurn) {
      await startBrowserCall(attempt);
      return;
    }

    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS);
      if (attempt !== generation.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const pc = new RTCPeerConnection();
      const audio = new Audio();
      audio.autoplay = true;
      const channel = pc.createDataChannel('oai-events');
      const current: VoiceSession = {
        mode: 'webrtc',
        pc,
        audio,
        stream,
        channel,
        transcript: [],
        cancelled: false,
        id: undefined,
        timer: undefined,
        controlPollFailures: 0,
        disconnectTimer: undefined,
      };
      session.current = current;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream!));
      pc.ontrack = (event) => {
        if (current.cancelled) return;
        audio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
        void audio.play().catch(() => {
          if (!current.cancelled)
            setError(
              'Audio playback was blocked. Check your browser audio permissions.',
            );
        });
      };
      pc.onconnectionstatechange = () => {
        if (current.cancelled) return;
        if (pc.connectionState === 'connected') {
          clearTimeout(current.disconnectTimer);
          current.disconnectTimer = undefined;
          setStatus('active');
          setStartedAt((value) => value ?? Date.now());
          if (current.id)
            void api(`/voice/calls/${current.id}/active`, 'POST', {}).catch(
              (e) => {
                if (!current.cancelled) setError(e.message);
              },
            );
        }
        if (pc.connectionState === 'disconnected' && !current.disconnectTimer) {
          current.disconnectTimer = setTimeout(() => {
            current.disconnectTimer = undefined;
            if (current.cancelled || pc.connectionState !== 'disconnected')
              return;
            setError('The voice connection dropped.');
            void end();
          }, 5000);
        }
        if (pc.connectionState === 'failed') {
          setError('The voice connection dropped.');
          void end();
        }
      };
      channel.onmessage = async (event) => {
        if (current.cancelled) return;
        let data: Record<string, unknown>;
        try {
          const parsed: unknown = JSON.parse(String(event.data));
          if (!parsed || typeof parsed !== 'object') return;
          data = parsed as Record<string, unknown>;
        } catch {
          return;
        }
        if (
          data.type === 'response.audio_transcript.delta' ||
          data.type === 'response.output_audio_transcript.delta'
        ) {
          updatePhase('speaking');
          setCaption((value) => `${value}${String(data.delta ?? '')}`);
        }
        if (data.type === 'input_audio_buffer.speech_started') {
          if (current.mode === 'webrtc') {
            try {
              current.audio.pause();
              current.audio.currentTime = 0;
            } catch {}
          }
          updatePhase('listening');
          setCaption('');
        }
        if (
          data.type ===
            'conversation.item.input_audio_transcription.completed' &&
          typeof data.transcript === 'string'
        ) {
          current.transcript.push(`You: ${data.transcript}`);
          setUserCaption(data.transcript);
        }
        if (
          data.type === 'response.audio.done' ||
          data.type === 'response.output_audio_transcript.done'
        ) {
          updatePhase('listening');
          if (typeof data.transcript === 'string')
            current.transcript.push(`Dot: ${data.transcript}`);
        }
        if (data.type === 'error')
          setError(
            'The voice provider reported a session error. End the call and retry.',
          );
        if (
          data.type !== 'response.function_call_arguments.done' ||
          data.name !== 'ask_compute' ||
          typeof data.call_id !== 'string' ||
          !current.id
        )
          return;
        let output: string;
        updatePhase('thinking');
        try {
          const args: unknown = JSON.parse(String(data.arguments));
          if (
            !args ||
            typeof args !== 'object' ||
            !('request' in args) ||
            typeof args.request !== 'string'
          )
            throw new Error('Invalid compute request.');
          const result = await api<{ text: string }>(
            `/voice/calls/${current.id}/compute`,
            'POST',
            {
              toolCallId: data.call_id,
              request: args.request,
              transcript: current.transcript.join('\n').slice(-12000),
            },
          );
          output = result.text;
        } catch (e) {
          output = `Compute failed: ${e instanceof Error ? e.message : 'Unknown error'}`;
        }
        if (!current.cancelled && channel.readyState === 'open') {
          channel.send(
            JSON.stringify({
              type: 'conversation.item.create',
              item: {
                type: 'function_call_output',
                call_id: data.call_id,
                output,
              },
            }),
          );
          channel.send(JSON.stringify({ type: 'response.create' }));
        }
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const response = await api<{ id: string; sdp: string }>(
        '/voice/calls',
        'POST',
        { threadId, sdp: offer.sdp },
      );
      current.id = response.id;
      if (current.cancelled) {
        await api(`/voice/calls/${response.id}/end`, 'POST', {
          transcript: '',
        });
        return;
      }
      await pc.setRemoteDescription({ type: 'answer', sdp: response.sdp });
      if (current.cancelled) return;
      current.timer = setTimeout(() => void end(), 15 * 60_000);
    } catch (e) {
      if (attempt !== generation.current) {
        stream?.getTracks().forEach((track) => track.stop());
        return;
      }
      // If WebRTC fails (e.g. OpenAI 404/quota) and we have onTurn, seamlessly fallback to browser voice!
      if (onTurn) {
        closeMedia();
        session.current = undefined;
        await startBrowserCall(attempt);
        return;
      }
      const current = session.current;
      const id = current && current.mode === 'webrtc' ? current.id : undefined;
      if (id)
        void api(`/voice/calls/${id}/end`, 'POST', {
          transcript: '',
          anchorMessageId: anchor.current,
        }).catch(() => {});
      stream?.getTracks().forEach((track) => track.stop());
      closeMedia();
      session.current = undefined;
      setStatus('idle');
      setError(e instanceof Error ? e.message : 'Could not connect the call.');
    } finally {
      if (attempt === generation.current && (session.current as any)?.mode !== 'browser') {
        connecting.current = false;
      }
    }
  };

  const toggleMute = () => {
    const next = !muted;
    const current = session.current;
    if (current) {
      if (current.mode === 'webrtc') {
        current.stream.getAudioTracks().forEach((track) => {
          track.enabled = !next;
        });
      } else {
        if (next) {
          try {
            current.recognition?.abort();
          } catch {}
        } else {
          current.restartListening?.();
        }
      }
    }
    setMuted(next);
  };

  const toggleSpeaker = () => {
    const next = !speakerMuted;
    const current = session.current;
    if (current) {
      if (current.mode === 'webrtc') {
        current.audio.muted = next;
      } else {
        if (next) {
          current.stopAudio?.();
          current.stopAudio = undefined;
          if (typeof window !== 'undefined' && window.speechSynthesis) {
            try {
              window.speechSynthesis.cancel();
            } catch {}
          }
        }
      }
    }
    setSpeakerMuted(next);
  };

  return {
    status,
    error,
    start,
    end,
    interrupt,
    muted,
    speakerMuted,
    startedAt,
    phase,
    caption,
    userCaption,
    toggleMute,
    toggleSpeaker,
  };
}
