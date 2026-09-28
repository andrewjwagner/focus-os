"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ItemRow } from "@/components/team/ItemRow";
import { TeamGate } from "@/components/team/TeamGate";
import { TeamNav } from "@/components/team/TeamNav";
import { useTeam } from "@/lib/team/context";
import { buildPrepBrief } from "@/lib/team/extract";
import { roleLabel, shortDate } from "@/lib/team/view";

function Digest() {
  const team = useTeam();
  const { markDigestViewed, digestHighlighted } = team;

  useEffect(() => {
    if (digestHighlighted) void markDigestViewed();
  }, [digestHighlighted, markDigestViewed]);

  const openTotal = team.items.filter((item) => !item.done).length;

  return (
    <div className="space-y-8">
      <section>
        <p className="text-xs uppercase tracking-[0.2em] text-focus">Weekly digest</p>
        <h1 className="mt-2 font-display text-4xl text-ink">Open loops and prep</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
          {openTotal} open item{openTotal === 1 ? "" : "s"} across {team.people.length}{" "}
          {team.people.length === 1 ? "person" : "people"}. Refreshed every Sunday at 5pm ET.
        </p>
        <div className="mt-4">
          <TeamNav />
        </div>
      </section>

      {team.people.length === 0 ? (
        <p className="text-sm text-muted">
          Add people in{" "}
          <Link href="/team/settings" className="text-focus hover:underline">
            Team settings
          </Link>{" "}
          to see a digest.
        </p>
      ) : null}

      {team.people.map((person) => {
        const brief = buildPrepBrief({
          notes: team.notes.filter((note) => note.personId === person.id),
          items: team.items.filter((item) => item.personId === person.id),
          moments: team.moments.filter((moment) => moment.personId === person.id),
        });
        const open = [...brief.stillOpen, ...brief.followUps];
        return (
          <section key={person.id} className="space-y-3 rounded-2xl border border-line bg-bg-elev p-4">
            <div className="flex items-baseline justify-between gap-3">
              <Link href={`/team/${person.id}`} className="font-display text-2xl text-ink hover:underline">
                {person.name}
              </Link>
              <span className="text-xs text-muted">
                {roleLabel(person.role)}
                {brief.lastNote ? ` · last 1:1 ${shortDate(brief.lastNote.meetingAt)}` : ""}
              </span>
            </div>
            {open.length === 0 ? (
              <p className="text-sm text-muted">No open loops.</p>
            ) : (
              <ul className="space-y-2">
                {open.map((item) => (
                  <ItemRow key={item.id} item={item} editable={false} />
                ))}
              </ul>
            )}
            {brief.lastTopics.length > 0 ? (
              <p className="text-xs text-muted">Raised last time: {brief.lastTopics.join(", ")}</p>
            ) : null}
            {brief.momentsSince.length > 0 ? (
              <p className="text-xs text-muted">
                {brief.momentsSince.length} moment{brief.momentsSince.length === 1 ? "" : "s"} logged
                since then.
              </p>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

export default function DigestPage() {
  return (
    <TeamGate>
      <Digest />
    </TeamGate>
  );
}
