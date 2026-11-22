import type { Task } from '@/lib/db';
import { localDateTimeToEpoch } from '@/lib/time';

import { describeUnscheduled, formatDuration, groupTasks } from './present';

const TZ = 'Europe/Berlin';
const at = (s: string) => localDateTimeToEpoch(s, TZ)!;
const NOW = at('2026-11-23T08:40');

function task(overrides: Partial<Task>): Task {
  return {
    id: overrides.id ?? Math.random().toString(36),
    captureId: null,
    title: 'Task',
    notes: null,
    priority: 'medium',
    durationMinutes: 30,
    fixedStart: null,
    notBefore: null,
    deadline: null,
    preferredWindow: null,
    scheduleToCalendar: true,
    status: 'todo',
    scheduledStart: null,
    scheduledEnd: null,
    calendarEventId: null,
    unscheduledReason: null,
    completedAt: null,
    createdAt: NOW,
    ...overrides,
  };
}

describe('groupTasks', () => {
  it('splits into Today / Upcoming / Unscheduled / Done', () => {
    const sections = groupTasks(
      [
        task({ id: 'later', scheduledStart: at('2026-11-23T15:00'), scheduledEnd: at('2026-11-23T16:00') }),
        task({ id: 'overdue', scheduledStart: at('2026-11-22T10:00'), scheduledEnd: at('2026-11-22T11:00') }),
        task({ id: 'tomorrow', scheduledStart: at('2026-11-24T09:00'), scheduledEnd: at('2026-11-24T10:00') }),
        task({ id: 'low', priority: 'low' }),
        task({ id: 'high', priority: 'high' }),
        task({ id: 'done-old', status: 'done', completedAt: at('2026-11-20T10:00') }),
        task({ id: 'done-new', status: 'done', completedAt: at('2026-11-23T08:00') }),
      ],
      TZ,
      NOW
    );
    expect(sections.map((s) => [s.key, s.data.map((t) => t.id)])).toEqual([
      ['today', ['overdue', 'later']],
      ['upcoming', ['tomorrow']],
      ['unscheduled', ['high', 'low']],
      ['done', ['done-new', 'done-old']],
    ]);
  });

  it('omits empty sections', () => {
    expect(groupTasks([], TZ, NOW)).toEqual([]);
  });
});

describe('wording', () => {
  it('formats durations', () => {
    expect(formatDuration(15)).toBe('15 min');
    expect(formatDuration(180)).toBe('3 h');
    expect(formatDuration(90)).toBe('1 h 30 min');
  });

  it('explains a missing gap before the deadline', () => {
    const t = task({
      durationMinutes: 180,
      unscheduledReason: 'no_gap_before_deadline',
      deadline: localDateTimeToEpoch('2026-11-27', TZ, 'endOfDay'),
    });
    expect(describeUnscheduled(t, TZ, NOW)).toMatch(/^No 3 h gap before .*27/);
  });
});
