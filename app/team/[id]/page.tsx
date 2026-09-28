"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PulseCard } from "@/components/team/PulseCard";
import {
  CoachingSection,
  ColumnsSection,
  HighlightsSection,
  LastNoteSection,
  RecapSection,
  TalkingPointsSection,
} from "@/components/team/PersonSections";
import { TeamGate } from "@/components/team/TeamGate";
import { TeamNav } from "@/components/team/TeamNav";
import { useTeam } from "@/lib/team/context";
import { personView, type TeamSnapshot } from "@/lib/team/insights";
import { roleLabel, shortDate } from "@/lib/team/view";

function PersonDetail({ id }: { id: string }) {
  const team = useTeam();
  const person = team.people.find((entry) => entry.id === id);
  const snapshot = useMemo<TeamSnapshot>(
    () => ({
      notes: team.notes,
      items: team.items,
      moments: team.moments,
      pulses: team.pulses,
      coaching: team.coaching,
      derived: team.derived,
    }),
    [team.notes, team.items, team.moments, team.pulses, team.coaching, team.derived],
  );
  const view = useMemo(() => personView(id, snapshot), [id, snapshot]);

  if (!person) {
    return (
      <div className="space-y-3">
        <h1 className="font-display text-3xl">Person not found</h1>
        <Link href="/team" className="text-sm text-focus hover:underline">
          Back to Team
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/team" className="text-xs text-muted hover:text-ink">
            Team
          </Link>
          <h1 className="mt-2 font-display text-4xl text-ink">{person.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {roleLabel(person.role)} · {view.notes.length} note{view.notes.length === 1 ? "" : "s"}
            {person.lastSync ? ` · synced ${shortDate(person.lastSync)}` : ""}
            {team.aiBusy ? " · AI working..." : ""}
          </p>
          <div className="mt-4">
            <TeamNav />
          </div>
        </div>
        <PulseCard personId={person.id} ratings={view.pulses} />
      </section>
      <LastNoteSection view={view} />
      <ColumnsSection person={person} view={view} />
      <TalkingPointsSection person={person} />
      <HighlightsSection person={person} view={view} />
      <CoachingSection person={person} view={view} />
      <RecapSection person={person} view={view} snapshot={snapshot} />
    </div>
  );
}

export default function PersonPage() {
  const params = useParams<{ id: string }>();
  return (
    <TeamGate>
      <PersonDetail id={params.id} />
    </TeamGate>
  );
}
