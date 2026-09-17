import {
  drainTriage,
  enqueueTriage,
  forwardTriage,
  parseTriagePayload,
  secretFromRequest,
  secretsMatch,
} from "@/lib/triage";

export const dynamic = "force-dynamic";

function configuredSecret(): string {
  return (process.env.TRIAGE_WEBHOOK_SECRET ?? "").trim();
}

function configuredUrl(): string {
  return (process.env.TRIAGE_WEBHOOK_URL ?? "").trim();
}

export async function GET() {
  return Response.json({ items: drainTriage() });
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const payload = parseTriagePayload(json);
  if ("error" in payload) {
    return Response.json(payload, { status: 400 });
  }

  const source = request.headers.get("x-triage-source")?.trim();
  if (source === "local") {
    const url = configuredUrl();
    const secret = configuredSecret();
    if (!url) {
      return Response.json({ ok: true, forwarded: false });
    }
    try {
      const forwarded = await forwardTriage(payload, url, secret);
      return Response.json({ ok: true, forwarded });
    } catch {
      return Response.json(
        { error: "Forward to TRIAGE_WEBHOOK_URL failed." },
        { status: 502 },
      );
    }
  }

  const secret = configuredSecret();
  if (!secret) {
    return Response.json(
      { error: "Triage webhook is not configured." },
      { status: 501 },
    );
  }
  if (!secretsMatch(secretFromRequest(request), secret)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const item = enqueueTriage(payload);
  return Response.json({ ok: true, queued: true, id: item.id });
}
