/**
 * Timezone wall-clock math — pure Intl, no dependencies, DST-safe.
 *
 * The product rule (locked): a photo taken at 13:15 kitchen-local arrives at
 * 13:15 donor-local. If that wall-clock already passed today in the donor's
 * timezone, it arrives tomorrow at that time.
 */

export type WallClock = { h: number; min: number };
export type Ymd = { y: number; m: number; d: number };

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export function partsInTz(instant: Date, tz: string): Ymd & WallClock {
  const p: Record<string, string> = {};
  for (const part of fmt(tz).formatToParts(instant)) p[part.type] = part.value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour === 24 ? 0 : +p.hour, min: +p.minute };
}

/** The HH:MM a given instant shows on a wall clock in `tz`. */
export function wallClockInTz(instant: Date, tz: string): WallClock {
  const p = partsInTz(instant, tz);
  return { h: p.h, min: p.min };
}

function tzOffsetMs(utcGuess: Date, tz: string): number {
  const p = partsInTz(utcGuess, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
  const guessFloor = Math.floor(utcGuess.getTime() / 60000) * 60000;
  return asUtc - guessFloor;
}

/** UTC instant at which `tz` shows the given local date + wall clock (DST two-pass). */
export function instantForWallClock(date: Ymd, wc: WallClock, tz: string): Date {
  const guess = new Date(Date.UTC(date.y, date.m - 1, date.d, wc.h, wc.min));
  const off1 = tzOffsetMs(guess, tz);
  let candidate = new Date(guess.getTime() - off1);
  const off2 = tzOffsetMs(candidate, tz);
  if (off2 !== off1) candidate = new Date(guess.getTime() - off2);
  return candidate;
}

/** Next instant after `after` when the donor's wall clock reads `wc`. */
export function nextOccurrence(wc: WallClock, donorTz: string, after: Date): Date {
  const today = partsInTz(after, donorTz);
  let cand = instantForWallClock({ y: today.y, m: today.m, d: today.d }, wc, donorTz);
  if (cand.getTime() <= after.getTime()) {
    // jump well past midnight (and any DST shift), then re-anchor on that local date
    const t = new Date(cand.getTime() + 26 * 3_600_000);
    const p = partsInTz(t, donorTz);
    cand = instantForWallClock({ y: p.y, m: p.m, d: p.d }, wc, donorTz);
  }
  return cand;
}

/** 'YYYY-MM-DD' of an instant in a tz — streaks + day-eligibility math. */
export function dayKeyInTz(instant: Date, tz: string): string {
  const p = partsInTz(instant, tz);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** dayKey + n days (calendar-safe via UTC noon trick). */
export function addDaysToKey(dayKey: string, n: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, 12));
  t.setUTCDate(t.getUTCDate() + n);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

export function isValidTz(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
