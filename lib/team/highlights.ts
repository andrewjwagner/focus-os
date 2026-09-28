import { todayIso } from "./view";
import type { Moment, MomentType } from "./types";

export type MomentCounts = { total: number; win: number; issue: number; coaching: number };
export type HighlightCounters = { thisYear: MomentCounts; last90: MomentCounts };

function count(moments: Moment[]): MomentCounts {
  const byType = (type: MomentType) => moments.filter((moment) => moment.type === type).length;
  return { total: moments.length, win: byType("win"), issue: byType("issue"), coaching: byType("coaching") };
}

/** Counters for This year (ET calendar year) and the last 90 days. */
export function highlightCounters(moments: Moment[], now = new Date()): HighlightCounters {
  const today = todayIso(now);
  const year = today.slice(0, 4);
  const cutoff = new Date(`${today}T12:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 90);
  const since = cutoff.toISOString().slice(0, 10);
  return {
    thisYear: count(moments.filter((moment) => moment.date.startsWith(year) && moment.date <= today)),
    last90: count(moments.filter((moment) => moment.date >= since && moment.date <= today)),
  };
}
