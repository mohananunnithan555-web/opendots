import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getSpeechRecognition,
  isSpeechRecognitionSupported,
  requestMicrophonePermission,
} from '../src/client/speech';
import { useDictation, type UseDictationReturn } from '../src/client/useDictation';

// Mock Web Speech Recognition Engine
class FakeSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = 'en-US';
  maxAlternatives = 1;
  onstart?: () => void;
  onresult?: (event: any) => void;
  onerror?: (event: any) => void;
  onend?: () => void;

  started = false;
  aborted = false;
  stopped = false;

  static activeInstance: FakeSpeechRecognition | null = null;

  constructor() {
    FakeSpeechRecognition.activeInstance = this;
  }

  start() {
    this.started = true;
    setTimeout(() => {
      this.onstart?.();
    }, 10);
  }

  stop() {
    this.stopped = true;
    setTimeout(() => {
      this.onend?.();
    }, 10);
  }

  abort() {
    this.aborted = true;
    setTimeout(() => {
      this.onend?.();
    }, 10);
  }

  // Test helper to simulate receiving words from microphone
  simulateSpeech(results: Array<{ transcript: string; isFinal: boolean }>, resultIndex = 0) {
    if (!this.onresult) return;
    const event = {
      resultIndex,
      results: results.map((r) => [{ transcript: r.transcript }]),
    };
    // Attach isFinal property to each result item
    results.forEach((r, idx) => {
      (event.results[idx] as any).isFinal = r.isFinal;
    });
    this.onresult(event);
  }

  simulateError(errorName: string) {
    this.onerror?.({ error: errorName });
  }
}

describe('Voice Input & Microphone Dictation Suite', () => {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    FakeSpeechRecognition.activeInstance = null;
  });

  describe('1. Speech API Feature Detection & Permission Verification', () => {
    it('detects when SpeechRecognition or webkitSpeechRecognition is present', () => {
      vi.stubGlobal('SpeechRecognition', FakeSpeechRecognition);
      expect(isSpeechRecognitionSupported()).toBe(true);
      expect(getSpeechRecognition()).toBe(FakeSpeechRecognition);
    });

    it('falls back to webkitSpeechRecognition on Safari and Chromium', () => {
      vi.stubGlobal('SpeechRecognition', undefined);
      vi.stubGlobal('webkitSpeechRecognition', FakeSpeechRecognition);
      expect(isSpeechRecognitionSupported()).toBe(true);
      expect(getSpeechRecognition()).toBe(FakeSpeechRecognition);
    });

    it('gracefully reports unsupported when neither API is available', () => {
      vi.stubGlobal('SpeechRecognition', undefined);
      vi.stubGlobal('webkitSpeechRecognition', undefined);
      expect(isSpeechRecognitionSupported()).toBe(false);
      expect(getSpeechRecognition()).toBeNull();
    });

    it('requestMicrophonePermission grants access and immediately stops tracks to avoid locking hardware', async () => {
      const mockTrack = { stop: vi.fn() };
      const getUserMedia = vi.fn().mockResolvedValue({
        getTracks: () => [mockTrack],
      });

      vi.stubGlobal('navigator', {
        mediaDevices: { getUserMedia },
      });

      const result = await requestMicrophonePermission();
      expect(result.granted).toBe(true);
      expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
      expect(mockTrack.stop).toHaveBeenCalled();
    });

    it('handles NotAllowedError with actionable instructions to enable mic', async () => {
      const deniedErr = new Error('Permission denied');
      deniedErr.name = 'NotAllowedError';
      vi.stubGlobal('navigator', {
        mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(deniedErr) },
      });

      const result = await requestMicrophonePermission();
      expect(result.granted).toBe(false);
      expect(result.error).toContain('Microphone permission was denied');
      expect(result.error).toContain('browser site settings');
    });

    it('handles NotFoundError when device has no microphone plugged in', async () => {
      const notFoundErr = new Error('Device not found');
      notFoundErr.name = 'NotFoundError';
      vi.stubGlobal('navigator', {
        mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(notFoundErr) },
      });

      const result = await requestMicrophonePermission();
      expect(result.granted).toBe(false);
      expect(result.error).toContain('No microphone hardware found');
    });
  });

  describe('2. useDictation Hook & State Machine', () => {
    let dictation: UseDictationReturn;
    let root: ReactTestRenderer;
    let transcriptHistory: string[] = [];
    let lastError: string | null = null;

    function TestDictationComponent({ initialDraft = '' }: { initialDraft?: string }) {
      dictation = useDictation({
        onTranscriptChange: (text) => {
          transcriptHistory.push(text);
        },
        onError: (err) => {
          lastError = err;
        },
      });
      return null;
    }

    beforeEach(() => {
      transcriptHistory = [];
      lastError = null;
      vi.stubGlobal('SpeechRecognition', FakeSpeechRecognition);
      vi.stubGlobal('navigator', {
        language: 'en-US',
        mediaDevices: {
          getUserMedia: async () => ({
            getTracks: () => [{ stop: vi.fn() }],
          }),
        },
      });
      vi.stubGlobal('window', {
        SpeechRecognition: FakeSpeechRecognition,
        speechSynthesis: {
          cancel: vi.fn(),
          speaking: false,
        },
      });
    });

    afterEach(async () => {
      if (root) {
        await act(async () => {
          root.unmount();
        });
      }
    });

    it('initializes in idle state when speech recognition is supported', async () => {
      await act(async () => {
        root = create(createElement(TestDictationComponent));
      });

      expect(dictation.isSupported).toBe(true);
      expect(dictation.status).toBe('idle');
      expect(dictation.isListening).toBe(false);
      expect(dictation.error).toBeNull();
    });

    it('starts listening, configures recognition, and cancels any active TTS', async () => {
      const cancelMock = vi.fn();
      (window as any).speechSynthesis = { cancel: cancelMock, speaking: false };

      await act(async () => {
        root = create(createElement(TestDictationComponent));
      });

      await act(async () => {
        await dictation.start('');
      });

      expect(cancelMock).toHaveBeenCalled();
      expect(FakeSpeechRecognition.activeInstance).not.toBeNull();
      expect(FakeSpeechRecognition.activeInstance?.continuous).toBe(true);
      expect(FakeSpeechRecognition.activeInstance?.interimResults).toBe(true);

      // Advance mock timer for onstart callback
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      expect(dictation.status).toBe('listening');
      expect(dictation.isListening).toBe(true);
    });

    it('prevents catastrophic transcript concatenation and cleanly streams interim and final words', async () => {
      await act(async () => {
        root = create(createElement(TestDictationComponent));
      });

      await act(async () => {
        await dictation.start('Initial thoughts:');
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      const instance = FakeSpeechRecognition.activeInstance!;

      // Interim chunk 1
      await act(async () => {
        instance.simulateSpeech([{ transcript: 'Hello', isFinal: false }]);
      });
      expect(transcriptHistory.at(-1)).toBe('Initial thoughts: Hello');

      // Interim chunk 2 (expanded)
      await act(async () => {
        instance.simulateSpeech([{ transcript: 'Hello world', isFinal: false }]);
      });
      expect(transcriptHistory.at(-1)).toBe('Initial thoughts: Hello world');

      // Finalized chunk
      await act(async () => {
        instance.simulateSpeech([{ transcript: 'Hello world.', isFinal: true }]);
      });
      expect(transcriptHistory.at(-1)).toBe('Initial thoughts: Hello world.');

      // Next phrase starting interim
      await act(async () => {
        instance.simulateSpeech(
          [
            { transcript: 'Hello world.', isFinal: true },
            { transcript: 'How are you', isFinal: false },
          ],
          1,
        );
      });
      // Verification: text is NOT duplicated into "Initial thoughts: Hello Hello world..."
      expect(transcriptHistory.at(-1)).toBe('Initial thoughts: Hello world. How are you');

      // Finalized phrase 2
      await act(async () => {
        instance.simulateSpeech(
          [
            { transcript: 'Hello world.', isFinal: true },
            { transcript: 'How are you today?', isFinal: true },
          ],
          1,
        );
      });
      expect(transcriptHistory.at(-1)).toBe('Initial thoughts: Hello world. How are you today?');
    });

    it('commits final transcript and returns to idle when stopped', async () => {
      await act(async () => {
        root = create(createElement(TestDictationComponent));
      });

      await act(async () => {
        await dictation.start('');
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      const instance = FakeSpeechRecognition.activeInstance!;
      await act(async () => {
        instance.simulateSpeech([{ transcript: 'This is dictated text.', isFinal: true }]);
      });

      await act(async () => {
        dictation.stop();
      });

      expect(dictation.isListening).toBe(false);
      expect(dictation.status).toBe('idle');
      expect(instance.stopped).toBe(true);
      expect(transcriptHistory.at(-1)).toBe('This is dictated text.');
    });

    it('handles not-allowed error from recognition without crashing and surfaces clear error message', async () => {
      await act(async () => {
        root = create(createElement(TestDictationComponent));
      });

      await act(async () => {
        await dictation.start('');
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      const instance = FakeSpeechRecognition.activeInstance!;
      await act(async () => {
        instance.simulateError('not-allowed');
      });

      expect(dictation.status).toBe('error');
      expect(dictation.error).toContain('Microphone permission was denied');
      expect(lastError).toContain('Microphone permission was denied');
    });

    it('ignores benign no-speech timeouts in continuous mode without terminating session', async () => {
      await act(async () => {
        root = create(createElement(TestDictationComponent));
      });

      await act(async () => {
        await dictation.start('');
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      const instance = FakeSpeechRecognition.activeInstance!;
      await act(async () => {
        instance.simulateError('no-speech');
      });

      // Status should remain listening because user paused speaking
      expect(dictation.status).toBe('listening');
      expect(dictation.error).toBeNull();
    });

    it('aborts active recognition cleanly upon component unmount', async () => {
      await act(async () => {
        root = create(createElement(TestDictationComponent));
      });

      await act(async () => {
        await dictation.start('');
      });

      const instance = FakeSpeechRecognition.activeInstance!;

      await act(async () => {
        root.unmount();
      });

      expect(instance.aborted).toBe(true);
    });
  });
});
