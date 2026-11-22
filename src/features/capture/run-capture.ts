/**
 * The core loop (PRODUCT_PLAN §4): transcribe → (extract ∥ freeBusy) → plan → commit → undo.
 * Each stage reports progress, so a failure can resume from the furthest completed step.
 */
import * as Crypto from 'expo-crypto';

import { extractTasks, transcribeAudio } from '@/lib/api';
import { mapSettled } from '@/lib/concurrency';
import { deleteTasks, saveTasks, type Task, type UserSettings } from '@/lib/db';
import { deviceLanguages, deviceLocale } from '@/lib/device';
import { AppError, toAppError } from '@/lib/errors';
import { deleteEvent, ensureAppCalendar, insertEvent, queryBusy } from '@/lib/google/calendar';
import { maxPlanningRange, planSchedule } from '@/lib/scheduler/plan-schedule';
import { toOffsetIso } from '@/lib/time';
import { extractedToPlanTask, toSchedulerSettings } from '@/features/planning';
import { deleteRecording } from './use-voice-capture';

export type CaptureStage = 'transcribing' | 'planning' | 'booking';

export type CaptureSource =
  | { kind: 'audio'; uri: string; durationSeconds: number }
  /** Typed input, or re-running an existing transcript (then `captureId` is set). */
  | { kind: 'text'; text: string; captureId: string | null };

export type CaptureOutcome = {
  captureId: string;
  transcript: string;
  /** Created tasks, in the order they were spoken. */
  tasks: Task[];
  unparsed: string[];
  /** Calendar trouble while creating events. The tasks were still saved. */
  calendarError: AppError | null;
  undo: () => Promise<void>;
};

export type CaptureCallbacks = {
  onStage: (stage: CaptureStage) => void;
  /** The transcript exists from here on, so a retry doesn't need to upload audio again. */
  onTranscript: (captureId: string, transcript: string) => void;
  /** The app calendar was deleted in Google Calendar and has been recreated. */
  onAppCalendarChanged: (calendarId: string) => Promise<void>;
};

const EVENT_CONCURRENCY = 3;

export async function runCapture(
  source: CaptureSource,
  settings: UserSettings,
  callbacks: CaptureCallbacks
): Promise<CaptureOutcome> {
  if (!settings.appCalendarId) {
    throw new AppError('calendar_disconnected', 'Connect Google Calendar first.');
  }
  const { timeZone } = settings;
  let calendarId = settings.appCalendarId;

  // 1. Speech → text
  let captureId: string | null;
  let transcript: string;
  if (source.kind === 'audio') {
    callbacks.onStage('transcribing');
    const result = await transcribeAudio(source.uri, source.durationSeconds, deviceLanguages());
    deleteRecording(source.uri);
    captureId = result.captureId;
    transcript = result.transcript;
    callbacks.onTranscript(captureId, transcript);
  } else {
    captureId = source.captureId;
    transcript = source.text.trim();
  }

  // 2. Text → tasks, and busy time, in parallel
  callbacks.onStage('planning');
  const now = Date.now();
  const [extraction, busy] = await Promise.all([
    extractTasks({
      captureId,
      transcript,
      now: toOffsetIso(now, timeZone),
      timeZone,
      dayStart: settings.dayStart,
      dayEnd: settings.dayEnd,
      locale: deviceLocale(),
    }),
    queryBusy(maxPlanningRange(now), timeZone, calendarId),
  ]);
  if (captureId === null) callbacks.onTranscript(extraction.captureId, transcript);
  captureId = extraction.captureId;

  if (busy.appCalendarMissing) {
    calendarId = await ensureAppCalendar(null, timeZone);
    await callbacks.onAppCalendarChanged(calendarId);
  }

  // 3. Plan on device (pure)
  const ids = extraction.tasks.map(() => Crypto.randomUUID());
  const planTasks = extraction.tasks.map((task, i) => extractedToPlanTask(task, ids[i], timeZone));
  const plan = planSchedule(planTasks, [...busy.primary, ...busy.app], toSchedulerSettings(settings), now);
  const placements = new Map(plan.placements.map((p) => [p.taskId, p]));
  const reasons = new Map(plan.unscheduled.map((u) => [u.taskId, u.reason]));

  const drafts: Omit<Task, 'createdAt'>[] = extraction.tasks.map((task, i) => {
    const id = ids[i];
    const planned = planTasks[i];
    const placement = placements.get(id);
    return {
      id,
      captureId,
      title: task.title,
      notes: task.notes,
      priority: task.priority,
      durationMinutes: task.durationMinutes,
      fixedStart: planned.fixedStart,
      notBefore: planned.notBefore,
      deadline: planned.deadline,
      preferredWindow: task.preferredWindow,
      scheduleToCalendar: planned.scheduleToCalendar,
      status: 'todo',
      scheduledStart: placement?.start ?? null,
      scheduledEnd: placement?.end ?? null,
      calendarEventId: null,
      unscheduledReason: reasons.get(id) ?? null,
      completedAt: null,
    };
  });

  // 4. Commit: rows first (tasks survive any calendar failure), then events, then link them.
  callbacks.onStage('booking');
  const inserted = await saveTasks(drafts);

  const toBook = drafts.filter((d) => d.scheduledStart !== null && d.scheduledEnd !== null);
  const booked = await mapSettled(toBook, EVENT_CONCURRENCY, (d) =>
    insertEvent(calendarId, d.id, {
      title: d.title,
      notes: d.notes,
      start: d.scheduledStart!,
      end: d.scheduledEnd!,
      timeZone,
      reminderMinutes: settings.reminderMinutes,
    })
  );
  const eventIdByTask = new Map<string, string>();
  let calendarError: AppError | null = null;
  booked.forEach((result, i) => {
    if (result.status === 'fulfilled') eventIdByTask.set(toBook[i].id, result.value);
    else calendarError ??= toAppError(result.reason);
  });

  const finalDrafts = drafts.map((d): Omit<Task, 'createdAt'> => {
    if (d.scheduledStart === null) return d;
    const eventId = eventIdByTask.get(d.id);
    return eventId
      ? { ...d, calendarEventId: eventId }
      : { ...d, scheduledStart: null, scheduledEnd: null, unscheduledReason: 'calendar_error' };
  });

  let saved = inserted;
  try {
    if (toBook.length > 0) saved = await saveTasks(finalDrafts);
  } catch (error) {
    // Couldn't link events to rows: remove the events so nothing is booked that the list doesn't know about.
    await mapSettled([...eventIdByTask.values()], EVENT_CONCURRENCY, (id) => deleteEvent(calendarId, id));
    await deleteTasks(ids).catch(() => undefined);
    throw error;
  }

  const order = new Map(ids.map((id, i) => [id, i]));
  saved.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const eventIds = [...eventIdByTask.values()];

  return {
    captureId,
    transcript,
    tasks: saved,
    unparsed: extraction.unparsed,
    calendarError,
    undo: async () => {
      const results = await mapSettled(eventIds, EVENT_CONCURRENCY, (id) => deleteEvent(calendarId, id));
      const failed = results.find((r) => r.status === 'rejected');
      if (failed && failed.status === 'rejected') throw toAppError(failed.reason);
      await deleteTasks(ids);
    },
  };
}
