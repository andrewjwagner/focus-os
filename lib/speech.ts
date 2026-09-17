export type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
      }) => void)
    | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechCtor = new () => SpeechRecognitionLike;

export function getSpeechRecognitionCtor(): SpeechCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechCtor;
    webkitSpeechRecognition?: SpeechCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

export function insertTranscript(
  current: string,
  transcript: string,
  selectionStart: number,
  selectionEnd: number,
): { next: string; caret: number } {
  const spoken = transcript.trim();
  if (!spoken) {
    return { next: current, caret: Math.max(0, selectionStart) };
  }

  const start = Math.max(0, Math.min(selectionStart, current.length));
  const end = Math.max(start, Math.min(selectionEnd, current.length));
  const before = current.slice(0, start);
  const after = current.slice(end);
  const padBefore = before.length > 0 && !/\s$/.test(before) ? " " : "";
  const padAfter = after.length > 0 && !/^\s/.test(after) ? " " : "";
  const inserted = `${padBefore}${spoken}${padAfter}`;
  return {
    next: `${before}${inserted}${after}`,
    caret: before.length + padBefore.length + spoken.length,
  };
}

export function finalTranscriptFromEvent(event: {
  resultIndex: number;
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
}): string {
  const chunks: string[] = [];
  for (let i = event.resultIndex; i < event.results.length; i++) {
    const result = event.results[i];
    if (result?.isFinal && result[0]?.transcript) {
      chunks.push(result[0].transcript);
    }
  }
  return chunks.join(" ").replace(/\s+/g, " ").trim();
}
