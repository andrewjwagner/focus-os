import { NextResponse } from "next/server";
import { forwardTriageCapture, parseTriagePayload } from "@/lib/triage";

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const payload = parseTriagePayload(json);
  if (!payload) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const result = await forwardTriageCapture(payload, process.env, fetch);
  return NextResponse.json({ ok: true, forwarded: result.forwarded });
}
