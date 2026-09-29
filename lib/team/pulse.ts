import { PULSE_AXES, type PulseAxis, type PulseRating, type PulseScores } from "./types";

/** Pulse radar math (pure) so the SVG component stays thin and testable. */

export const PULSE_LABELS: Record<PulseAxis, string> = {
  engagement: "Engagement",
  workload: "Workload",
  growth: "Growth",
  relationship: "Relationship",
  delivery: "Delivery",
};

export const PULSE_MIN = 1;
export const PULSE_MAX = 10;

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return PULSE_MIN;
  return Math.min(PULSE_MAX, Math.max(PULSE_MIN, Math.round(value)));
}

export function defaultScores(): PulseScores {
  return { engagement: 5, workload: 5, growth: 5, relationship: 5, delivery: 5 };
}

export function sortPulses(ratings: PulseRating[]): PulseRating[] {
  return [...ratings].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}

/** Axis angle: first axis at 12 o'clock, clockwise. */
export function axisAngle(index: number, count = PULSE_AXES.length): number {
  return -Math.PI / 2 + (index * 2 * Math.PI) / count;
}

export type Point = { x: number; y: number };

export function radarPoints(scores: PulseScores, cx: number, cy: number, radius: number): Point[] {
  return PULSE_AXES.map((axis, index) => {
    const r = (clampScore(scores[axis]) / PULSE_MAX) * radius;
    const angle = axisAngle(index);
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });
}

const round = (value: number) => Math.round(value * 100) / 100;

/** Closed, rounded path through points (Catmull-Rom converted to cubic Bezier). */
export function smoothClosedPath(points: Point[], tension = 0.5): string {
  if (points.length < 3) return "";
  const n = points.length;
  let d = `M${round(points[0].x)},${round(points[0].y)}`;
  for (let i = 0; i < n; i += 1) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    const c1 = { x: p1.x + ((p2.x - p0.x) / 6) * tension * 2, y: p1.y + ((p2.y - p0.y) / 6) * tension * 2 };
    const c2 = { x: p2.x - ((p3.x - p1.x) / 6) * tension * 2, y: p2.y - ((p3.y - p1.y) / 6) * tension * 2 };
    d += ` C${round(c1.x)},${round(c1.y)} ${round(c2.x)},${round(c2.y)} ${round(p2.x)},${round(p2.y)}`;
  }
  return `${d} Z`;
}

/** Concentric ring as a rounded pentagon-ish path. */
export function ringPath(level: number, cx: number, cy: number, radius: number): string {
  const scores = Object.fromEntries(PULSE_AXES.map((axis) => [axis, level])) as PulseScores;
  return smoothClosedPath(radarPoints(scores, cx, cy, radius), 0.35);
}

export function sparklinePath(values: number[], width: number, height: number): string {
  if (values.length === 0) return "";
  if (values.length === 1) {
    const y = round(height - ((clampScore(values[0]) - PULSE_MIN) / (PULSE_MAX - PULSE_MIN)) * height);
    return `M0,${y} L${width},${y}`;
  }
  const step = width / (values.length - 1);
  return values
    .map((value, index) => {
      const y = height - ((clampScore(value) - PULSE_MIN) / (PULSE_MAX - PULSE_MIN)) * height;
      return `${index === 0 ? "M" : "L"}${round(index * step)},${round(y)}`;
    })
    .join(" ");
}

export type PulseChange = {
  axis: PulseAxis;
  label: string;
  previous: number;
  current: number;
  delta: number;
};

/** Per-axis change between the two latest ratings, biggest moves first. */
export function pulseChanges(ratings: PulseRating[]): PulseChange[] {
  const sorted = sortPulses(ratings);
  if (sorted.length < 2) return [];
  const current = sorted[sorted.length - 1].scores;
  const previous = sorted[sorted.length - 2].scores;
  return PULSE_AXES.map((axis) => ({
    axis,
    label: PULSE_LABELS[axis],
    previous: previous[axis],
    current: current[axis],
    delta: current[axis] - previous[axis],
  }))
    .filter((change) => change.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

export function describePulseChanges(ratings: PulseRating[]): string[] {
  return pulseChanges(ratings).map(
    (change) => `${change.label} ${change.delta > 0 ? "up" : "down"} from ${change.previous} to ${change.current}`,
  );
}
