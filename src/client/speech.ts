// Browser Speech API helpers for Speech-to-Text and Text-to-Speech

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
    // Chrome bug workaround: speech synthesis can pause if text takes >15s
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
