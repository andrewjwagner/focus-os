import { AI_TASKS, buildPrompt, type AiInput, type AiTask } from "./ai-prompts";
import {
  parseJsonText,
  validateMomentType,
  validateNoteAnalysis,
  validateStringList,
} from "./ai-schema";
import type { AiProviderName } from "./types";

/**
 * Server-only AI calls with plain fetch. Keys come from process.env and are
 * never returned, logged, or sent to the browser.
 */

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5-5";
export const DEFAULT_OPENAI_MODEL = "gpt-5.6";
export const DEFAULT_XAI_MODEL = "grok-4.7";
export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
/** Local models are slower; cloud calls get a shorter budget. */
export const OLLAMA_TIMEOUT_MS = 180_000;
export const CLOUD_TIMEOUT_MS = 60_000;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
/** xAI is OpenAI-compatible Chat Completions. */
const XAI_URL = "https://api.x.ai/v1/chat/completions";

type Env = Record<string, string | undefined>;
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type AiConfig = {
  provider: AiProviderName;
  model: string;
  apiKey: string;
  /** Only for Ollama. */
  baseUrl?: string;
};

/**
 * Detection order: OLLAMA_MODEL (local, most private), then XAI_API_KEY,
 * ANTHROPIC_API_KEY, OPENAI_API_KEY.
 */
export function detectAi(env: Env): AiConfig {
  const override = (env.TEAM_AI_MODEL ?? "").trim();
  const ollamaModel = (env.OLLAMA_MODEL ?? "").trim();
  if (ollamaModel) {
    const baseUrl = ((env.OLLAMA_BASE_URL ?? "").trim() || DEFAULT_OLLAMA_BASE_URL).replace(/\/+$/, "");
    return { provider: "ollama", model: override || ollamaModel, apiKey: "", baseUrl };
  }
  const xai = (env.XAI_API_KEY ?? "").trim();
  if (xai) return { provider: "xai", model: override || DEFAULT_XAI_MODEL, apiKey: xai };
  const anthropic = (env.ANTHROPIC_API_KEY ?? "").trim();
  if (anthropic) {
    return { provider: "anthropic", model: override || DEFAULT_ANTHROPIC_MODEL, apiKey: anthropic };
  }
  const openai = (env.OPENAI_API_KEY ?? "").trim();
  if (openai) return { provider: "openai", model: override || DEFAULT_OPENAI_MODEL, apiKey: openai };
  return { provider: "off", model: "", apiKey: "" };
}

export type OllamaHealth = "ready" | "unreachable" | "model_missing";

/**
 * Cheap local check for the settings indicator: is Ollama running, and is the
 * configured model pulled? Uses GET /api/tags (no note content involved).
 */
export async function checkOllama(
  config: AiConfig,
  fetchImpl: FetchLike = (url, init) => fetch(url, init),
): Promise<OllamaHealth> {
  try {
    const response = await fetchImpl(`${config.baseUrl ?? DEFAULT_OLLAMA_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) return "unreachable";
    const data = (await response.json()) as { models?: { name?: string; model?: string }[] };
    const names = (data.models ?? []).flatMap((entry) => [entry.name, entry.model]).filter(Boolean) as string[];
    const wanted = config.model.includes(":") ? config.model : `${config.model}:latest`;
    return names.some((name) => name === config.model || name === wanted) ? "ready" : "model_missing";
  } catch {
    return "unreachable";
  }
}

export class AiError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`AI provider request failed (${status})`);
    this.status = status;
  }
}

async function callAnthropic(
  config: AiConfig,
  prompt: ReturnType<typeof buildPrompt>,
  fetchImpl: FetchLike,
): Promise<unknown> {
  const response = await fetchImpl(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      system: `${prompt.system}\n\nRespond with only one JSON object that matches this JSON schema, no prose:\n${JSON.stringify(prompt.schema)}`,
      messages: [{ role: "user", content: prompt.user }],
    }),
    signal: AbortSignal.timeout(CLOUD_TIMEOUT_MS),
  });
  if (!response.ok) throw new AiError(response.status);
  const data = (await response.json()) as { content?: { type?: string; text?: string }[] };
  // Read text blocks by type; newer models may also return thinking blocks.
  const text = (data.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
  return parseJsonText(text);
}

function chatUrl(config: AiConfig): string {
  if (config.provider === "xai") return XAI_URL;
  if (config.provider === "ollama") return `${config.baseUrl ?? DEFAULT_OLLAMA_BASE_URL}/v1/chat/completions`;
  return OPENAI_URL;
}

/**
 * OpenAI, xAI, and Ollama share the Chat Completions shape. Cloud providers
 * get strict json_schema output; Ollama gets JSON mode plus the schema in the
 * prompt, since local models follow schemas less reliably.
 */
async function callChatCompletions(
  config: AiConfig,
  prompt: ReturnType<typeof buildPrompt>,
  fetchImpl: FetchLike,
): Promise<unknown> {
  const local = config.provider === "ollama";
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (!local) headers.authorization = `Bearer ${config.apiKey}`;
  const system = local
    ? `${prompt.system}\n\nRespond with only one JSON object that matches this JSON schema, no prose:\n${JSON.stringify(prompt.schema)}`
    : prompt.system;
  const response = await fetchImpl(chatUrl(config), {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt.user },
      ],
      response_format: local
        ? { type: "json_object" }
        : {
            type: "json_schema",
            json_schema: { name: prompt.schemaName, schema: prompt.schema, strict: true },
          },
      ...(local ? { temperature: 0.2 } : {}),
    }),
    signal: AbortSignal.timeout(local ? OLLAMA_TIMEOUT_MS : CLOUD_TIMEOUT_MS),
  });
  if (!response.ok) throw new AiError(response.status);
  const data = (await response.json()) as {
    choices?: { message?: { content?: string | null; refusal?: string | null } }[];
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  return parseJsonText(content);
}

export function validateResult(task: AiTask, raw: unknown): unknown | null {
  if (task === "analyzeNote") return validateNoteAnalysis(raw);
  if (task === "talkingPoints") {
    const points = validateStringList(raw, "points", 1, 5);
    return points ? { points } : null;
  }
  if (task === "coachingPlan") {
    const items = validateStringList(raw, "items", 1, 6);
    return items ? { items } : null;
  }
  const type = validateMomentType(raw);
  return type ? { type } : null;
}

export async function runAiTask<T extends AiTask>(
  task: T,
  input: AiInput[T],
  config: AiConfig,
  fetchImpl: FetchLike = (url, init) => fetch(url, init),
): Promise<unknown | null> {
  if (config.provider === "off") return null;
  const prompt = buildPrompt(task, input);
  // Local models sometimes return weak JSON: validate and retry once.
  const attempts = config.provider === "ollama" ? 2 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const raw =
      config.provider === "anthropic"
        ? await callAnthropic(config, prompt, fetchImpl)
        : await callChatCompletions(config, prompt, fetchImpl);
    const result = validateResult(task, raw);
    if (result) return result;
  }
  return null;
}

// Request parsing with size caps so the route never forwards unbounded input.

function s(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function strings(value: unknown, maxItems: number, maxLength: number): string[] {
  return Array.isArray(value)
    ? value.filter((entry) => typeof entry === "string").slice(0, maxItems).map((entry) => entry.slice(0, maxLength))
    : [];
}

function moments(value: unknown): { date: string; type: string; text: string }[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map((entry) => {
    const data = (entry ?? {}) as Record<string, unknown>;
    return { date: s(data.date, 10), type: s(data.type, 20), text: s(data.text, 400) };
  });
}

function role(value: unknown) {
  return value === "manager" ? "manager" : "direct";
}

export function parseAiRequest(json: unknown): { task: AiTask; input: AiInput[AiTask] } | null {
  const data = (json ?? {}) as Record<string, unknown>;
  const task = data.task as AiTask;
  if (!AI_TASKS.includes(task)) return null;
  const input = (data.input ?? {}) as Record<string, unknown>;
  if (task === "analyzeNote") {
    const content = s(input.content, 12_000);
    if (!content.trim()) return null;
    return {
      task,
      input: {
        selfName: s(input.selfName, 100),
        personName: s(input.personName, 100),
        role: role(input.role),
        title: s(input.title, 200),
        meetingAt: s(input.meetingAt, 40),
        content,
      },
    };
  }
  if (task === "talkingPoints") {
    return {
      task,
      input: {
        selfName: s(input.selfName, 100),
        personName: s(input.personName, 100),
        role: role(input.role),
        theyOwe: strings(input.theyOwe, 15, 300),
        iOwe: strings(input.iOwe, 15, 300),
        lastSummary: s(input.lastSummary, 3000),
        lastTopics: strings(input.lastTopics, 10, 200),
        moments: moments(input.moments),
        pulseChanges: strings(input.pulseChanges, 5, 200),
      },
    };
  }
  if (task === "coachingPlan") {
    return {
      task,
      input: {
        personName: s(input.personName, 100),
        role: role(input.role),
        moments: moments(input.moments),
        themes: strings(input.themes, 10, 80),
        existing: strings(input.existing, 20, 240),
      },
    };
  }
  const text = s(input.text, 1000);
  if (!text.trim()) return null;
  return { task, input: { text, tag: s(input.tag, 40) } };
}
