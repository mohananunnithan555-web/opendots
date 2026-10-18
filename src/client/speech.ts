// Browser Speech & Gemini Neural TTS helpers

import { api } from './api';

export function getSpeechRecognition(): any {
  if (typeof window === 'undefined') return null;
  return (
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition ||
    null
  );
}

export function cleanForSpeech(text: string): string {
  if (!text) return '';
  return text
    .replace(/```[\s\S]*?```/g, ' [code snippet omitted] ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/#+\s+/g, '')
    .replace(/>\s+/g, '')
    .replace(/[-*+]\s+/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\n+/g, ' ')
    .trim();
}

/**
 * High-quality Google Gemini Neural Speech (Aoede / Puck / Kore).
 * Falls back seamlessly to browser speech if offline or rate-limited.
 */
export async function speakWithGemini(
  text: string,
  onStart?: () => void,
  onEnd?: () => void,
): Promise<{ cancel: () => void }> {
  const cleaned = cleanForSpeech(text);
  if (!cleaned) {
    onEnd?.();
    return { cancel: () => {} };
  }

  // Cancel any ongoing browser speech synthesis first
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }

  try {
    const res = await api<{ audio: string; mimeType: string }>(
      '/voice/speak',
      'POST',
      { text: cleaned.slice(0, 2500) },
    );

    if (res?.audio) {
      const audio = new Audio(
        `data:${res.mimeType || 'audio/wav'};base64,${res.audio}`,
      );
      audio.onplay = () => onStart?.();
      audio.onended = () => onEnd?.();
      audio.onerror = () => onEnd?.();
      void audio.play();
      return {
        cancel: () => {
          audio.pause();
          audio.currentTime = 0;
        },
      };
    }
    throw new Error('No audio returned');
  } catch {
    // Graceful fallback to browser speech synthesis
    return speakText(text, onStart, onEnd);
  }
}

export function speakText(
  text: string,
  onStart?: () => void,
  onEnd?: () => void,
): { cancel: () => void } {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    onEnd?.();
    return { cancel: () => {} };
  }

  window.speechSynthesis.cancel();
  const cleaned = cleanForSpeech(text);
  if (!cleaned) {
    onEnd?.();
    return { cancel: () => {} };
  }

  const utterance = new SpeechSynthesisUtterance(cleaned);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;

  // Prefer a natural, friendly sounding English voice if available
  const voices = window.speechSynthesis.getVoices();
  const selectedVoice =
    voices.find(
      (v) =>
        v.lang.startsWith('en') &&
        (v.name.includes('Natural') ||
          v.name.includes('Google') ||
          v.name.includes('Samantha') ||
          v.name.includes('Jenny') ||
          v.name.includes('Aria') ||
          v.name.includes('Guy')),
    ) ||
    voices.find((v) => v.lang.startsWith('en')) ||
    voices[0];

  if (selectedVoice) {
    utterance.voice = selectedVoice;
  }

  let intervalId: any = null;

  utterance.onstart = () => {
    onStart?.();
    intervalId = setInterval(() => {
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.resume();
      }
    }, 5000);
  };

  const cleanup = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };

  utterance.onend = () => {
    cleanup();
    onEnd?.();
  };

  utterance.onerror = () => {
    cleanup();
    onEnd?.();
  };

  window.speechSynthesis.speak(utterance);

  return {
    cancel: () => {
      cleanup();
      window.speechSynthesis.cancel();
    },
  };
}
