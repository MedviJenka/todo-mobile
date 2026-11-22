/**
 * Time-zone math on epoch milliseconds.
 *
 * Shared by the app (Hermes) and the Edge Functions (Deno), so it has NO imports and only uses
 * `Intl.DateTimeFormat#formatToParts`. Hermes supports that, but not every newer Intl option
 * (e.g. `timeZoneName: 'longOffset'`), which is why we don't use a tz library here.
 *
 * Every real-world UTC offset is a multiple of 15 minutes, so a 15-minute grid on epoch time is
 * also a 15-minute grid in local time.
 */

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

export type WallClock = {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
};

/** A local calendar date, `YYYY-MM-DD`. */
export type DateKey = string;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** True if the runtime knows this IANA zone name. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** The wall-clock reading in `timeZone` at the instant `epochMs`. */
export function wallClock(epochMs: number, timeZone: string): WallClock {
  const parts = formatterFor(timeZone).formatToParts(new Date(epochMs));
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  const year = read('year');
  const month = read('month');
  const day = read('day');
  // Some engines print midnight as "24" when hour12 is false.
  const hour = read('hour') % 24;
  const minute = read('minute');
  const second = read('second');
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { year, month, day, hour, minute, second, weekday };
}

/** UTC offset of `timeZone` at `epochMs`, in minutes (UTC+1 → 60). */
export function zoneOffsetMinutes(epochMs: number, timeZone: string): number {
  const w = wallClock(epochMs, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  const wholeSeconds = Math.floor(epochMs / 1000) * 1000;
  return Math.round((asUtc - wholeSeconds) / MINUTE_MS);
}

/**
 * Wall-clock time in `timeZone` → epoch ms.
 * A time that doesn't exist (inside a spring-forward gap) moves forward by the gap.
 * A time that exists twice (fall-back) resolves to the later occurrence.
 */
export function zonedToEpoch(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): number {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  const firstOffset = zoneOffsetMinutes(asUtc, timeZone);
  const guess = asUtc - firstOffset * MINUTE_MS;
  const secondOffset = zoneOffsetMinutes(guess, timeZone);
  return secondOffset === firstOffset ? guess : asUtc - secondOffset * MINUTE_MS;
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

export function toDateKey(year: number, month: number, day: number): DateKey {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

export function parseDateKey(key: DateKey): { year: number; month: number; day: number } {
  const [year, month, day] = key.split('-').map(Number);
  return { year, month, day };
}

/** The local date in `timeZone` at `epochMs`. */
export function dateKeyAt(epochMs: number, timeZone: string): DateKey {
  const w = wallClock(epochMs, timeZone);
  return toDateKey(w.year, w.month, w.day);
}

export function addDays(key: DateKey, days: number): DateKey {
  const { year, month, day } = parseDateKey(key);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return toDateKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** 0 = Sunday … 6 = Saturday */
export function weekdayOf(key: DateKey): number {
  const { year, month, day } = parseDateKey(key);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Epoch ms of `minutesIntoDay` (0–1440) on local date `key` in `timeZone`. */
export function epochAt(key: DateKey, minutesIntoDay: number, timeZone: string): number {
  const { year, month, day } = parseDateKey(key);
  if (minutesIntoDay >= 24 * 60) {
    return epochAt(addDays(key, 1), minutesIntoDay - 24 * 60, timeZone);
  }
  return zonedToEpoch(year, month, day, Math.floor(minutesIntoDay / 60), minutesIntoDay % 60, timeZone);
}

/** Epoch ms of local midnight that starts the day containing `epochMs`. */
export function startOfZonedDay(epochMs: number, timeZone: string): number {
  return epochAt(dateKeyAt(epochMs, timeZone), 0, timeZone);
}

/** `"HH:mm"` or `"HH:mm:ss"` (Postgres `time`) → minutes after midnight. `"24:00"` → 1440. */
export function parseTimeOfDay(value: string): number {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) throw new Error(`Invalid time of day: ${value}`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59 || (hours === 24 && minutes > 0)) {
    throw new Error(`Invalid time of day: ${value}`);
  }
  return hours * 60 + minutes;
}

export function formatTimeOfDay(minutesIntoDay: number): string {
  return `${pad(Math.floor(minutesIntoDay / 60))}:${pad(minutesIntoDay % 60)}`;
}

export type LocalDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** false for a date-only value (`YYYY-MM-DD`) */
  hasTime: boolean;
};

const LOCAL_DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/;

/**
 * Parses `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm` (no offset) and checks it's a real calendar date and
 * time. Returns null for anything else, e.g. `2026-02-30` or `2026-11-24T25:00`.
 */
export function parseLocalDateTime(value: string): LocalDateTime | null {
  const match = LOCAL_DATE_TIME_RE.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const hasTime = match[4] !== undefined;
  const hour = hasTime ? Number(match[4]) : 0;
  const minute = hasTime ? Number(match[5]) : 0;

  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59) return null;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return { year, month, day, hour, minute, hasTime };
}

/**
 * Local wall-clock string → epoch ms in `timeZone`.
 * A date-only value means the start of that day, or with `dateOnly: 'endOfDay'` the start of the
 * next day (the exclusive end). That's what "by Friday" means.
 */
export function localDateTimeToEpoch(
  value: string,
  timeZone: string,
  dateOnly: 'startOfDay' | 'endOfDay' = 'startOfDay'
): number | null {
  const parsed = parseLocalDateTime(value);
  if (!parsed) return null;
  const key = toDateKey(parsed.year, parsed.month, parsed.day);
  if (parsed.hasTime) {
    return zonedToEpoch(parsed.year, parsed.month, parsed.day, parsed.hour, parsed.minute, timeZone);
  }
  return dateOnly === 'endOfDay' ? epochAt(addDays(key, 1), 0, timeZone) : epochAt(key, 0, timeZone);
}

/** ISO-8601 with the zone's offset, e.g. `2026-11-23T08:40:00+01:00`. */
export function toOffsetIso(epochMs: number, timeZone: string): string {
  const w = wallClock(epochMs, timeZone);
  const offset = zoneOffsetMinutes(epochMs, timeZone);
  const sign = offset < 0 ? '-' : '+';
  const abs = Math.abs(offset);
  return (
    `${toDateKey(w.year, w.month, w.day)}T${pad(w.hour)}:${pad(w.minute)}:${pad(w.second)}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}
