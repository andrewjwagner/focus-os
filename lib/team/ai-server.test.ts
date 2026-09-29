import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_XAI_MODEL,
  checkOllama,
  detectAi,
  parseAiRequest,
  runAiTask,
  type AiConfig,
} from "./ai-server";

// Fictional names and placeholder keys only.
const note = {
  selfName: "Jordan Park",
  personName: "Alex Rivera",
  role: "direct" as const,
  title: "Weekly 1:1",
  meetingAt: "2026-03-02T15:00:00Z",
  content: "## Action items\n- Alex: draft the rollout plan",
};

const analysis = {
  summary: "Talked about the rollout.",
  items: [{ text: "Draft the rollout plan", owner: "them", ownerName: "Alex Rivera", due: "2026-03-09" }],
  topics: [
    { text: "Rollout timeline", category: "tactical" },
    { text: "Career goals", category: "nurture" },
  ],
  highlights: [{ text: "Shipped the beta", type: "win" }],
  themes: ["rollout"],
  recap: "Hi Alex,\n\nThanks for the time today.",
};

function chatResponse(content: string, status = 200) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });
}

type Call = { url: string; init: RequestInit };
function recorder(responses: Response[]) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    return next;
  });
  return { calls, fetchImpl };
}

const body = (call: Call) => JSON.parse(String(call.init.body));
const headers = (call: Call) => call.init.headers as Record<string, string>;

describe("detectAi", () => {
  const all = {
    OLLAMA_MODEL: "qwen2.5:7b",
    XAI_API_KEY: "test-xai",
    ANTHROPIC_API_KEY: "test-anthropic",
    OPENAI_API_KEY: "test-openai",
  };

  it("prefers Ollama, then xAI, then Anthropic, then OpenAI", () => {
    expect(detectAi(all).provider).toBe("ollama");
    expect(detectAi({ ...all, OLLAMA_MODEL: "" }).provider).toBe("xai");
    expect(detectAi({ ...all, OLLAMA_MODEL: " ", XAI_API_KEY: "" }).provider).toBe("anthropic");
    expect(detectAi({ OPENAI_API_KEY: "test-openai" }).provider).toBe("openai");
    expect(detectAi({}).provider).toBe("off");
  });

  it("uses the Ollama model name, default base URL, and no key", () => {
    const config = detectAi({ OLLAMA_MODEL: "llama3.1:8b" });
    expect(config).toEqual({ provider: "ollama", model: "llama3.1:8b", apiKey: "", baseUrl: DEFAULT_OLLAMA_BASE_URL });
    expect(detectAi({ OLLAMA_MODEL: "llama3.1:8b", OLLAMA_BASE_URL: "http://127.0.0.1:9999/" }).baseUrl).toBe(
      "http://127.0.0.1:9999",
    );
  });

  it("applies default models and TEAM_AI_MODEL override", () => {
    expect(detectAi({ XAI_API_KEY: "k" }).model).toBe(DEFAULT_XAI_MODEL);
    expect(detectAi({ ANTHROPIC_API_KEY: "k" }).model).toBe(DEFAULT_ANTHROPIC_MODEL);
    expect(detectAi({ OPENAI_API_KEY: "k" }).model).toBe(DEFAULT_OPENAI_MODEL);
    expect(detectAi({ XAI_API_KEY: "k", TEAM_AI_MODEL: "custom-model" }).model).toBe("custom-model");
    expect(detectAi({ OLLAMA_MODEL: "qwen2.5:7b", TEAM_AI_MODEL: "custom-model" }).model).toBe("custom-model");
  });
});

describe("runAiTask", () => {
  it("returns null without calling anything when AI is off", async () => {
    const { fetchImpl } = recorder([]);
    expect(await runAiTask("analyzeNote", note, detectAi({}), fetchImpl)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("calls xAI Chat Completions with strict json_schema and bearer auth", async () => {
    const { calls, fetchImpl } = recorder([chatResponse(JSON.stringify(analysis))]);
    const result = await runAiTask("analyzeNote", note, detectAi({ XAI_API_KEY: "test-xai" }), fetchImpl);
    expect(calls[0].url).toBe("https://api.x.ai/v1/chat/completions");
    expect(headers(calls[0]).authorization).toBe("Bearer test-xai");
    expect(body(calls[0]).model).toBe(DEFAULT_XAI_MODEL);
    expect(body(calls[0]).response_format.type).toBe("json_schema");
    expect(result).toMatchObject({ summary: "Talked about the rollout.", themes: ["rollout"] });
  });

  it("calls OpenAI Chat Completions", async () => {
    const { calls, fetchImpl } = recorder([chatResponse(JSON.stringify({ points: ["Ask about the rollout"] }))]);
    const result = await runAiTask(
      "talkingPoints",
      {
        selfName: "",
        personName: "Alex Rivera",
        role: "direct",
        theyOwe: [],
        iOwe: [],
        lastSummary: "",
        lastTopics: [],
        moments: [],
        pulseChanges: [],
      },
      detectAi({ OPENAI_API_KEY: "test-openai" }),
      fetchImpl,
    );
    expect(calls[0].url).toBe("https://api.openai.com/v1/chat/completions");
    expect(result).toEqual({ points: ["Ask about the rollout"] });
  });

  it("calls Anthropic Messages and reads text blocks", async () => {
    const { calls, fetchImpl } = recorder([
      new Response(
        JSON.stringify({
          content: [
            { type: "thinking", thinking: "..." },
            { type: "text", text: '```json\n{"type":"win"}\n```' },
          ],
        }),
      ),
    ]);
    const result = await runAiTask(
      "classifyMoment",
      { text: "Shipped the beta", tag: "" },
      detectAi({ ANTHROPIC_API_KEY: "test-anthropic" }),
      fetchImpl,
    );
    expect(calls[0].url).toBe("https://api.anthropic.com/v1/messages");
    expect(headers(calls[0])["x-api-key"]).toBe("test-anthropic");
    expect(result).toEqual({ type: "win" });
  });

  it("returns null on invalid output from a cloud provider without retrying", async () => {
    const { fetchImpl } = recorder([chatResponse("not json")]);
    expect(await runAiTask("analyzeNote", note, detectAi({ OPENAI_API_KEY: "k" }), fetchImpl)).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws AiError on HTTP errors so the route can report them", async () => {
    const { fetchImpl } = recorder([new Response("{}", { status: 401 })]);
    await expect(runAiTask("analyzeNote", note, detectAi({ XAI_API_KEY: "k" }), fetchImpl)).rejects.toMatchObject({
      status: 401,
    });
  });
});

describe("Ollama", () => {
  const config: AiConfig = detectAi({ OLLAMA_MODEL: "qwen2.5:7b" });

  it("posts to the local OpenAI-compatible endpoint with JSON mode, schema in prompt, no auth", async () => {
    const { calls, fetchImpl } = recorder([chatResponse(JSON.stringify(analysis))]);
    const result = await runAiTask("analyzeNote", note, config, fetchImpl);
    expect(calls[0].url).toBe("http://localhost:11434/v1/chat/completions");
    expect(headers(calls[0]).authorization).toBeUndefined();
    const sent = body(calls[0]);
    expect(sent.model).toBe("qwen2.5:7b");
    expect(sent.response_format).toEqual({ type: "json_object" });
    expect(sent.messages[0].content).toContain("JSON schema");
    expect(result).toMatchObject({ summary: "Talked about the rollout." });
  });

  it("honors a custom base URL", async () => {
    const { calls, fetchImpl } = recorder([chatResponse('{"type":"note"}')]);
    await runAiTask(
      "classifyMoment",
      { text: "Quick sync", tag: "" },
      detectAi({ OLLAMA_MODEL: "llama3.1:8b", OLLAMA_BASE_URL: "http://192.168.1.20:11434" }),
      fetchImpl,
    );
    expect(calls[0].url).toBe("http://192.168.1.20:11434/v1/chat/completions");
  });

  it("tolerates chatter around the JSON", async () => {
    const { fetchImpl } = recorder([chatResponse('Sure! Here it is:\n{"points":["Ask about workload"]}\nHope that helps.')]);
    const result = await runAiTask(
      "talkingPoints",
      {
        selfName: "",
        personName: "Alex Rivera",
        role: "direct",
        theyOwe: [],
        iOwe: [],
        lastSummary: "",
        lastTopics: [],
        moments: [],
        pulseChanges: [],
      },
      config,
      fetchImpl,
    );
    expect(result).toEqual({ points: ["Ask about workload"] });
  });

  it("retries once on weak JSON and uses the second answer", async () => {
    const { fetchImpl } = recorder([chatResponse("{broken"), chatResponse(JSON.stringify(analysis))]);
    const result = await runAiTask("analyzeNote", note, config, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ themes: ["rollout"] });
  });

  it("gives up after one retry so the caller falls back to rules", async () => {
    const { fetchImpl } = recorder([chatResponse('{"wrong":true}'), chatResponse("still not json")]);
    expect(await runAiTask("analyzeNote", note, config, fetchImpl)).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("uses a longer timeout signal than cloud calls", async () => {
    const spy = vi.spyOn(AbortSignal, "timeout");
    const { fetchImpl } = recorder([chatResponse('{"type":"win"}'), chatResponse('{"type":"win"}')]);
    await runAiTask("classifyMoment", { text: "Win", tag: "" }, config, fetchImpl);
    await runAiTask("classifyMoment", { text: "Win", tag: "" }, detectAi({ XAI_API_KEY: "k" }), fetchImpl);
    const [local, cloud] = spy.mock.calls.map((call) => call[0]);
    expect(local).toBeGreaterThan(cloud);
    spy.mockRestore();
  });
});

describe("checkOllama", () => {
  const config = detectAi({ OLLAMA_MODEL: "qwen2.5:7b" });
  const tags = (names: string[]) =>
    new Response(JSON.stringify({ models: names.map((name) => ({ name, model: name })) }));

  it("reports ready, model_missing, or unreachable", async () => {
    expect(await checkOllama(config, async () => tags(["qwen2.5:7b"]))).toBe("ready");
    expect(await checkOllama(config, async () => tags(["llama3.1:8b"]))).toBe("model_missing");
    expect(await checkOllama(config, async () => tags([]))).toBe("model_missing");
    expect(
      await checkOllama(config, async () => {
        throw new TypeError("fetch failed");
      }),
    ).toBe("unreachable");
  });

  it("treats a bare model name as :latest", async () => {
    const bare = detectAi({ OLLAMA_MODEL: "llama3.1" });
    expect(await checkOllama(bare, async () => tags(["llama3.1:latest"]))).toBe("ready");
  });
});

describe("parseAiRequest", () => {
  it("rejects unknown tasks and empty note content", () => {
    expect(parseAiRequest({ task: "nope", input: {} })).toBeNull();
    expect(parseAiRequest({ task: "analyzeNote", input: { content: "  " } })).toBeNull();
  });

  it("caps oversized input", () => {
    const parsed = parseAiRequest({ task: "analyzeNote", input: { ...note, content: "x".repeat(50_000) } });
    expect(parsed?.task).toBe("analyzeNote");
    expect((parsed?.input as { content: string }).content.length).toBe(12_000);
  });
});
