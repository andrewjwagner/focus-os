import { NextResponse } from "next/server";
import { AiError, checkOllama, detectAi, parseAiRequest, runAiTask } from "@/lib/team/ai-server";

// Server only. XAI_API_KEY / ANTHROPIC_API_KEY / OPENAI_API_KEY never reach the client.
// OLLAMA_MODEL runs on this machine, so note text never leaves it.
export const dynamic = "force-dynamic";
// Local Ollama models can be slow (one retry on weak JSON).
export const maxDuration = 400;

export async function GET() {
  const config = detectAi(process.env);
  const health = config.provider === "ollama" ? await checkOllama(config) : undefined;
  return NextResponse.json({ ok: true, provider: config.provider, model: config.model, health });
}

export async function POST(request: Request) {
  const config = detectAi(process.env);
  if (config.provider === "off") {
    return NextResponse.json({ ok: false, provider: "off", reason: "not_configured" });
  }
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, provider: config.provider, reason: "bad_request" }, { status: 400 });
  }
  const parsed = parseAiRequest(json);
  if (!parsed) {
    return NextResponse.json({ ok: false, provider: config.provider, reason: "bad_request" }, { status: 400 });
  }
  try {
    const result = await runAiTask(parsed.task, parsed.input, config);
    if (!result) {
      return NextResponse.json({ ok: false, provider: config.provider, reason: "invalid_output" });
    }
    return NextResponse.json({ ok: true, provider: config.provider, model: config.model, result });
  } catch (error) {
    const status = error instanceof AiError ? error.status : 502;
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    if (timedOut) return NextResponse.json({ ok: false, provider: config.provider, reason: "timeout" });
    if (config.provider === "ollama") {
      const reason = !(error instanceof AiError) ? "ollama_unreachable" : status === 404 ? "ollama_model_missing" : "upstream_error";
      return NextResponse.json({ ok: false, provider: config.provider, reason });
    }
    const reason = status === 401 || status === 403 ? "unauthorized" : status === 429 ? "rate_limited" : "upstream_error";
    return NextResponse.json({ ok: false, provider: config.provider, reason });
  }
}
