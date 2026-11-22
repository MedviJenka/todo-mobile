/**
 * Supabase tables (supabase/migrations/*_init.sql). RLS scopes every query to the signed-in user.
 * Rows use snake_case and timestamptz strings. The app works with `Task` (camelCase, epoch ms).
 */
import type { Priority, PreferredWindow } from '@/schemas/ai-schema';
import { AppError } from '@/lib/errors';
import type { UnscheduledReason } from '@/lib/scheduler/plan-schedule';
import { formatTimeOfDay, parseTimeOfDay } from '@/lib/time';
import { supabase } from '@/lib/supabase';

export type TaskStatus = 'todo' | 'done';

export type TaskRow = {
  id: string;
  capture_id: string | null;
  title: string;
  notes: string | null;
  priority: Priority;
  duration_minutes: number;
  fixed_start: string | null;
  not_before: string | null;
  deadline: string | null;
  preferred_window: PreferredWindow | null;
  schedule_to_calendar: boolean;
  status: TaskStatus;
  scheduled_start: string | null;
  scheduled_end: string | null;
  calendar_event_id: string | null;
  unscheduled_reason: string | null;
  completed_at: string | null;
  created_at: string;
};

export type Task = {
  id: string;
  captureId: string | null;
  title: string;
  notes: string | null;
  priority: Priority;
  durationMinutes: number;
  fixedStart: number | null;
  notBefore: number | null;
  deadline: number | null;
  preferredWindow: PreferredWindow | null;
  scheduleToCalendar: boolean;
  status: TaskStatus;
  scheduledStart: number | null;
  scheduledEnd: number | null;
  calendarEventId: string | null;
  unscheduledReason: UnscheduledReason | 'calendar_error' | null;
  completedAt: number | null;
  createdAt: number;
};

const toMs = (value: string | null) => (value === null ? null : Date.parse(value));
const toIso = (value: number | null) => (value === null ? null : new Date(value).toISOString());

export function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    captureId: row.capture_id,
    title: row.title,
    notes: row.notes,
    priority: row.priority,
    durationMinutes: row.duration_minutes,
    fixedStart: toMs(row.fixed_start),
    notBefore: toMs(row.not_before),
    deadline: toMs(row.deadline),
    preferredWindow: row.preferred_window,
    scheduleToCalendar: row.schedule_to_calendar,
    status: row.status,
    scheduledStart: toMs(row.scheduled_start),
    scheduledEnd: toMs(row.scheduled_end),
    calendarEventId: row.calendar_event_id,
    unscheduledReason: row.unscheduled_reason as Task['unscheduledReason'],
    completedAt: toMs(row.completed_at),
    createdAt: Date.parse(row.created_at),
  };
}

export function taskToRow(task: Omit<Task, 'createdAt'>): Omit<TaskRow, 'created_at'> {
  return {
    id: task.id,
    capture_id: task.captureId,
    title: task.title,
    notes: task.notes,
    priority: task.priority,
    duration_minutes: task.durationMinutes,
    fixed_start: toIso(task.fixedStart),
    not_before: toIso(task.notBefore),
    deadline: toIso(task.deadline),
    preferred_window: task.preferredWindow,
    schedule_to_calendar: task.scheduleToCalendar,
    status: task.status,
    scheduled_start: toIso(task.scheduledStart),
    scheduled_end: toIso(task.scheduledEnd),
    calendar_event_id: task.calendarEventId,
    unscheduled_reason: task.unscheduledReason,
    completed_at: toIso(task.completedAt),
  };
}

function fail(action: string, error: { message: string } | null): never {
  throw new AppError('server_error', `Could not ${action}: ${error?.message ?? 'unknown error'}`);
}

const TASK_COLUMNS =
  'id, capture_id, title, notes, priority, duration_minutes, fixed_start, not_before, deadline, preferred_window, ' +
  'schedule_to_calendar, status, scheduled_start, scheduled_end, calendar_event_id, unscheduled_reason, completed_at, created_at';

/** Open tasks plus anything completed in the last 14 days. */
export async function fetchTasks(): Promise<Task[]> {
  const doneSince = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_COLUMNS)
    .or(`status.eq.todo,completed_at.gte."${doneSince}"`)
    .order('created_at', { ascending: true })
    .limit(1000);
  if (error) fail('load tasks', error);
  return (data as unknown as TaskRow[]).map(rowToTask);
}

/** Inserts new tasks, or replaces existing ones with the same id. */
export async function saveTasks(tasks: Omit<Task, 'createdAt'>[]): Promise<Task[]> {
  if (tasks.length === 0) return [];
  const { data, error } = await supabase
    .from('tasks')
    .upsert(tasks.map(taskToRow), { onConflict: 'id' })
    .select(TASK_COLUMNS);
  if (error) fail('save tasks', error);
  return (data as unknown as TaskRow[]).map(rowToTask);
}

export type TaskPatch = Partial<Omit<Task, 'id' | 'createdAt'>>;

const TIME_KEYS = new Set<keyof Task>(['fixedStart', 'notBefore', 'deadline', 'scheduledStart', 'scheduledEnd', 'completedAt']);

export async function updateTask(id: string, patch: TaskPatch): Promise<Task> {
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch) as [keyof Task, unknown][]) {
    const column = CAMEL_TO_COLUMN[key];
    if (!column || value === undefined) continue;
    row[column] = TIME_KEYS.has(key) ? toIso(value as number | null) : value;
  }
  const { data, error } = await supabase.from('tasks').update(row).eq('id', id).select(TASK_COLUMNS).single();
  if (error) fail('update the task', error);
  return rowToTask(data as unknown as TaskRow);
}

const CAMEL_TO_COLUMN: Partial<Record<keyof Task, keyof Omit<TaskRow, 'created_at'>>> = {
  captureId: 'capture_id',
  title: 'title',
  notes: 'notes',
  priority: 'priority',
  durationMinutes: 'duration_minutes',
  fixedStart: 'fixed_start',
  notBefore: 'not_before',
  deadline: 'deadline',
  preferredWindow: 'preferred_window',
  scheduleToCalendar: 'schedule_to_calendar',
  status: 'status',
  scheduledStart: 'scheduled_start',
  scheduledEnd: 'scheduled_end',
  calendarEventId: 'calendar_event_id',
  unscheduledReason: 'unscheduled_reason',
  completedAt: 'completed_at',
};

export async function deleteTasks(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from('tasks').delete().in('id', ids);
  if (error) fail('delete tasks', error);
}

// ---- Settings -----------------------------------------------------------------------------------

export type UserSettings = {
  timeZone: string;
  /** "HH:mm" */
  dayStart: string;
  dayEnd: string;
  bufferMinutes: number;
  reminderMinutes: number;
  appCalendarId: string | null;
};

export const DEFAULT_SETTINGS: Omit<UserSettings, 'timeZone'> = {
  dayStart: '09:00',
  dayEnd: '20:00',
  bufferMinutes: 10,
  reminderMinutes: 10,
  appCalendarId: null,
};

type SettingsRow = {
  time_zone: string;
  day_start: string;
  day_end: string;
  buffer_minutes: number;
  reminder_minutes: number;
  app_calendar_id: string | null;
};

const normalizeTime = (value: string) => formatTimeOfDay(parseTimeOfDay(value));

function rowToSettings(row: SettingsRow): UserSettings {
  return {
    timeZone: row.time_zone,
    dayStart: normalizeTime(row.day_start),
    dayEnd: normalizeTime(row.day_end),
    bufferMinutes: row.buffer_minutes,
    reminderMinutes: row.reminder_minutes,
    appCalendarId: row.app_calendar_id,
  };
}

const SETTINGS_COLUMNS = 'time_zone, day_start, day_end, buffer_minutes, reminder_minutes, app_calendar_id';

export async function fetchSettings(): Promise<UserSettings | null> {
  const { data, error } = await supabase.from('user_settings').select(SETTINGS_COLUMNS).maybeSingle();
  if (error) fail('load settings', error);
  return data ? rowToSettings(data as SettingsRow) : null;
}

export async function saveSettings(settings: UserSettings): Promise<UserSettings> {
  const { data, error } = await supabase
    .from('user_settings')
    .upsert(
      {
        time_zone: settings.timeZone,
        day_start: settings.dayStart,
        day_end: settings.dayEnd,
        buffer_minutes: settings.bufferMinutes,
        reminder_minutes: settings.reminderMinutes,
        app_calendar_id: settings.appCalendarId,
      },
      { onConflict: 'user_id' }
    )
    .select(SETTINGS_COLUMNS)
    .single();
  if (error) fail('save settings', error);
  return rowToSettings(data as SettingsRow);
}

/** Deletes every row the user owns (tasks, transcripts, settings). */
export async function deleteAllUserData(userId: string): Promise<void> {
  for (const table of ['tasks', 'captures', 'user_settings'] as const) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId);
    if (error) fail(`delete ${table}`, error);
  }
}
