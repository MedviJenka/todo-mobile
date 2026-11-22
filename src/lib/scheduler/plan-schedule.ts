/**
 * Ordering and slot finding (PRODUCT_PLAN §7). Pure: no I/O, no clock, no device time zone.
 * The AI only extracts. All time arithmetic happens here, on epoch milliseconds, with day
 * boundaries taken from the user's time zone (so DST days have the right active hours).
 */
import { addDays, dateKeyAt, DAY_MS, epochAt, HOUR_MS, MINUTE_MS } from '@/lib/time';

import { expand, intersect, longest, normalize, overlaps, subtract, type Interval } from './intervals';

export type { Interval } from './intervals';

export type Priority = 'high' | 'medium' | 'low';
export type TimeWindow = 'morning' | 'afternoon' | 'evening';

export type SchedulerSettings = {
  timeZone: string;
  /** Active hours, minutes after local midnight (e.g. 9:00 → 540). */
  dayStartMinutes: number;
  dayEndMinutes: number;
  bufferMinutes: number;
};

export type PlanTask = {
  id: string;
  priority: Priority;
  durationMinutes: number;
  /** Pinned start the user stated ("dentist at 10"). */
  fixedStart: number | null;
  /** Earliest allowed start. */
  notBefore: number | null;
  /** Exclusive: the task must END by this instant. */
  deadline: number | null;
  preferredWindow: TimeWindow | null;
  scheduleToCalendar: boolean;
};

export type Placement = {
  taskId: string;
  start: number;
  end: number;
  fixed: boolean;
  /** Fixed task that overlaps an existing event or another fixed task. */
  conflict: boolean;
  usedPreferredWindow: boolean;
};

export type UnscheduledReason =
  | 'no_gap_before_deadline'
  | 'longer_than_any_gap'
  | 'no_free_time'
  | 'deadline_passed'
  | 'fixed_time_passed'
  | 'outside_horizon';

export type PlanResult = {
  placements: Placement[];
  unscheduled: { taskId: string; reason: UnscheduledReason }[];
  /** `scheduleToCalendar: false`: these stay on the list with no calendar block. */
  listOnly: string[];
  horizon: Interval;
};

export const GRID_MINUTES = 15;
export const LEAD_MINUTES = 10;
export const MIN_HORIZON_DAYS = 7;
export const MAX_HORIZON_DAYS = 14;
const URGENT_WITHIN_MS = 48 * HOUR_MS;

/** Local hour ranges for preferred windows. */
export const WINDOW_HOURS: Record<TimeWindow, [number, number]> = {
  morning: [8, 12],
  afternoon: [12, 17],
  evening: [17, 21],
};

const GRID_MS = GRID_MINUTES * MINUTE_MS;
const ceilToGrid = (ms: number) => Math.ceil(ms / GRID_MS) * GRID_MS;

/** First instant the planner may use. */
export function planningStart(now: number): number {
  return ceilToGrid(now + LEAD_MINUTES * MINUTE_MS);
}

/** The widest range planSchedule can need busy data for. Use it for the freeBusy query. */
export function maxPlanningRange(now: number): Interval {
  const start = planningStart(now);
  return { start: now, end: start + MAX_HORIZON_DAYS * DAY_MS };
}

const PRIORITY_TIER: Record<Priority, number> = { high: 1, medium: 2, low: 3 };

/** §7.1: deadline within 48 h (any priority) → high → medium → low. */
export function rankTier(task: PlanTask, now: number): number {
  if (task.deadline !== null && task.deadline - now <= URGENT_WITHIN_MS) return 0;
  return PRIORITY_TIER[task.priority];
}

/** Stable ranking: tier, then earliest deadline (none last), then original order. */
export function rankTasks<T extends PlanTask>(tasks: readonly T[], now: number): T[] {
  return tasks
    .map((task, index) => ({ task, index, tier: rankTier(task, now) }))
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        (a.task.deadline ?? Infinity) - (b.task.deadline ?? Infinity) ||
        a.index - b.index
    )
    .map(({ task }) => task);
}

/** Daily local-time windows `[startMinutes, endMinutes)` between `range.start` and `range.end`. */
function dailyWindows(range: Interval, startMinutes: number, endMinutes: number, timeZone: string): Interval[] {
  const windows: Interval[] = [];
  const lastKey = dateKeyAt(range.end, timeZone);
  // Start a day early so a window that began "yesterday" in local time is not missed.
  for (let key = addDays(dateKeyAt(range.start, timeZone), -1); key <= lastKey; key = addDays(key, 1)) {
    windows.push({ start: epochAt(key, startMinutes, timeZone), end: epochAt(key, endMinutes, timeZone) });
  }
  return intersect(windows, [range]);
}

function firstFit(free: readonly Interval[], durationMs: number, window: Interval): Interval | null {
  for (const iv of free) {
    if (iv.start >= window.end) break;
    const start = ceilToGrid(Math.max(iv.start, window.start));
    const end = start + durationMs;
    if (end <= Math.min(iv.end, window.end)) return { start, end };
  }
  return null;
}

export function planSchedule(
  tasks: readonly PlanTask[],
  busy: readonly Interval[],
  settings: SchedulerSettings,
  now: number
): PlanResult {
  const { timeZone } = settings;
  const bufferMs = settings.bufferMinutes * MINUTE_MS;
  const start = planningStart(now);

  const flexible = tasks.filter((t) => t.fixedStart === null && t.scheduleToCalendar);
  const latestDeadline = Math.max(start, ...flexible.map((t) => t.deadline ?? start));
  const horizonDays = Math.min(
    MAX_HORIZON_DAYS,
    Math.max(MIN_HORIZON_DAYS, Math.ceil((latestDeadline - start) / DAY_MS))
  );
  const horizon: Interval = { start, end: start + horizonDays * DAY_MS };

  const busyRaw = normalize(busy);
  const active = dailyWindows(horizon, settings.dayStartMinutes, settings.dayEndMinutes, timeZone);
  let free = subtract(active, busyRaw.map((b) => expand(b, bufferMs)));

  const placements: Placement[] = [];
  const unscheduled: PlanResult['unscheduled'] = [];
  const listOnly: string[] = [];

  // 1. Fixed tasks go exactly where the user said, even outside active hours.
  const fixed = tasks
    .filter((t): t is PlanTask & { fixedStart: number } => t.fixedStart !== null)
    .sort((a, b) => a.fixedStart - b.fixedStart);
  for (const task of fixed) {
    if (task.fixedStart < now) {
      unscheduled.push({ taskId: task.id, reason: 'fixed_time_passed' });
      continue;
    }
    const slot = { start: task.fixedStart, end: task.fixedStart + task.durationMinutes * MINUTE_MS };
    const conflict =
      busyRaw.some((b) => overlaps(b, slot)) || placements.some((p) => overlaps(p, slot));
    placements.push({ taskId: task.id, ...slot, fixed: true, conflict, usedPreferredWindow: false });
    free = subtract(free, [expand(slot, bufferMs)]);
  }

  // 2. Flexible tasks in rank order, first fit on a 15-minute grid.
  for (const task of tasks) {
    if (task.fixedStart === null && !task.scheduleToCalendar) listOnly.push(task.id);
  }
  for (const task of rankTasks(flexible, now)) {
    const durationMs = task.durationMinutes * MINUTE_MS;
    if (task.deadline !== null && task.deadline <= start) {
      unscheduled.push({ taskId: task.id, reason: 'deadline_passed' });
      continue;
    }
    const window: Interval = {
      start: Math.max(start, task.notBefore ?? start),
      end: Math.min(horizon.end, task.deadline ?? horizon.end),
    };
    if (window.start >= horizon.end) {
      unscheduled.push({ taskId: task.id, reason: 'outside_horizon' });
      continue;
    }

    let slot: Interval | null = null;
    let usedPreferredWindow = false;
    if (task.preferredWindow) {
      const [fromHour, toHour] = WINDOW_HOURS[task.preferredWindow];
      const preferred = dailyWindows(horizon, fromHour * 60, toHour * 60, timeZone);
      slot = firstFit(intersect(free, preferred), durationMs, window);
      usedPreferredWindow = slot !== null;
    }
    slot ??= firstFit(free, durationMs, window);

    if (slot) {
      placements.push({ taskId: task.id, ...slot, fixed: false, conflict: false, usedPreferredWindow });
      free = subtract(free, [expand(slot, bufferMs)]);
    } else {
      const reason: UnscheduledReason =
        longest(free) < durationMs
          ? 'longer_than_any_gap'
          : task.deadline !== null
            ? 'no_gap_before_deadline'
            : 'no_free_time';
      unscheduled.push({ taskId: task.id, reason });
    }
  }

  placements.sort((a, b) => a.start - b.start);
  return { placements, unscheduled, listOnly, horizon };
}
