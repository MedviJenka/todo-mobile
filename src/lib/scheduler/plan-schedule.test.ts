import { localDateTimeToEpoch } from '@/lib/time';

import { intersect, normalize, subtract } from './intervals';
import {
  MAX_HORIZON_DAYS,
  planSchedule,
  rankTasks,
  type Interval,
  type PlanTask,
  type SchedulerSettings,
} from './plan-schedule';

const TZ = 'Europe/Berlin';
const settings: SchedulerSettings = {
  timeZone: TZ,
  dayStartMinutes: 9 * 60,
  dayEndMinutes: 20 * 60,
  bufferMinutes: 10,
};

/** Local wall-clock in Berlin → epoch ms. Date-only values are the start of that day. */
const at = (local: string) => localDateTimeToEpoch(local, TZ)!;
/** "by <date>" → exclusive end of that local day. */
const by = (date: string) => localDateTimeToEpoch(date, TZ, 'endOfDay')!;
const busy = (from: string, to: string): Interval => ({ start: at(from), end: at(to) });

let seq = 0;
function task(overrides: Partial<PlanTask> = {}): PlanTask {
  return {
    id: overrides.id ?? `t${++seq}`,
    priority: 'medium',
    durationMinutes: 60,
    fixedStart: null,
    notBefore: null,
    deadline: null,
    preferredWindow: null,
    scheduleToCalendar: true,
    ...overrides,
  };
}

function slotOf(result: ReturnType<typeof planSchedule>, id: string) {
  const p = result.placements.find((placement) => placement.taskId === id);
  return p && { start: p.start, end: p.end };
}

// Monday 23 Nov 2026, 08:40 Berlin (the PRODUCT_PLAN §3.2 example)
const MONDAY_0840 = at('2026-11-23T08:40');

describe('planSchedule', () => {
  it('reproduces the §3.2 worked example', () => {
    const dentist = task({ id: 'dentist', priority: 'high', fixedStart: at('2026-11-24T10:00') });
    const report = task({ id: 'report', priority: 'high', durationMinutes: 180, deadline: by('2026-11-27') });
    const mom = task({ id: 'mom', priority: 'medium', durationMinutes: 15, deadline: by('2026-11-29') });
    const milk = task({ id: 'milk', priority: 'low', durationMinutes: 15, scheduleToCalendar: false });

    const result = planSchedule(
      [dentist, report, mom, milk],
      [busy('2026-11-23T09:00', '2026-11-23T12:00')],
      settings,
      MONDAY_0840
    );

    expect(slotOf(result, 'dentist')).toEqual(busy('2026-11-24T10:00', '2026-11-24T11:00'));
    expect(slotOf(result, 'report')).toEqual(busy('2026-11-23T12:15', '2026-11-23T15:15'));
    expect(slotOf(result, 'mom')).toEqual(busy('2026-11-23T15:30', '2026-11-23T15:45'));
    expect(result.listOnly).toEqual(['milk']);
    expect(result.unscheduled).toEqual([]);
    expect(result.placements.map((p) => p.taskId)).toEqual(['report', 'mom', 'dentist']);
    expect(result.placements.find((p) => p.taskId === 'dentist')).toMatchObject({ fixed: true, conflict: false });
  });

  it('uses the first slot of the day on an empty calendar', () => {
    const t = task();
    const result = planSchedule([t], [], settings, MONDAY_0840);
    expect(slotOf(result, t.id)).toEqual(busy('2026-11-23T09:00', '2026-11-23T10:00'));
  });

  it('moves to the next day when today is fully booked', () => {
    const t = task();
    const result = planSchedule([t], [busy('2026-11-23T09:00', '2026-11-23T20:00')], settings, MONDAY_0840);
    expect(slotOf(result, t.id)).toEqual(busy('2026-11-24T09:00', '2026-11-24T10:00'));
  });

  it('reports a task longer than every gap', () => {
    const lunches: Interval[] = [];
    for (let day = 23; day <= 30 + 10; day++) {
      const d = new Date(Date.UTC(2026, 10, day));
      const key = d.toISOString().slice(0, 10);
      lunches.push(busy(`${key}T13:00`, `${key}T14:00`));
    }
    const t = task({ durationMinutes: 480 });
    const result = planSchedule([t], lunches, settings, MONDAY_0840);
    expect(result.unscheduled).toEqual([{ taskId: t.id, reason: 'longer_than_any_gap' }]);
  });

  it('never books late: no gap before the deadline stays unscheduled', () => {
    const t = task({ durationMinutes: 30, deadline: by('2026-11-23') });
    const result = planSchedule([t], [busy('2026-11-23T09:00', '2026-11-23T20:00')], settings, MONDAY_0840);
    expect(result.placements).toEqual([]);
    expect(result.unscheduled).toEqual([{ taskId: t.id, reason: 'no_gap_before_deadline' }]);
  });

  it('pins a fixed task over a meeting and flags the conflict', () => {
    const dentist = task({ fixedStart: at('2026-11-24T10:00') });
    const result = planSchedule([dentist], [busy('2026-11-24T10:30', '2026-11-24T11:30')], settings, MONDAY_0840);
    expect(slotOf(result, dentist.id)).toEqual(busy('2026-11-24T10:00', '2026-11-24T11:00'));
    expect(result.placements[0]).toMatchObject({ fixed: true, conflict: true });
  });

  it('keeps fixed tasks outside active hours where the user said', () => {
    const early = task({ fixedStart: at('2026-11-24T07:00'), durationMinutes: 30 });
    const result = planSchedule([early], [], settings, MONDAY_0840);
    expect(slotOf(result, early.id)).toEqual(busy('2026-11-24T07:00', '2026-11-24T07:30'));
  });

  it('keeps flexible tasks clear of fixed tasks plus buffer', () => {
    const fixed = task({ id: 'fixed', fixedStart: at('2026-11-23T09:00') });
    const flex = task({ id: 'flex' });
    const result = planSchedule([flex, fixed], [], settings, MONDAY_0840);
    expect(slotOf(result, 'flex')).toEqual(busy('2026-11-23T10:15', '2026-11-23T11:15'));
  });

  it('honours a preferred window when it has room', () => {
    const t = task({ preferredWindow: 'afternoon' });
    const result = planSchedule([t], [], settings, MONDAY_0840);
    expect(slotOf(result, t.id)).toEqual(busy('2026-11-23T12:00', '2026-11-23T13:00'));
    expect(result.placements[0].usedPreferredWindow).toBe(true);
  });

  it('drops the time-of-day preference when that window is full', () => {
    const t = task({ preferredWindow: 'evening', deadline: by('2026-11-23') });
    const result = planSchedule([t], [busy('2026-11-23T17:00', '2026-11-23T20:00')], settings, MONDAY_0840);
    expect(slotOf(result, t.id)).toEqual(busy('2026-11-23T09:00', '2026-11-23T10:00'));
    expect(result.placements[0].usedPreferredWindow).toBe(false);
  });

  it('starts after the current meeting when "now" is inside one', () => {
    const t = task();
    const result = planSchedule(
      [t],
      [busy('2026-11-23T10:00', '2026-11-23T12:00')],
      settings,
      at('2026-11-23T10:30')
    );
    expect(slotOf(result, t.id)).toEqual(busy('2026-11-23T12:15', '2026-11-23T13:15'));
  });

  it('leaves a buffer between tasks, snapped to the 15-minute grid', () => {
    const a = task({ id: 'a' });
    const b = task({ id: 'b' });
    const result = planSchedule([a, b], [], settings, MONDAY_0840);
    expect(slotOf(result, 'b')).toEqual(busy('2026-11-23T10:15', '2026-11-23T11:15'));

    const noBuffer = planSchedule([a, b], [], { ...settings, bufferMinutes: 0 }, MONDAY_0840);
    expect(slotOf(noBuffer, 'b')).toEqual(busy('2026-11-23T10:00', '2026-11-23T11:00'));
  });

  it('orders by tier: deadline ≤48 h, then high, medium, low', () => {
    const high = task({ id: 'high', priority: 'high' });
    const urgentLow = task({ id: 'urgentLow', priority: 'low', deadline: by('2026-11-24') });
    const medium = task({ id: 'medium', priority: 'medium', deadline: by('2026-11-27') });
    const result = planSchedule([medium, high, urgentLow], [], settings, MONDAY_0840);
    expect(result.placements.map((p) => p.taskId)).toEqual(['urgentLow', 'high', 'medium']);
  });

  it('breaks ties by earliest deadline, then capture order', () => {
    const now = MONDAY_0840;
    const a = task({ id: 'a', priority: 'high' });
    const b = task({ id: 'b', priority: 'high', deadline: by('2026-11-28') });
    const c = task({ id: 'c', priority: 'high', deadline: by('2026-11-27') });
    const d = task({ id: 'd', priority: 'high' });
    expect(rankTasks([a, b, c, d], now).map((t) => t.id)).toEqual(['c', 'b', 'a', 'd']);
  });

  it('uses correct local hours on the spring-forward DST day', () => {
    // Clocks go 02:00 → 03:00 on Sun 28 Mar 2027 in Berlin (UTC+1 → UTC+2).
    const t = task();
    const result = planSchedule([t], [], settings, at('2027-03-27T21:00'));
    expect(result.placements[0].start).toBe(Date.UTC(2027, 2, 28, 7, 0)); // 09:00 CEST
    expect(result.placements[0].end).toBe(Date.UTC(2027, 2, 28, 8, 0));
  });

  it('uses correct local hours on the fall-back DST day', () => {
    // Clocks go 03:00 → 02:00 on Sun 31 Oct 2027 in Berlin (UTC+2 → UTC+1).
    const t = task();
    const result = planSchedule([t], [], settings, at('2027-10-30T21:00'));
    expect(result.placements[0].start).toBe(Date.UTC(2027, 9, 31, 8, 0)); // 09:00 CET
  });

  it('handles "now" just before midnight', () => {
    const t = task();
    const result = planSchedule([t], [], settings, at('2026-11-23T23:55'));
    expect(slotOf(result, t.id)).toEqual(busy('2026-11-24T09:00', '2026-11-24T10:00'));
  });

  it('extends the horizon to reach a far deadline, capped at 14 days', () => {
    const t = task({ deadline: by('2026-12-04') });
    const result = planSchedule([t], [busy('2026-11-23T00:00', '2026-12-02T00:00')], settings, MONDAY_0840);
    expect(slotOf(result, t.id)).toEqual(busy('2026-12-02T09:00', '2026-12-02T10:00'));

    const far = planSchedule([task({ deadline: by('2027-01-30') })], [], settings, MONDAY_0840);
    expect(far.horizon.end - far.horizon.start).toBe(MAX_HORIZON_DAYS * 24 * 3600 * 1000);
  });

  it('reports notBefore beyond the horizon', () => {
    const t = task({ notBefore: at('2027-01-15') });
    const result = planSchedule([t], [], settings, MONDAY_0840);
    expect(result.unscheduled).toEqual([{ taskId: t.id, reason: 'outside_horizon' }]);
  });

  it('respects notBefore ("on Friday")', () => {
    const t = task({ notBefore: at('2026-11-27'), deadline: by('2026-11-27') });
    const result = planSchedule([t], [], settings, MONDAY_0840);
    expect(slotOf(result, t.id)).toEqual(busy('2026-11-27T09:00', '2026-11-27T10:00'));
  });

  it('rejects deadlines and fixed times already in the past', () => {
    const late = task({ id: 'late', deadline: by('2026-11-22') });
    const missed = task({ id: 'missed', fixedStart: at('2026-11-23T08:00') });
    const result = planSchedule([late, missed], [], settings, MONDAY_0840);
    expect(result.placements).toEqual([]);
    expect(result.unscheduled).toEqual(
      expect.arrayContaining([
        { taskId: 'late', reason: 'deadline_passed' },
        { taskId: 'missed', reason: 'fixed_time_passed' },
      ])
    );
  });
});

describe('intervals', () => {
  const iv = (start: number, end: number) => ({ start, end });

  it('normalize merges overlapping and touching intervals', () => {
    expect(normalize([iv(5, 7), iv(1, 3), iv(3, 4), iv(6, 9), iv(10, 10)])).toEqual([iv(1, 4), iv(5, 9)]);
  });

  it('subtract cuts holes', () => {
    expect(subtract([iv(0, 10)], [iv(2, 3), iv(5, 7), iv(9, 12)])).toEqual([iv(0, 2), iv(3, 5), iv(7, 9)]);
    expect(subtract([iv(0, 10)], [iv(-5, 20)])).toEqual([]);
  });

  it('intersect keeps the overlap', () => {
    expect(intersect([iv(0, 5), iv(8, 12)], [iv(3, 10)])).toEqual([iv(3, 5), iv(8, 10)]);
  });
});
