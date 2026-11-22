/**
 * App-side time helpers. Zone math is shared with the Edge Functions (one implementation, tested
 * here). Display helpers use Intl with an explicit `timeZone`, so they don't depend on the device
 * zone, and the runtime's default locale (the device locale on Hermes).
 */
import { addDays, dateKeyAt, epochAt } from '../../supabase/functions/_shared/zoned-time';

export * from '../../supabase/functions/_shared/zoned-time';

const formatCache = new Map<string, Intl.DateTimeFormat>();
function fmt(timeZone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${timeZone}|${JSON.stringify(options)}`;
  let f = formatCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(undefined, { timeZone, ...options });
    formatCache.set(key, f);
  }
  return f;
}

export function formatClock(epochMs: number, timeZone: string): string {
  return fmt(timeZone, { hour: '2-digit', minute: '2-digit' }).format(epochMs);
}

/** "Today", "Tomorrow", or e.g. "Thu 26 Nov". */
export function formatDayLabel(epochMs: number, timeZone: string, now = Date.now()): string {
  const key = dateKeyAt(epochMs, timeZone);
  const today = dateKeyAt(now, timeZone);
  if (key === today) return 'Today';
  if (key === addDays(today, 1)) return 'Tomorrow';
  return fmt(timeZone, { weekday: 'short', day: 'numeric', month: 'short' }).format(epochMs);
}

/** e.g. "Monday, 23 November" */
export function formatLongDate(epochMs: number, timeZone: string): string {
  return fmt(timeZone, { weekday: 'long', day: 'numeric', month: 'long' }).format(epochMs);
}

/** e.g. "Tomorrow 10:00–11:00" */
export function formatSlot(start: number, end: number, timeZone: string, now = Date.now()): string {
  return `${formatDayLabel(start, timeZone, now)} ${formatClock(start, timeZone)}–${formatClock(end, timeZone)}`;
}

/** A deadline for display. "By Friday" is stored as Saturday 00:00, so midnight shows the day before. */
export function formatDeadline(deadline: number, timeZone: string, now = Date.now()): string {
  const isMidnight = epochAt(dateKeyAt(deadline, timeZone), 0, timeZone) === deadline;
  if (isMidnight) return formatDayLabel(deadline - 1, timeZone, now);
  return `${formatDayLabel(deadline, timeZone, now)} ${formatClock(deadline, timeZone)}`;
}
