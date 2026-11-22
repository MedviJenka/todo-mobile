/** Glue between stored/extracted tasks and the pure scheduler. */
import type { ExtractedTask } from '@/schemas/ai-schema';
import type { Task, UserSettings } from '@/lib/db';
import type { PlanTask, SchedulerSettings } from '@/lib/scheduler/plan-schedule';
import { localDateTimeToEpoch, parseTimeOfDay } from '@/lib/time';

export function toSchedulerSettings(settings: UserSettings): SchedulerSettings {
  return {
    timeZone: settings.timeZone,
    dayStartMinutes: parseTimeOfDay(settings.dayStart),
    dayEndMinutes: parseTimeOfDay(settings.dayEnd),
    bufferMinutes: settings.bufferMinutes,
  };
}

/**
 * The model returns local wall-clock strings. Convert them with the user's time zone here, so
 * the model never does offset math. A date-only deadline ("by Friday") means the end of that day.
 */
export function extractedToPlanTask(task: ExtractedTask, id: string, timeZone: string): PlanTask {
  return {
    id,
    priority: task.priority,
    durationMinutes: task.durationMinutes,
    fixedStart: task.fixedStart ? localDateTimeToEpoch(task.fixedStart, timeZone) : null,
    notBefore: task.notBefore ? localDateTimeToEpoch(task.notBefore, timeZone, 'startOfDay') : null,
    deadline: task.deadline ? localDateTimeToEpoch(task.deadline, timeZone, 'endOfDay') : null,
    preferredWindow: task.preferredWindow,
    scheduleToCalendar: task.scheduleToCalendar || task.fixedStart !== null,
  };
}

export function taskToPlanTask(task: Task): PlanTask {
  return {
    id: task.id,
    priority: task.priority,
    durationMinutes: task.durationMinutes,
    fixedStart: task.fixedStart,
    notBefore: task.notBefore,
    deadline: task.deadline,
    preferredWindow: task.preferredWindow,
    scheduleToCalendar: task.scheduleToCalendar,
  };
}
