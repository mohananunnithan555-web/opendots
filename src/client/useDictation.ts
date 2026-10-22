import { useState, useRef, useEffect, useCallback } from 'react';
import {
  getSpeechRecognition,
  isSpeechRecognitionSupported,
  requestMicrophonePermission,
} from './speech';

export type DictationStatus =
  | 'idle'
  | 'requesting-permission'
  | 'listening'
  | 'processing'
  | 'error'
  | 'unsupported';

export interface UseDictationOptions {
  onTranscriptChange: (text: string, isFinal: boolean) => void;
  onError?: (errorMessage: string) => void;
  lang?: string;
}

export interface UseDictationReturn {
  status: DictationStatus;
  isListening: boolean;
  isSupported: boolean;
  error: string | null;
  interimSnippet: string;
  start: (currentDraft: string) => Promise<void>;
  stop: () => void;
  toggle: (currentDraft: string) => Promise<void>;
  clearError: () => void;
}

/**
 * Robust Web Speech API Dictation Hook for OpenDots Chat.
 * Prevents transcript duplication, manages interim and final speech results,
 * verifies microphone permissions, and recovers from silence/network errors.
 */
export function useDictation({
  onTranscriptChange,
  onError,
  lang,
}: UseDictationOptions): UseDictationReturn {
  const [status, setStatus] = useState<DictationStatus>(() =>
    isSpeechRecognitionSupported() ? 'idle' : 'unsupported',
  );
  const [error, setError] = useState<string | null>(null);
  const [interimSnippet, setInterimSnippet] = useState<string>('');

  const recognitionRef = useRef<any>(null);
  const shouldListenRef = useRef(false);
  const baseTextRef = useRef('');
  const finalizedTextRef = useRef('');
  const interimSnippetRef = useRef('');
  const sessionEpochRef = useRef(0);

  const onTranscriptChangeRef = useRef(onTranscriptChange);
  onTranscriptChangeRef.current = onTranscriptChange;

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const isSupported = isSpeechRecognitionSupported();

  const clearError = useCallback(() => {
    setError(null);
    if (status === 'error') {
      setStatus(isSupported ? 'idle' : 'unsupported');
    }
  }, [status, isSupported]);

  const assembleTranscript = useCallback((): string => {
    const parts = [
      baseTextRef.current.trim(),
      finalizedTextRef.current.trim(),
      interimSnippetRef.current.trim(),
    ].filter(Boolean);
    return parts.join(' ').trim();
  }, []);

  const stop = useCallback(() => {
    shouldListenRef.current = false;
    sessionEpochRef.current += 1;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }

    setInterimSnippet('');
    interimSnippetRef.current = '';

    // Finalize whatever text was captured
    const finalTranscript = [
      baseTextRef.current.trim(),
      finalizedTextRef.current.trim(),
    ]
      .filter(Boolean)
      .join(' ')
      .trim();

    onTranscriptChangeRef.current(finalTranscript, true);
    setStatus('idle');
  }, []);

  const start = useCallback(
    async (currentDraft: string) => {
      if (!isSupported) {
        const msg =
          'Speech recognition is not supported in this browser. Please use Google Chrome, Microsoft Edge, or Safari.';
        setStatus('unsupported');
        setError(msg);
        onErrorRef.current?.(msg);
        return;
      }

      // Stop any existing session first
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }

      // Stop any active speech synthesis (TTS) so mic doesn't record speaker audio
      const synth =
        (typeof window !== 'undefined' && window.speechSynthesis) ||
        (typeof globalThis !== 'undefined' && (globalThis as any).speechSynthesis);
      if (synth) {
        try {
          synth.cancel();
        } catch {}
      }

      setError(null);
      setStatus('requesting-permission');
      shouldListenRef.current = true;
      const currentEpoch = ++sessionEpochRef.current;

      // 1. Verify / Request browser microphone permission
      const perm = await requestMicrophonePermission();
      if (!perm.granted) {
        if (currentEpoch !== sessionEpochRef.current) return;
        shouldListenRef.current = false;
        setStatus('error');
        setError(perm.error || 'Microphone access denied.');
        onErrorRef.current?.(perm.error || 'Microphone access denied.');
        return;
      }

      if (currentEpoch !== sessionEpochRef.current || !shouldListenRef.current) {
        return;
      }

      // 2. Set up base text and accumulators
      baseTextRef.current = (currentDraft || '').trim();
      finalizedTextRef.current = '';
      interimSnippetRef.current = '';
      setInterimSnippet('');

      // 3. Instantiate SpeechRecognition
      const SpeechRecognition = getSpeechRecognition();
      if (!SpeechRecognition) {
        setStatus('unsupported');
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.lang = lang || (typeof navigator !== 'undefined' ? navigator.language : 'en-US') || 'en-US';

      recognition.onstart = () => {
        if (currentEpoch !== sessionEpochRef.current) return;
        setStatus('listening');
        setError(null);
      };

      recognition.onresult = (event: any) => {
        if (currentEpoch !== sessionEpochRef.current || !shouldListenRef.current) return;

        let newlyFinalized = '';
        let currentInterim = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0]?.transcript || '';
          if (result.isFinal) {
            newlyFinalized += (newlyFinalized ? ' ' : '') + transcript.trim();
          } else {
            currentInterim += transcript;
          }
        }

        if (newlyFinalized) {
          finalizedTextRef.current = finalizedTextRef.current
            ? `${finalizedTextRef.current} ${newlyFinalized}`.trim()
            : newlyFinalized.trim();
        }

        interimSnippetRef.current = currentInterim.trim();
        setInterimSnippet(currentInterim.trim());

        const fullText = assembleTranscript();
        onTranscriptChangeRef.current(fullText, false);
      };

      recognition.onerror = (event: any) => {
        if (currentEpoch !== sessionEpochRef.current) return;
        const err = event?.error;

        // No-speech event is just a brief silent pause in continuous dictation; ignore
        if (err === 'no-speech') {
          return;
        }

        // Aborted usually means clean stop
        if (err === 'aborted') {
          return;
        }

        let userMsg = 'Voice dictation encountered an error.';
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          userMsg =
            'Microphone permission was denied. Please allow microphone access in your browser address bar.';
          shouldListenRef.current = false;
          setStatus('error');
        } else if (err === 'audio-capture') {
          userMsg =
            'No microphone detected or audio capture failed. Please check your microphone hardware.';
          shouldListenRef.current = false;
          setStatus('error');
        } else if (err === 'network') {
          userMsg =
            'Speech recognition network error. Please verify your internet connection.';
          shouldListenRef.current = false;
          setStatus('error');
        } else if (err === 'language-not-supported') {
          userMsg = `The selected language (${recognition.lang}) is not supported for speech recognition.`;
          shouldListenRef.current = false;
          setStatus('error');
        } else {
          userMsg = `Voice recognition error: ${err || 'unknown'}`;
          shouldListenRef.current = false;
          setStatus('error');
        }

        setError(userMsg);
        onErrorRef.current?.(userMsg);
      };

      recognition.onend = () => {
        if (currentEpoch !== sessionEpochRef.current) return;

        // If the user hasn't explicitly stopped listening, automatically keep continuous listening alive
        if (shouldListenRef.current) {
          try {
            recognition.start();
            return;
          } catch {
            // Settle to idle if restart fails
          }
        }

        shouldListenRef.current = false;
        setInterimSnippet('');
        interimSnippetRef.current = '';

        const finalTranscript = [
          baseTextRef.current.trim(),
          finalizedTextRef.current.trim(),
        ]
          .filter(Boolean)
          .join(' ')
          .trim();

        onTranscriptChangeRef.current(finalTranscript, true);
        setStatus('idle');
      };

      try {
        recognition.start();
        recognitionRef.current = recognition;
      } catch (e) {
        shouldListenRef.current = false;
        setStatus('error');
        const errText =
          e instanceof Error ? e.message : 'Could not start speech recognition.';
        setError(errText);
        onErrorRef.current?.(errText);
      }
    },
    [isSupported, lang, assembleTranscript],
  );

  const toggle = useCallback(
    async (currentDraft: string) => {
      if (status === 'listening' || status === 'requesting-permission') {
        stop();
      } else {
        await start(currentDraft);
      }
    },
    [status, stop, start],
  );

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      sessionEpochRef.current += 1;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }
    };
  }, []);

  return {
    status,
    isListening: status === 'listening',
    isSupported,
    error,
    interimSnippet,
    start,
    stop,
    toggle,
    clearError,
  };
}
