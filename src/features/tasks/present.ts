/** Grouping and wording for the task list and the capture result sheet. Pure. */
import type { Task } from '@/lib/db';
import { rankTasks, type UnscheduledReason } from '@/lib/scheduler/plan-schedule';
import { addDays, dateKeyAt, epochAt, formatDeadline, formatSlot } from '@/lib/time';
import { taskToPlanTask } from '@/features/planning';

export type SectionKey = 'today' | 'upcoming' | 'unscheduled' | 'done';
export type TaskSection = { key: SectionKey; title: string; data: Task[] };

const TITLES: Record<SectionKey, string> = {
  today: 'Today',
  upcoming: 'Upcoming',
  unscheduled: 'Unscheduled',
  done: 'Done',
};

/** Today (incl. overdue) and Upcoming by start time, Unscheduled in rank order, Done newest first. */
export function groupTasks(tasks: readonly Task[], timeZone: string, now: number): TaskSection[] {
  const tomorrow = epochAt(addDays(dateKeyAt(now, timeZone), 1), 0, timeZone);
  const byStart = (a: Task, b: Task) => (a.scheduledStart ?? 0) - (b.scheduledStart ?? 0);
  const todo = tasks.filter((t) => t.status === 'todo');

  const today = todo.filter((t) => t.scheduledStart !== null && t.scheduledStart < tomorrow).sort(byStart);
  const upcoming = todo.filter((t) => t.scheduledStart !== null && t.scheduledStart >= tomorrow).sort(byStart);
  const unscheduledTasks = todo.filter((t) => t.scheduledStart === null);
  const planOrder = rankTasks(unscheduledTasks.map(taskToPlanTask), now).map((p) => p.id);
  const unscheduled = planOrder.map((id) => unscheduledTasks.find((t) => t.id === id)!);
  const done = tasks
    .filter((t) => t.status === 'done')
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));

  const sections: [SectionKey, Task[]][] = [
    ['today', today],
    ['upcoming', upcoming],
    ['unscheduled', unscheduled],
    ['done', done],
  ];
  return sections.filter(([, data]) => data.length > 0).map(([key, data]) => ({ key, title: TITLES[key], data }));
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** The one-line "when" for a task row. */
export function describeWhen(task: Task, timeZone: string, now: number): string {
  if (task.scheduledStart !== null && task.scheduledEnd !== null) {
    return formatSlot(task.scheduledStart, task.scheduledEnd, timeZone, now);
  }
  if (!task.scheduleToCalendar && !task.unscheduledReason) {
    return task.deadline ? `List · due ${formatDeadline(task.deadline, timeZone, now)}` : 'List';
  }
  return describeUnscheduled(task, timeZone, now);
}

/** Why a task got the slot it did (§3.1: "due Fri", "high priority"). */
export function describePlacementReason(task: Task, timeZone: string, now: number): string {
  if (task.fixedStart !== null) return 'at the time you said';
  const parts: string[] = [];
  if (task.deadline !== null) parts.push(`due ${formatDeadline(task.deadline, timeZone, now)}`);
  if (task.priority === 'high') parts.push('high priority');
  if (task.preferredWindow) parts.push(task.preferredWindow);
  return parts.length > 0 ? parts.join(' · ') : 'next free slot';
}

export function describeUnscheduled(task: Task, timeZone: string, now: number): string {
  const reason = task.unscheduledReason as UnscheduledReason | 'calendar_error' | null;
  const duration = formatDuration(task.durationMinutes);
  const deadline = task.deadline !== null ? formatDeadline(task.deadline, timeZone, now) : null;
  switch (reason) {
    case 'no_gap_before_deadline':
      return `No ${duration} gap before ${deadline ?? 'the deadline'}`;
    case 'longer_than_any_gap':
      return `No ${duration} gap in your free time`;
    case 'no_free_time':
      return 'No free time in the next two weeks';
    case 'deadline_passed':
      return 'Deadline already passed';
    case 'fixed_time_passed':
      return 'That time has already passed';
    case 'outside_horizon':
      return 'Too far ahead to schedule yet';
    case 'calendar_error':
      return "Couldn't add to Google Calendar";
    default:
      return 'Not scheduled';
  }
}
