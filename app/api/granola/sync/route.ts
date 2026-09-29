import { NextResponse } from "next/server";
import { GranolaClient, GranolaError, parseSyncTargets, syncFolders } from "@/lib/granola";

// Server only. GRANOLA_API_KEY is read here and never sent to the client.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function apiKey(): string {
  return (process.env.GRANOLA_API_KEY ?? "").trim();
}

export async function GET() {
  return NextResponse.json({ ok: true, configured: Boolean(apiKey()) });
}

export async function POST(request: Request) {
  const key = apiKey();
  if (!key) {
    return NextResponse.json({ ok: false, configured: false, reason: "not_configured" });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  const targets = parseSyncTargets(json);
  if (!targets) {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }

  const syncedAt = new Date().toISOString();
  const includeTranscript = (json as { includeTranscript?: unknown }).includeTranscript !== false;
  try {
    const client = new GranolaClient({ apiKey: key });
    const results = await syncFolders(client, targets, { includeTranscript });
    return NextResponse.json({ ok: true, configured: true, syncedAt, results });
  } catch (error) {
    const status = error instanceof GranolaError ? error.status : 502;
    const reason =
      status === 401 || status === 403 ? "unauthorized" : status === 429 ? "rate_limited" : "upstream_error";
    return NextResponse.json({ ok: false, configured: true, reason }, { status: 502 });
  }
}
