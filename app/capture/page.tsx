"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DictateControl } from "@/components/DictateControl";
import { validateCapture } from "@/lib/capture";
import { insertTranscript } from "@/lib/speech";
import { useStore } from "@/lib/store";
import { payloadFromProject, payloadFromThought } from "@/lib/triage";
import { DOMAINS, type CaptureItemKind, type Domain, type Status } from "@/lib/types";
import { fieldClass } from "@/lib/ui";

type CaptureKind = CaptureItemKind | "project";

function handoffToTriage(payload: unknown) {
  void fetch("/api/capture/triage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {
    // Local save already succeeded.
  });
}

export default function CapturePage() {
  const store = useStore();
  const router = useRouter();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const bodyValueRef = useRef("");
  const selectionRef = useRef({ start: 0, end: 0 });
  const [kind, setKind] = useState<CaptureKind>("idea");
  const [body, setBody] = useState("");
  const [itemDomain, setItemDomain] = useState<Domain | "">("");
  const [itemProjectId, setItemProjectId] = useState("");
  const [name, setName] = useState("");
  const [projectDomain, setProjectDomain] = useState<Domain>("Ideas");
  const [outcome, setOutcome] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [status, setStatus] = useState<Status>("active");
  const [error, setError] = useState<string | null>(null);

  function setBodyAndCaret(next: string, start: number, end = start) {
    bodyValueRef.current = next;
    selectionRef.current = { start, end };
    setBody(next);
  }

  function applyTranscript(spoken: string) {
    const current = bodyValueRef.current;
    const { start, end } = selectionRef.current;
    const result = insertTranscript(current, spoken, start, end);
    setBodyAndCaret(result.next, result.caret);
    requestAnimationFrame(() => {
      const el = bodyRef.current;
      el?.focus();
      el?.setSelectionRange(result.caret, result.caret);
    });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (kind === "idea" || kind === "todo") {
      const check = validateCapture({
        kind,
        body,
        domain: itemDomain,
        projectId: itemProjectId || null,
      });
      if (!check.ok) {
        setError(
          check.reason === "domain"
            ? "Pick a domain before saving."
            : "Write the idea or todo first.",
        );
        return;
      }
      const thought = await store.captureThought({
        kind,
        body,
        domain: itemDomain as Domain,
        projectId: itemProjectId || null,
      });
      handoffToTriage(payloadFromThought(thought));
      setBodyAndCaret("", 0);
      setItemProjectId("");
      router.push("/");
      return;
    }

    const check = validateCapture({
      kind: "project",
      name,
      domain: projectDomain,
      outcome,
      nextAction,
      status,
    });
    if (!check.ok) {
      setError(
        check.reason === "name"
          ? "Name the project before saving."
          : "Pick a domain before saving.",
      );
      return;
    }
    const project = await store.captureProject({
      name,
      domain: projectDomain,
      outcome,
      nextAction,
      status,
    });
    handoffToTriage(payloadFromProject(project));
    router.push(`/projects/${project.id}`);
  }

  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs uppercase tracking-[0.2em] text-focus">Capture</p>
        <h1 className="mt-2 font-display text-4xl text-ink">Get it out of chat.</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Fast add an idea, a todo, or a project. Saved here first, then handed
          off to triage if a webhook is configured.
        </p>
      </section>

      <div className="flex flex-wrap gap-2">
        {(["idea", "todo", "project"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setKind(option)}
            className={`rounded-full px-4 py-1.5 text-sm ${
              kind === option
                ? "bg-focus text-bg"
                : "border border-line text-muted"
            }`}
          >
            {option === "idea" ? "Idea" : option === "todo" ? "Todo" : "Project"}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-line bg-card p-5">
        {kind === "idea" || kind === "todo" ? (
          <>
            <div>
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="capture-body" className="text-sm text-muted">
                  {kind === "todo" ? "Todo" : "Idea"}
                </label>
                <DictateControl onTranscript={applyTranscript} />
              </div>
              <textarea
                id="capture-body"
                ref={bodyRef}
                value={body}
                onChange={(event) => {
                  const el = event.target;
                  setBodyAndCaret(el.value, el.selectionStart, el.selectionEnd);
                }}
                onSelect={(event) => {
                  const el = event.currentTarget;
                  selectionRef.current = {
                    start: el.selectionStart,
                    end: el.selectionEnd,
                  };
                }}
                rows={4}
                className={`${fieldClass} mt-1 resize-y`}
                placeholder={
                  kind === "todo"
                    ? "A next action you do not want trapped in scrollback."
                    : "A sentence you do not want trapped in scrollback."
                }
                required
              />
            </div>
            <label className="block text-sm text-muted">
              Domain
              <select
                value={itemDomain}
                onChange={(event) => setItemDomain(event.target.value as Domain | "")}
                className={`${fieldClass} mt-1`}
                required
              >
                <option value="">Select a domain</option>
                {DOMAINS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-muted">
              Attach now (optional)
              <select
                value={itemProjectId}
                onChange={(event) => {
                  const id = event.target.value;
                  setItemProjectId(id);
                  const project = store.projects.find((item) => item.id === id);
                  if (project) setItemDomain(project.domain);
                }}
                className={`${fieldClass} mt-1`}
              >
                <option value="">Inbox (unsorted)</option>
                {store.projects
                  .filter((project) => project.status !== "done")
                  .map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
              </select>
            </label>
          </>
        ) : (
          <>
            <label className="block text-sm text-muted">
              Name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className={`${fieldClass} mt-1`}
                required
              />
            </label>
            <label className="block text-sm text-muted">
              Domain
              <select
                value={projectDomain}
                onChange={(event) => setProjectDomain(event.target.value as Domain)}
                className={`${fieldClass} mt-1`}
              >
                {DOMAINS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-muted">
              One-line outcome
              <input
                value={outcome}
                onChange={(event) => setOutcome(event.target.value)}
                className={`${fieldClass} mt-1`}
                placeholder="What done looks like."
              />
            </label>
            <label className="block text-sm text-muted">
              Next action
              <input
                value={nextAction}
                onChange={(event) => setNextAction(event.target.value)}
                className={`${fieldClass} mt-1`}
              />
            </label>
            <label className="block text-sm text-muted">
              Status
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as Status)}
                className={`${fieldClass} mt-1`}
              >
                <option value="active">Active</option>
                <option value="tabled">Tabled</option>
                <option value="inspired">Inspired</option>
              </select>
            </label>
          </>
        )}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <button
          type="submit"
          className="rounded-full bg-focus px-4 py-2 text-sm font-medium text-bg hover:bg-focus/90"
        >
          Save
        </button>
      </form>
    </div>
  );
}
