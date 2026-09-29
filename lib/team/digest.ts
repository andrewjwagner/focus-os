import { TIMEZONE } from "../constants";

/**
 * Weekly Team digest highlight: from Sunday 5pm ET until the digest is viewed.
 * Works in ET wall-clock milliseconds so DST never shifts the boundary.
 */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_MS = 86_400_000;
export const DIGEST_HOUR_ET = 17;

function wallClockMs(date: Date, timeZone = TIMEZONE): { ms: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";
  const ms = Date.UTC(
    Number(get("year")),
    Number(get("month")) - 1,
    Number(get("day")),
    Number(get("hour")),
    Number(get("minute")),
    Number(get("second")),
  );
  return { ms, weekday: WEEKDAYS.indexOf(get("weekday")) };
}

/** Most recent Sunday 17:00 ET at or before `now`, in ET wall-clock ms. */
export function lastDigestBoundary(now: Date): number {
  const { ms, weekday } = wallClockMs(now);
  const midnight = ms - (ms % DAY_MS);
  let boundary = midnight - weekday * DAY_MS + DIGEST_HOUR_ET * 3_600_000;
  if (boundary > ms) boundary -= 7 * DAY_MS;
  return boundary;
}

export function shouldHighlightDigest(now: Date, lastViewedAt: string | null): boolean {
  const boundary = lastDigestBoundary(now);
  if (!lastViewedAt) return true;
  const viewed = new Date(lastViewedAt);
  if (Number.isNaN(viewed.getTime())) return true;
  return wallClockMs(viewed).ms < boundary;
}
