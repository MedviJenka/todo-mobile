/**
 * Task mutations that keep the row and its Google Calendar event in sync (PRODUCT_PLAN §8).
 * Rows are the source of truth. Calendar failures after a successful row update come back as a
 * warning instead of throwing, so the user's change is never silently lost.
 */
import { deleteTasks, updateTask, type Task, type TaskPatch, type UserSettings } from '@/lib/db';
import { AppError, toAppError } from '@/lib/errors';
import {
  deleteEvent,
  ensureAppCalendar,
  insertEvent,
  isGoogleNotFound,
  patchEvent,
  queryBusy,
} from '@/lib/google/calendar';
import { subtract } from '@/lib/scheduler/intervals';
import { maxPlanningRange, planSchedule, type UnscheduledReason } from '@/lib/scheduler/plan-schedule';
import { taskToPlanTask, toSchedulerSettings } from '@/features/planning';

export type OperationEnv = {
  settings: UserSettings;
  onAppCalendarChanged: (calendarId: string) => Promise<void>;
};

export type OperationResult = { task: Task; warning: AppError | null };

const DONE_PREFIX = '✓ ';

function calendarIdOf(env: OperationEnv): string {
  const id = env.settings.appCalendarId;
  if (!id) throw new AppError('calendar_disconnected', 'Connect Google Calendar first.');
  return id;
}

async function patchQuietly(env: OperationEnv, task: Task, fields: Parameters<typeof patchEvent>[2]) {
  if (!task.calendarEventId) return null;
  try {
    await patchEvent(calendarIdOf(env), task.calendarEventId, fields);
    return null;
  } catch (error) {
    // An event deleted in Google Calendar isn't worth a warning here.
    return isGoogleNotFound(error) ? null : toAppError(error);
  }
}

/** Done: keep the event as history, titled "✓ Title". */
export async function completeTask(task: Task, env: OperationEnv): Promise<OperationResult> {
  const updated = await updateTask(task.id, { status: 'done', completedAt: Date.now() });
  const warning = await patchQuietly(env, task, { title: `${DONE_PREFIX}${task.title}` });
  return { task: updated, warning };
}

export async function reopenTask(task: Task, env: OperationEnv): Promise<OperationResult> {
  const updated = await updateTask(task.id, { status: 'todo', completedAt: null });
  const warning = await patchQuietly(env, task, { title: task.title });
  return { task: updated, warning };
}

/** Deletes the event first, so a failure never leaves an orphan event behind. */
export async function removeTask(task: Task, env: OperationEnv): Promise<void> {
  if (task.calendarEventId) await deleteEvent(calendarIdOf(env), task.calendarEventId);
  await deleteTasks([task.id]);
}

export type TaskEdit = Pick<Task, 'title' | 'notes' | 'priority' | 'durationMinutes' | 'scheduleToCalendar'>;

export async function editTask(task: Task, edit: TaskEdit, env: OperationEnv): Promise<OperationResult> {
  const patch: TaskPatch = { ...edit };
  let warning: AppError | null = null;

  if (task.calendarEventId && !edit.scheduleToCalendar) {
    // Moved to "list only": take it off the calendar.
    await deleteEvent(calendarIdOf(env), task.calendarEventId);
    Object.assign(patch, { calendarEventId: null, scheduledStart: null, scheduledEnd: null, unscheduledReason: null });
  } else if (task.calendarEventId && task.scheduledStart !== null) {
    const end = task.scheduledStart + edit.durationMinutes * 60_000;
    if (edit.durationMinutes !== task.durationMinutes) patch.scheduledEnd = end;
    const title = task.status === 'done' ? `${DONE_PREFIX}${edit.title}` : edit.title;
    warning = await patchQuietly(env, task, {
      title,
      notes: edit.notes,
      ...(edit.durationMinutes !== task.durationMinutes && { end, timeZone: env.settings.timeZone }),
    });
  }

  return { task: await updateTask(task.id, patch), warning };
}

/**
 * Finds the next free slot for one task (ignoring its own current event) and moves or creates
 * its event. "Find a new time" clears a pinned start: the user asked for a new time.
 */
export async function rescheduleTask(
  task: Task,
  env: OperationEnv
): Promise<{ task: Task; reason: UnscheduledReason | null }> {
  const { settings } = env;
  let calendarId = calendarIdOf(env);
  const now = Date.now();

  const busy = await queryBusy(maxPlanningRange(now), settings.timeZone, calendarId);
  let eventId = task.calendarEventId;
  if (busy.appCalendarMissing) {
    calendarId = await ensureAppCalendar(null, settings.timeZone);
    await env.onAppCalendarChanged(calendarId);
    eventId = null;
  }

  const ownSlot =
    task.scheduledStart !== null && task.scheduledEnd !== null
      ? [{ start: task.scheduledStart, end: task.scheduledEnd }]
      : [];
  const plan = planSchedule(
    [{ ...taskToPlanTask(task), fixedStart: null, scheduleToCalendar: true }],
    [...busy.primary, ...subtract(busy.app, ownSlot)],
    toSchedulerSettings(settings),
    now
  );
  const placement = plan.placements[0];
  if (!placement) return { task, reason: plan.unscheduled[0]?.reason ?? 'no_free_time' };

  const fields = {
    title: task.title,
    notes: task.notes,
    start: placement.start,
    end: placement.end,
    timeZone: settings.timeZone,
    reminderMinutes: settings.reminderMinutes,
  };
  if (eventId) {
    try {
      await patchEvent(calendarId, eventId, fields);
    } catch (error) {
      if (!isGoogleNotFound(error)) throw error;
      eventId = null; // deleted in Google Calendar: create a fresh one below
    }
  }
  eventId ??= await insertEvent(calendarId, task.id, fields);

  const updated = await updateTask(task.id, {
    scheduledStart: placement.start,
    scheduledEnd: placement.end,
    calendarEventId: eventId,
    fixedStart: null,
    scheduleToCalendar: true,
    unscheduledReason: null,
  });
  return { task: updated, reason: null };
}
