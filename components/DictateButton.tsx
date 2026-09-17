"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

type SpeechResultEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

function recognitionCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function subscribe() {
  return () => {};
}

export function appendDictation(current: string, piece: string): string {
  const next = piece.trim();
  if (!next) return current;
  const trimmed = current.trim();
  return trimmed ? `${trimmed} ${next}` : next;
}

export function DictateButton({
  onTranscript,
  disabled,
}: {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}) {
  const supported = useSyncExternalStore(
    subscribe,
    () => Boolean(recognitionCtor()),
    () => false,
  );
  const [listening, setListening] = useState(false);
  const recRef = useRef<Recognition | null>(null);

  useEffect(() => {
    return () => recRef.current?.abort?.();
  }, []);

  if (!supported) return null;

  function toggle() {
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = typeof navigator !== "undefined" ? navigator.language : "en-US";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (event) => {
      const piece = event.results[0]?.[0]?.transcript ?? "";
      if (piece.trim()) onTranscript(piece);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
    };
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={toggle}
      className="rounded-full border border-line px-3 py-1.5 text-xs text-muted hover:text-ink disabled:opacity-50"
    >
      {listening ? "Listening..." : "Dictate"}
    </button>
  );
}
