"use client";

import { FormEvent, useState } from "react";
import {
  PULSE_LABELS,
  axisAngle,
  defaultScores,
  radarPoints,
  ringPath,
  smoothClosedPath,
  sparklinePath,
} from "@/lib/team/pulse";
import { useTeam } from "@/lib/team/context";
import { PULSE_AXES, type PulseRating, type PulseScores } from "@/lib/team/types";
import { shortDate, todayIso } from "@/lib/team/view";

const SIZE = 240;
const CENTER = SIZE / 2;
const RADIUS = 84;

export function PulseRadar({ current, previous }: { current?: PulseScores; previous?: PulseScores }) {
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="h-56 w-56"
      role="img"
      aria-label={
        current
          ? `Pulse: ${PULSE_AXES.map((axis) => `${PULSE_LABELS[axis]} ${current[axis]}`).join(", ")}`
          : "Pulse: not rated yet"
      }
    >
      {[2, 4, 6, 8, 10].map((level) => (
        <path
          key={level}
          d={ringPath(level, CENTER, CENTER, RADIUS)}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth={level === 10 ? 1.2 : 0.8}
        />
      ))}
      {PULSE_AXES.map((axis, index) => {
        const angle = axisAngle(index);
        const end = { x: CENTER + RADIUS * Math.cos(angle), y: CENTER + RADIUS * Math.sin(angle) };
        const label = { x: CENTER + (RADIUS + 20) * Math.cos(angle), y: CENTER + (RADIUS + 20) * Math.sin(angle) };
        return (
          <g key={axis}>
            <line x1={CENTER} y1={CENTER} x2={end.x} y2={end.y} stroke="var(--color-line)" strokeWidth={0.6} />
            <text
              x={label.x}
              y={label.y}
              textAnchor={Math.abs(Math.cos(angle)) < 0.2 ? "middle" : Math.cos(angle) > 0 ? "start" : "end"}
              dominantBaseline="middle"
              fontSize="10"
              fill="var(--color-muted)"
            >
              {PULSE_LABELS[axis]}
              {current ? ` ${current[axis]}` : ""}
            </text>
          </g>
        );
      })}
      {previous ? (
        <path
          d={smoothClosedPath(radarPoints(previous, CENTER, CENTER, RADIUS))}
          fill="var(--color-muted)"
          fillOpacity={0.12}
          stroke="var(--color-muted)"
          strokeOpacity={0.4}
          strokeDasharray="3 3"
        />
      ) : null}
      {current ? (
        <path
          d={smoothClosedPath(radarPoints(current, CENTER, CENTER, RADIUS))}
          fill="var(--color-focus)"
          fillOpacity={0.3}
          stroke="var(--color-focus)"
          strokeWidth={1.5}
        />
      ) : null}
    </svg>
  );
}

function Sparklines({ ratings }: { ratings: PulseRating[] }) {
  const recent = ratings.slice(-8);
  return (
    <ul className="space-y-1.5">
      {PULSE_AXES.map((axis) => {
        const values = recent.map((rating) => rating.scores[axis]);
        const last = values[values.length - 1];
        const prev = values[values.length - 2];
        const trend = prev === undefined ? "" : last > prev ? "up" : last < prev ? "down" : "flat";
        return (
          <li key={axis} className="flex items-center gap-2 text-xs text-muted">
            <span className="w-20">{PULSE_LABELS[axis]}</span>
            <svg viewBox="0 0 64 16" className="h-4 w-16" aria-hidden="true">
              <path d={sparklinePath(values, 64, 14)} transform="translate(0,1)" fill="none" stroke="var(--color-focus)" strokeWidth={1.3} />
            </svg>
            <span className={`w-6 text-right ${trend === "down" ? "text-danger" : trend === "up" ? "text-active" : ""}`}>
              {last ?? "-"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function RateForm({ personId, initial, onDone }: { personId: string; initial: PulseScores; onDone: () => void }) {
  const team = useTeam();
  const [date, setDate] = useState(() => todayIso());
  const [scores, setScores] = useState<PulseScores>(initial);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await team.addPulse(personId, date, scores);
    onDone();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2 rounded-xl border border-line bg-bg p-3 text-xs">
      <label className="flex items-center justify-between gap-2 text-muted">
        1:1 date
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="rounded-md border border-line bg-bg px-2 py-1 text-ink"
        />
      </label>
      {PULSE_AXES.map((axis) => (
        <label key={axis} className="flex items-center gap-2 text-muted">
          <span className="w-20">{PULSE_LABELS[axis]}</span>
          <input
            type="range"
            min={1}
            max={10}
            value={scores[axis]}
            onChange={(event) => setScores({ ...scores, [axis]: Number(event.target.value) })}
            className="flex-1 accent-[var(--color-focus)]"
            aria-label={`${PULSE_LABELS[axis]} rating`}
          />
          <span className="w-5 text-right text-ink">{scores[axis]}</span>
        </label>
      ))}
      <div className="flex gap-2 pt-1">
        <button type="submit" className="rounded-full bg-focus px-3 py-1 font-medium text-bg">
          Save rating
        </button>
        <button type="button" onClick={onDone} className="rounded-full border border-line px-3 py-1 text-muted">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function PulseCard({ personId, ratings }: { personId: string; ratings: PulseRating[] }) {
  const [rating, setRating] = useState(false);
  const current = ratings[ratings.length - 1];
  const previous = ratings[ratings.length - 2];
  return (
    <div className="flex flex-wrap items-start gap-4 rounded-2xl border border-line bg-bg-elev p-3">
      <div className="flex flex-col items-center">
        <PulseRadar current={current?.scores} previous={previous?.scores} />
        <p className="text-[11px] text-muted">
          {current ? `Rated ${shortDate(current.date)}` : "Not rated yet"}
          {previous ? ` · faint shape is ${shortDate(previous.date)}` : ""}
        </p>
      </div>
      <div className="min-w-44 space-y-3">
        <p className="text-xs uppercase tracking-wide text-muted">Pulse</p>
        {ratings.length > 0 ? <Sparklines ratings={ratings} /> : null}
        {rating ? (
          <RateForm personId={personId} initial={current?.scores ?? defaultScores()} onDone={() => setRating(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setRating(true)}
            className="rounded-full border border-line px-3 py-1 text-xs text-ink hover:border-focus/60"
          >
            Rate after this 1:1
          </button>
        )}
      </div>
    </div>
  );
}
