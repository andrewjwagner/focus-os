import { isDomain } from "./thought";
import type { CaptureItemKind, Domain, Status } from "./types";

export type CaptureDraft =
  | {
      kind: CaptureItemKind;
      body: string;
      domain: Domain | "";
      projectId: string | null;
    }
  | {
      kind: "project";
      name: string;
      domain: Domain | "";
      outcome: string;
      nextAction: string;
      status: Status;
    };

export type CaptureValidation =
  | { ok: true }
  | { ok: false; reason: "body" | "name" | "domain" };

export function validateCapture(draft: CaptureDraft): CaptureValidation {
  if (!isDomain(draft.domain)) return { ok: false, reason: "domain" };
  if (draft.kind === "project") {
    if (!draft.name.trim()) return { ok: false, reason: "name" };
    return { ok: true };
  }
  if (!draft.body.trim()) return { ok: false, reason: "body" };
  return { ok: true };
}
