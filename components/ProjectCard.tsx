"use client";

import Link from "next/link";
import type { Project } from "@/lib/types";
import { DOMAIN_TINT, statusLabel } from "@/lib/ui";

export function ProjectCard({
  project,
  compact = false,
}: {
  project: Project;
  compact?: boolean;
}) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className="block rounded-2xl border border-line bg-card p-4 transition-colors hover:border-focus/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink">{project.name}</p>
          <p className="mt-1 flex items-center gap-2 text-xs text-muted">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: DOMAIN_TINT[project.domain] }}
            />
            {project.domain}
            <span>·</span>
            {statusLabel(project.status)}
          </p>
        </div>
        {project.focusNext ? (
          <span className="rounded-full bg-focus/15 px-2 py-0.5 text-[11px] uppercase tracking-wide text-focus">
            Focus
          </span>
        ) : null}
      </div>
      {compact ? null : (
        <p className="mt-3 text-sm leading-6 text-muted">
          Next: {project.nextAction || "No next action yet."}
        </p>
      )}
    </Link>
  );
}
