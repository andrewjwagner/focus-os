import type { AiInput, AiTask } from "./ai-prompts";
import type { AiProviderName, NoteAnalysis } from "./types";

/**
 * Browser side of the AI route. Never holds a key; returns null when AI is
 * off or fails so callers fall back to rules.
 */

export type AiStatus = {
  provider: AiProviderName;
  model: string;
  /** Ollama only. */
  health?: "ready" | "unreachable" | "model_missing";
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export async function fetchAiStatus(fetchImpl: FetchLike = fetch): Promise<AiStatus> {
  try {
    const response = await fetchImpl("/api/team/ai");
    const data = (await response.json()) as { provider?: AiProviderName; model?: string; health?: AiStatus["health"] };
    return { provider: data.provider ?? "off", model: data.model ?? "", ...(data.health ? { health: data.health } : {}) };
  } catch {
    return { provider: "off", model: "" };
  }
}

type AiOutput = {
  analyzeNote: NoteAnalysis;
  talkingPoints: { points: string[] };
  coachingPlan: { items: string[] };
  classifyMoment: { type: "win" | "issue" | "coaching" | "note" };
};

export async function runAi<T extends AiTask>(
  task: T,
  input: AiInput[T],
  fetchImpl: FetchLike = fetch,
): Promise<{ provider: AiProviderName; result: AiOutput[T] } | null> {
  try {
    const response = await fetchImpl("/api/team/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task, input }),
    });
    const data = (await response.json()) as {
      ok?: boolean;
      provider?: AiProviderName;
      result?: AiOutput[T];
    };
    if (!data.ok || !data.result) return null;
    return { provider: data.provider ?? "off", result: data.result };
  } catch {
    return null;
  }
}

export const AI_LABELS: Record<AiProviderName, string> = {
  ollama: "Ollama (local)",
  xai: "xAI",
  anthropic: "Anthropic",
  openai: "OpenAI",
  off: "off",
};

/** Summary to send: markdown or text, transcript excerpt only when both are empty. */
export function noteContentForAi(note: {
  summaryMarkdown: string;
  summaryText: string;
  transcript: { speaker: string; text: string }[] | null;
}): string {
  const summary = (note.summaryMarkdown || note.summaryText || "").trim();
  if (summary) return summary;
  return (note.transcript ?? [])
    .map((line) => `${line.speaker || "speaker"}: ${line.text}`)
    .join("\n")
    .slice(0, 12_000);
}
