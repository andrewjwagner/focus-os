"use client";

import { ProjectCard } from "@/components/ProjectCard";
import { useStore } from "@/lib/store";

export default function TabledPage() {
  const store = useStore();
  const tabled = store.projects.filter((project) => project.status === "tabled");
  const inspired = store.projects.filter(
    (project) => project.status === "inspired",
  );

  if (!store.ready) {
    return <p className="text-muted">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <section>
        <p className="text-xs uppercase tracking-[0.2em] text-tabled">Tabled</p>
        <h1 className="mt-2 font-display text-4xl text-ink">Parked on purpose</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
          These are not failed. They wait until a focus slot opens.
        </p>
      </section>

      <section className="space-y-3">
        {tabled.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-4 py-5 text-sm text-muted">
            Nothing tabled. When Today gets noisy, park something.
          </p>
        ) : (
          tabled.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))
        )}
      </section>

      {inspired.length > 0 ? (
        <section>
          <h2 className="font-display text-2xl text-ink">Inspired</h2>
          <p className="mt-1 text-sm text-muted">
            Nice to have later. Not a focus candidate this week.
          </p>
          <div className="mt-3 space-y-3">
            {inspired.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
