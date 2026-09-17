"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { DictateButton, appendDictation } from "@/components/DictateButton";
import { useStore } from "@/lib/store";
import {
  CAPTURE_KINDS,
  DOMAINS,
  type CaptureKind,
  type Domain,
  type Status,
} from "@/lib/types";
import { fieldClass } from "@/lib/ui";

export default function CapturePage() {
  const store = useStore();
  const router = useRouter();
  const [kind, setKind] = useState<CaptureKind>("idea");
  const [body, setBody] = useState("");
  const [thoughtProjectId, setThoughtProjectId] = useState("");
  const [name, setName] = useState("");
  const [domain, setDomain] = useState<Domain>("Work");
  const [outcome, setOutcome] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [status, setStatus] = useState<Status>("active");
  const [saved, setSaved] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaved(null);
    if (kind === "idea" || kind === "todo") {
      if (!body.trim()) return;
      await store.captureThought(body, thoughtProjectId || null, kind);
      setBody("");
      setThoughtProjectId("");
      setSaved(kind === "todo" ? "Todo captured." : "Idea captured.");
      router.push("/");
      return;
    }
    if (!name.trim()) return;
    const project = await store.captureProject({
      name,
      domain,
      outcome,
      nextAction,
      status,
    });
    router.push(`/projects/${project.id}`);
  }

  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs uppercase tracking-[0.2em] text-focus">Capture</p>
        <h1 className="mt-2 font-display text-4xl text-ink">Get it out of chat.</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Fast add an idea, a todo, or a project. Web is enough for dogfood.
        </p>
      </section>

      <div className="flex flex-wrap gap-2">
        {CAPTURE_KINDS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setKind(option)}
            className={`rounded-full px-4 py-1.5 text-sm capitalize ${
              kind === option
                ? "bg-focus text-bg"
                : "border border-line text-muted"
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-line bg-card p-5">
        {kind === "idea" || kind === "todo" ? (
          <>
            <label className="block text-sm text-muted">
              <span className="flex items-center justify-between gap-2">
                <span>{kind === "todo" ? "Todo" : "Idea"}</span>
                <DictateButton
                  onTranscript={(piece) =>
                    setBody((current) => appendDictation(current, piece))
                  }
                />
              </span>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={4}
                className={`${fieldClass} mt-1 resize-y`}
                placeholder={
                  kind === "todo"
                    ? "A next action you do not want trapped in scrollback."
                    : "A sentence you do not want trapped in scrollback."
                }
                required
              />
            </label>
            <label className="block text-sm text-muted">
              Attach now (optional)
              <select
                value={thoughtProjectId}
                onChange={(event) => setThoughtProjectId(event.target.value)}
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
              <span className="flex items-center justify-between gap-2">
                <span>Name</span>
                <DictateButton
                  onTranscript={(piece) =>
                    setName((current) => appendDictation(current, piece))
                  }
                />
              </span>
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
                value={domain}
                onChange={(event) => setDomain(event.target.value as Domain)}
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
        {saved ? <p className="text-sm text-active">{saved}</p> : null}
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
