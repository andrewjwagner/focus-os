"use client";

import { useMemo, useState } from "react";
import { ProjectCard } from "@/components/ProjectCard";
import { todayLabel } from "@/lib/format";
import { focusedProjects } from "@/lib/focus";
import { inboxThoughts } from "@/lib/seed";
import { useStore } from "@/lib/store";
import { DOMAINS } from "@/lib/types";
import { DOMAIN_TINT } from "@/lib/ui";

export default function TodayPage() {
  const store = useStore();
  const [attachFor, setAttachFor] = useState<Record<string, string>>({});

  const focus = useMemo(
    () => focusedProjects(store.projects),
    [store.projects],
  );
  const inbox = useMemo(
    () => inboxThoughts(store.thoughts),
    [store.thoughts],
  );
  const tabled = useMemo(
    () =>
      store.projects.filter(
        (project) =>
          project.status === "tabled" || project.status === "inspired",
      ),
    [store.projects],
  );
  const activeByDomain = useMemo(() => {
    return DOMAINS.map((domain) => ({
      domain,
      projects: store.projects.filter(
        (project) =>
          project.domain === domain &&
          project.status === "active" &&
          !project.focusNext,
      ),
    })).filter((group) => group.projects.length > 0);
  }, [store.projects]);

  const emptySlots = Math.max(0, 3 - focus.length);

  if (!store.ready) {
    return <p className="text-muted">Loading your board…</p>;
  }

  return (
    <div className="space-y-8">
      <section>
        <p className="text-xs uppercase tracking-[0.2em] text-focus">Today</p>
        <h1 className="mt-2 font-display text-4xl text-ink">{todayLabel()}</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
          Focus next, then active work, then what you parked. Open the lane, do
          not hunt chat scrollback.
        </p>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="font-display text-2xl text-ink">Focus next</h2>
          <p className="text-xs uppercase tracking-wide text-focus">
            {focus.length} of 3
          </p>
        </div>
        <div className="space-y-3">
          {focus.map((project, index) => (
            <div key={project.id} className="relative">
              <span className="absolute -left-2 top-4 font-display text-lg text-focus/70">
                {index + 1}
              </span>
              <div className="pl-4">
                <ProjectCard project={project} />
              </div>
            </div>
          ))}
          {Array.from({ length: emptySlots }).map((_, index) => (
            <div
              key={`empty-${index}`}
              className="rounded-2xl border border-dashed border-line px-4 py-5 text-sm text-muted"
            >
              Empty slot. Capture a project or promote an active one.
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl text-ink">Active</h2>
        <p className="mt-1 text-sm text-muted">By domain. Collapsed so Today stays quiet.</p>
        <div className="mt-3 space-y-2">
          {activeByDomain.length === 0 ? (
            <p className="text-sm text-muted">No other active projects.</p>
          ) : (
            activeByDomain.map((group) => (
              <details
                key={group.domain}
                className="rounded-2xl border border-line bg-card"
              >
                <summary className="flex items-center justify-between px-4 py-3">
                  <span className="flex items-center gap-2 text-sm text-ink">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: DOMAIN_TINT[group.domain] }}
                    />
                    {group.domain}
                  </span>
                  <span className="text-xs text-muted">
                    {group.projects.length}
                  </span>
                </summary>
                <div className="space-y-2 border-t border-line px-3 py-3">
                  {group.projects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      compact
                    />
                  ))}
                </div>
              </details>
            ))
          )}
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl text-ink">Inbox</h2>
        <p className="mt-1 text-sm text-muted">
          {inbox.length} unsorted thought{inbox.length === 1 ? "" : "s"}. Attach
          to a project when you know where it belongs.
        </p>
        <div className="mt-3 space-y-2">
          {inbox.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line px-4 py-5 text-sm text-muted">
              Inbox is clear.
            </p>
          ) : (
            inbox.map((thought) => (
              <div
                key={thought.id}
                className="rounded-2xl border border-line bg-card p-4"
              >
                <p className="text-sm leading-6 text-ink">{thought.body}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    className="rounded-lg border border-line bg-bg px-2 py-1 text-xs text-ink"
                    value={attachFor[thought.id] ?? ""}
                    onChange={(event) =>
                      setAttachFor((prev) => ({
                        ...prev,
                        [thought.id]: event.target.value,
                      }))
                    }
                  >
                    <option value="">Attach to project</option>
                    {store.projects
                      .filter((project) => project.status !== "done")
                      .map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:text-ink"
                    onClick={() => {
                      const projectId = attachFor[thought.id];
                      if (!projectId) return;
                      void store.attachThought(thought.id, projectId);
                    }}
                  >
                    Sort
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section>
        <details className="rounded-2xl border border-line bg-card">
          <summary className="flex items-center justify-between px-4 py-3">
            <span className="font-display text-2xl text-ink">Tabled shelf</span>
            <span className="text-xs text-muted">{tabled.length} parked</span>
          </summary>
          <div className="space-y-2 border-t border-line px-3 py-3">
            <p className="px-1 pb-1 text-sm text-muted">
              Parked on purpose. No guilt.
            </p>
            {tabled.map((project) => (
              <ProjectCard key={project.id} project={project} compact />
            ))}
          </div>
        </details>
      </section>
    </div>
  );
}
