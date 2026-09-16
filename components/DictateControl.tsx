"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  finalTranscriptFromEvent,
  getSpeechRecognitionCtor,
  type SpeechRecognitionLike,
} from "@/lib/speech";

function subscribeSpeech() {
  return () => {};
}

function getSpeechSnapshot() {
  return getSpeechRecognitionCtor() !== null;
}

function getSpeechServerSnapshot() {
  return false;
}

export function DictateControl({
  onTranscript,
}: {
  onTranscript: (transcript: string) => void;
}) {
  const supported = useSyncExternalStore(
    subscribeSpeech,
    getSpeechSnapshot,
    getSpeechServerSnapshot,
  );
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    return () => {
      recRef.current?.stop();
    };
  }, []);

  function toggle() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (event) => {
      const spoken = finalTranscriptFromEvent(event);
      if (spoken) onTranscript(spoken);
    };
    rec.onerror = () => {
      setListening(false);
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
      recRef.current = null;
    }
  }

  if (!supported) {
    return (
      <p className="text-xs text-muted">
        Voice input is not available in this browser. Type instead.
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={listening}
      className={`rounded-full px-3 py-1 text-xs ${
        listening
          ? "bg-focus text-bg"
          : "border border-line text-muted hover:text-ink"
      }`}
    >
      {listening ? "Listening" : "Dictate"}
    </button>
  );
}
