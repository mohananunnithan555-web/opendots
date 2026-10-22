import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useVoice, isStopCommand, isEchoOfCaption } from '../src/client/useVoice';
import { CallView } from '../src/client/CallView';

const api = vi.hoisted(() => vi.fn());
vi.mock('../src/client/api', () => ({ api, authHeaders: () => ({}) }));

let mockStopAudio = vi.fn();
let mockAudioOnStart: (() => void) | undefined;
let mockAudioOnEnd: (() => void) | undefined;

vi.mock('../src/client/speech', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    speakWithGemini: vi.fn((_text, onStart, onEnd) => {
      mockAudioOnStart = onStart;
      mockAudioOnEnd = onEnd;
      onStart?.();
      return Promise.resolve({
        cancel: mockStopAudio,
      });
    }),
  };
});

// Mock Speech Recognition
class FakeSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = 'en-US';
  onstart?: () => void;
  onresult?: (event: any) => void;
  onerror?: (event: any) => void;
  onend?: () => void;

  started = false;
  aborted = false;
  abortedByVoice = false;

  static activeInstance: FakeSpeechRecognition | null = null;

  constructor() {
    FakeSpeechRecognition.activeInstance = this;
  }

  start() {
    this.started = true;
    setTimeout(() => {
      this.onstart?.();
    }, 0);
  }

  abort() {
    this.aborted = true;
    setTimeout(() => {
      this.onend?.();
    }, 0);
  }

  simulateSpeech(results: Array<{ transcript: string; isFinal: boolean }>, resultIndex = 0) {
    if (!this.onresult) return;
    const event = {
      resultIndex,
      results: results.map((r) => [{ transcript: r.transcript }]),
    };
    results.forEach((r, idx) => {
      (event.results[idx] as any).isFinal = r.isFinal;
    });
    this.onresult(event);
  }

  simulateEnd() {
    this.onend?.();
  }
}

describe('Voice Interruption & Real-Time Barge-In Suite', () => {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    mockStopAudio = vi.fn();
    mockAudioOnStart = undefined;
    mockAudioOnEnd = undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    FakeSpeechRecognition.activeInstance = null;
  });

  describe('1. Stop Command & Interjection Detection (isStopCommand)', () => {
    it('accurately identifies conversational stop words and phrases', () => {
      expect(isStopCommand('stop')).toBe(true);
      expect(isStopCommand('Stop!')).toBe(true);
      expect(isStopCommand('wait')).toBe(true);
      expect(isStopCommand('hold on')).toBe(true);
      expect(isStopCommand('pause')).toBe(true);
      expect(isStopCommand('quiet')).toBe(true);
      expect(isStopCommand('never mind')).toBe(true);
      expect(isStopCommand('nevermind')).toBe(true);
      expect(isStopCommand('cancel')).toBe(true);
      expect(isStopCommand('stop speaking')).toBe(true);
      expect(isStopCommand('be quiet')).toBe(true);
      expect(isStopCommand('shut up')).toBe(true);
      expect(isStopCommand('hush')).toBe(true);
      expect(isStopCommand('silence')).toBe(true);
      expect(isStopCommand('shh')).toBe(true);
      expect(isStopCommand('wait a second')).toBe(true);
    });

    it('does not classify full queries containing stop words as simple stop commands', () => {
      expect(isStopCommand('Wait, what is the capital of France?')).toBe(false);
      expect(isStopCommand('Stop by the store later')).toBe(false);
      expect(isStopCommand('Can you explain that more simply?')).toBe(false);
      expect(isStopCommand('Tell me about London')).toBe(false);
      expect(isStopCommand('')).toBe(false);
    });
  });

  describe('2. Echo Suppression Filtering (isEchoOfCaption)', () => {
    it('detects verbatim speaker echo matching Dot caption', () => {
      const caption = 'The temperature in San Francisco is sixty-two degrees today.';
      expect(isEchoOfCaption('San Francisco is sixty-two', caption)).toBe(true);
      expect(isEchoOfCaption('sixty-two degrees today', caption)).toBe(true);
    });

    it('never suppresses conversational stop commands even if word appears in caption', () => {
      const caption = 'You can stop anytime by tapping the screen.';
      expect(isEchoOfCaption('stop', caption)).toBe(false);
      expect(isEchoOfCaption('wait', caption)).toBe(false);
    });

    it('does not suppress distinct user interjections or follow-ups', () => {
      const caption = 'The temperature in San Francisco is sixty-two degrees today.';
      expect(isEchoOfCaption('What about London?', caption)).toBe(false);
      expect(isEchoOfCaption('Wait, explain quantum computing', caption)).toBe(false);
    });
  });

  describe('3. Manual Interruption via Button in useVoice', () => {
    let voice: ReturnType<typeof useVoice>;
    let root: ReactTestRenderer;
    const track = { stop: vi.fn(), enabled: true };
    const onTurn = vi.fn();
    const onInterrupt = vi.fn();

    beforeEach(async () => {
      onTurn.mockReset();
      onInterrupt.mockReset();
      vi.stubGlobal('SpeechRecognition', FakeSpeechRecognition);
      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia: async () => ({ getTracks: () => [track] }),
        },
        language: 'en-US',
      });
      vi.stubGlobal('speechSynthesis', {
        cancel: vi.fn(),
        speak: vi.fn(),
        getVoices: () => [],
      });
      api.mockReset().mockResolvedValue({ audio: 'AQID' });

      function TestHook() {
        voice = useVoice('thread-1', () => {}, undefined, onTurn, onInterrupt);
        return null;
      }

      await act(async () => {
        root = create(createElement(TestHook));
      });
    });

    afterEach(async () => {
      await act(async () => {
        root.unmount();
      });
    });

    it('interrupts Dot immediately during speaking and returns to listening', async () => {
      await act(async () => {
        await voice.start(true);
      });
      expect(voice.status).toBe('active');
      expect(voice.phase).toBe('listening');

      // Trigger user question
      onTurn.mockResolvedValue('Here is the full weather report.');
      const rec = FakeSpeechRecognition.activeInstance!;
      rec.simulateSpeech([{ transcript: 'What is the weather?', isFinal: true }]);

      await act(async () => {
        rec.simulateEnd();
      });

      // User speech processed, Dot starts speaking
      expect(voice.phase).toBe('speaking');
      expect(voice.caption).toBe('Here is the full weather report.');

      // Click Interrupt
      await act(async () => {
        voice.interrupt('button');
      });

      expect(voice.phase).toBe('listening');
      expect(voice.caption).toBe('Interrupted. Listening to you…');
      expect(onInterrupt).toHaveBeenCalledTimes(1);
      expect(mockStopAudio).toHaveBeenCalled();
    });

    it('cancels pending answer during thinking phase and invalidates stale response', async () => {
      await act(async () => {
        await voice.start(true);
      });

      let resolveTurn: (reply: string) => void = () => {};
      onTurn.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveTurn = resolve;
          }),
      );

      const rec = FakeSpeechRecognition.activeInstance!;
      rec.simulateSpeech([{ transcript: 'Calculate something heavy', isFinal: true }]);

      await act(async () => {
        rec.simulateEnd();
      });

      expect(voice.phase).toBe('thinking');

      // User interrupts while thinking
      await act(async () => {
        voice.interrupt('button');
      });

      expect(voice.phase).toBe('listening');
      expect(voice.caption).toBe('Interrupted. Listening to you…');

      // Now late response resolves
      await act(async () => {
        resolveTurn('Here is the delayed answer.');
      });

      // Late response MUST be discarded by epoch token
      expect(voice.phase).toBe('listening');
      expect(voice.caption).toBe('Interrupted. Listening to you…');
    });
  });

  describe('4. Real-Time Barge-In by User Speech', () => {
    let voice: ReturnType<typeof useVoice>;
    let root: ReactTestRenderer;
    const track = { stop: vi.fn(), enabled: true };
    const onTurn = vi.fn();
    const onInterrupt = vi.fn();

    beforeEach(async () => {
      onTurn.mockReset();
      onInterrupt.mockReset();
      vi.stubGlobal('SpeechRecognition', FakeSpeechRecognition);
      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia: async () => ({ getTracks: () => [track] }),
        },
        language: 'en-US',
      });
      vi.stubGlobal('speechSynthesis', {
        cancel: vi.fn(),
        speak: vi.fn(),
        getVoices: () => [],
      });
      api.mockReset().mockResolvedValue({ audio: 'AQID' });

      function TestHook() {
        voice = useVoice('thread-1', () => {}, undefined, onTurn, onInterrupt);
        return null;
      }

      await act(async () => {
        root = create(createElement(TestHook));
      });
    });

    afterEach(async () => {
      await act(async () => {
        root.unmount();
      });
    });

    it('triggers barge-in immediately when user speaks while Dot is speaking', async () => {
      await act(async () => {
        await voice.start(true);
      });

      onTurn.mockResolvedValue('The history of ancient Rome began in the 8th century BC.');
      const rec = FakeSpeechRecognition.activeInstance!;
      rec.simulateSpeech([{ transcript: 'Tell me about Rome', isFinal: true }]);

      await act(async () => {
        rec.simulateEnd();
      });

      expect(voice.phase).toBe('speaking');

      // While Dot is speaking, user speaks to interrupt:
      const speakingRec = FakeSpeechRecognition.activeInstance!;
      await act(async () => {
        speakingRec.simulateSpeech([{ transcript: 'Wait, tell me about Greece instead', isFinal: false }]);
      });

      // Barge-in must have halted speech immediately
      expect(voice.phase).toBe('listening');
      expect(voice.caption).toBe('Listening to you…');
      expect(voice.userCaption).toBe('Wait, tell me about Greece instead');
      expect(mockStopAudio).toHaveBeenCalled();
    });

    it('handles conversational stop word as clean stop without firing new model query', async () => {
      await act(async () => {
        await voice.start(true);
      });

      onTurn.mockResolvedValue('Long explanation continues here...');
      const rec = FakeSpeechRecognition.activeInstance!;
      rec.simulateSpeech([{ transcript: 'Start talking', isFinal: true }]);

      await act(async () => {
        rec.simulateEnd();
      });

      expect(voice.phase).toBe('speaking');

      // User says "Stop"
      const speakingRec = FakeSpeechRecognition.activeInstance!;
      await act(async () => {
        speakingRec.simulateSpeech([{ transcript: 'Stop', isFinal: true }]);
        speakingRec.simulateEnd();
      });

      expect(voice.phase).toBe('listening');
      expect(voice.caption).toBe('Stopped. I’m listening to you…');
      // Should not have fired another onTurn for the word "Stop"
      expect(onTurn).toHaveBeenCalledTimes(1);
    });
  });

  describe('5. CallView Interruption Controls UI', () => {
    it('renders prominent Interrupt Dot button during speaking phase', () => {
      const mockInterrupt = vi.fn();
      const mockVoice: any = {
        status: 'active',
        phase: 'speaking',
        caption: 'Dot is answering...',
        userCaption: '',
        startedAt: Date.now() - 5000,
        muted: false,
        speakerMuted: false,
        interrupt: mockInterrupt,
        toggleMute: vi.fn(),
        toggleSpeaker: vi.fn(),
        end: vi.fn(),
      };

      const dot: any = { id: 'dot-1', name: 'OpenDot' };
      let testRenderer: ReactTestRenderer;
      act(() => {
        testRenderer = create(createElement(CallView, { dot, voice: mockVoice }));
      });
      const rootInstance = testRenderer!.root;

      // Find the interrupt action button
      const interruptBtn = rootInstance.findByProps({ className: 'call-interrupt-btn speaking' });
      expect(interruptBtn).toBeDefined();

      act(() => {
        interruptBtn.props.onClick();
      });
      expect(mockInterrupt).toHaveBeenCalledWith('button');
    });

    it('renders Cancel Thinking button during thinking phase', () => {
      const mockInterrupt = vi.fn();
      const mockVoice: any = {
        status: 'active',
        phase: 'thinking',
        caption: '',
        userCaption: 'My question',
        startedAt: Date.now() - 2000,
        muted: false,
        speakerMuted: false,
        interrupt: mockInterrupt,
        toggleMute: vi.fn(),
        toggleSpeaker: vi.fn(),
        end: vi.fn(),
      };

      const dot: any = { id: 'dot-1', name: 'OpenDot' };
      let testRenderer: ReactTestRenderer;
      act(() => {
        testRenderer = create(createElement(CallView, { dot, voice: mockVoice }));
      });
      const rootInstance = testRenderer!.root;

      const cancelBtn = rootInstance.findByProps({ className: 'call-interrupt-btn thinking' });
      expect(cancelBtn).toBeDefined();

      act(() => {
        cancelBtn.props.onClick();
      });
      expect(mockInterrupt).toHaveBeenCalledWith('button');
    });

    it('renders listening indicator during listening phase', () => {
      const mockVoice: any = {
        status: 'active',
        phase: 'listening',
        caption: 'Speak naturally...',
        userCaption: '',
        startedAt: Date.now() - 1000,
        muted: false,
        speakerMuted: false,
        interrupt: vi.fn(),
        toggleMute: vi.fn(),
        toggleSpeaker: vi.fn(),
        end: vi.fn(),
      };

      const dot: any = { id: 'dot-1', name: 'OpenDot' };
      let testRenderer: ReactTestRenderer;
      act(() => {
        testRenderer = create(createElement(CallView, { dot, voice: mockVoice }));
      });
      const rootInstance = testRenderer!.root;

      const indicator = rootInstance.findByProps({ className: 'call-listening-indicator' });
      expect(indicator).toBeDefined();
    });
  });
});
