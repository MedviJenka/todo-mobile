/**
 * Google Calendar API v3, called from the device (D2: calendar data never reaches our server).
 * Scopes: calendar.app.created (the app's own calendar + its events) and calendar.freebusy,
 * plus calendar.acls once the user shares the calendar.
 */
import { AppError } from '@/lib/errors';
import type { Interval } from '@/lib/scheduler/plan-schedule';

import { getAccessToken, invalidateAccessToken } from './auth';

const BASE_URL = 'https://www.googleapis.com/calendar/v3';
export const APP_CALENDAR_NAME = 'Voice To-Do';

export class GoogleApiError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string | null,
    message: string
  ) {
    super(message);
    this.name = 'GoogleApiError';
  }
}

const isGone = (error: unknown) =>
  error instanceof GoogleApiError && (error.status === 404 || error.status === 410);

const SCOPE_REASONS = new Set(['insufficientPermissions', 'ACCESS_TOKEN_SCOPE_INSUFFICIENT', 'authError']);

type GoogleErrorBody = {
  error?: { message?: string; status?: string; errors?: { reason?: string }[] };
};

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string>;
};

async function googleFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = `${BASE_URL}${path}${options.query ? `?${new URLSearchParams(options.query)}` : ''}`;
  const send = async (token: string) => {
    try {
      return await fetch(url, {
        method: options.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(options.body !== undefined && { 'Content-Type': 'application/json' }),
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      });
    } catch (cause) {
      if (__DEV__) console.warn(`[calendar] ${path} fetch failed`, cause);
      throw new AppError('offline', "Can't reach Google Calendar.");
    }
  };

  let token = await getAccessToken();
  let response = await send(token);
  if (response.status === 401) {
    // Stale token: clear the cache, fetch a fresh one, retry once.
    invalidateAccessToken(token);
    token = await getAccessToken();
    response = await send(token);
  }

  if (response.ok) {
    return (response.status === 204 ? undefined : await response.json()) as T;
  }

  const body = (await response.json().catch(() => null)) as GoogleErrorBody | null;
  const reason = body?.error?.errors?.[0]?.reason ?? body?.error?.status ?? null;
  if (response.status === 401 || (response.status === 403 && reason && SCOPE_REASONS.has(reason))) {
    throw new AppError('calendar_disconnected', 'Google Calendar access is missing. Reconnect your calendar.', {
      status: response.status,
    });
  }
  throw new GoogleApiError(response.status, reason, body?.error?.message ?? `Google Calendar error ${response.status}`);
}

const enc = encodeURIComponent;
const iso = (ms: number) => new Date(ms).toISOString();

// ---- App calendar -------------------------------------------------------------------------------

async function calendarExists(calendarId: string): Promise<boolean> {
  try {
    await googleFetch(`/calendars/${enc(calendarId)}/events`, { query: { maxResults: '1' } });
    return true;
  } catch (error) {
    if (isGone(error)) return false;
    throw error;
  }
}

/** Returns the "Voice To-Do" calendar ID, creating the calendar if it's missing or was deleted. */
export async function ensureAppCalendar(existingId: string | null, timeZone: string): Promise<string> {
  if (existingId && (await calendarExists(existingId))) return existingId;
  const created = await googleFetch<{ id: string }>('/calendars', {
    method: 'POST',
    body: {
      summary: APP_CALENDAR_NAME,
      description: 'Tasks scheduled by the Voice To-Do app.',
      timeZone,
    },
  });
  return created.id;
}

export async function deleteAppCalendar(calendarId: string): Promise<void> {
  try {
    await googleFetch(`/calendars/${enc(calendarId)}`, { method: 'DELETE' });
  } catch (error) {
    if (!isGone(error)) throw error;
  }
}

// ---- Free/busy ----------------------------------------------------------------------------------

type FreeBusyResponse = {
  calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: { reason?: string }[] }>;
};

export type BusyResult = {
  /** Busy time on the primary calendar (no event details, D3). */
  primary: Interval[];
  /** Busy time on the app calendar (our own events). */
  app: Interval[];
  /** The app calendar no longer exists (deleted in Google Calendar). */
  appCalendarMissing: boolean;
};

export async function queryBusy(range: Interval, timeZone: string, appCalendarId: string): Promise<BusyResult> {
  const response = await googleFetch<FreeBusyResponse>('/freeBusy', {
    method: 'POST',
    body: {
      timeMin: iso(range.start),
      timeMax: iso(range.end),
      timeZone,
      items: [{ id: 'primary' }, { id: appCalendarId }],
    },
  });

  const calendars = response.calendars ?? {};
  // Google keys the result by the requested id. Fall back to "the one that isn't ours".
  const primaryKey = 'primary' in calendars ? 'primary' : Object.keys(calendars).find((k) => k !== appCalendarId);
  const toIntervals = (key: string | undefined) =>
    (key ? (calendars[key]?.busy ?? []) : []).map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }));

  const primaryErrors = primaryKey ? calendars[primaryKey]?.errors : undefined;
  if (primaryErrors?.length) {
    throw new GoogleApiError(500, primaryErrors[0]?.reason ?? null, 'Could not read your calendar availability.');
  }
  const appErrors = calendars[appCalendarId]?.errors ?? [];
  return {
    primary: toIntervals(primaryKey),
    app: toIntervals(appCalendarId),
    appCalendarMissing: appErrors.some((e) => e.reason === 'notFound'),
  };
}

// ---- Events -------------------------------------------------------------------------------------

export type EventFields = {
  title: string;
  notes: string | null;
  start: number;
  end: number;
  timeZone: string;
  reminderMinutes: number;
};

function eventBody(fields: Partial<EventFields>) {
  const body: Record<string, unknown> = {};
  if (fields.title !== undefined) body.summary = fields.title;
  if (fields.notes !== undefined) {
    body.description = [fields.notes, 'Created by Voice To-Do'].filter(Boolean).join('\n\n');
  }
  if (fields.start !== undefined) body.start = { dateTime: iso(fields.start), timeZone: fields.timeZone };
  if (fields.end !== undefined) body.end = { dateTime: iso(fields.end), timeZone: fields.timeZone };
  if (fields.reminderMinutes !== undefined) {
    body.reminders = {
      useDefault: false,
      overrides: fields.reminderMinutes > 0 ? [{ method: 'popup', minutes: fields.reminderMinutes }] : [],
    };
  }
  return body;
}

/** Creates an event on the app calendar. `taskId` links the event back to its task row. */
export async function insertEvent(calendarId: string, taskId: string, fields: EventFields): Promise<string> {
  const event = await googleFetch<{ id: string }>(`/calendars/${enc(calendarId)}/events`, {
    method: 'POST',
    body: { ...eventBody(fields), extendedProperties: { private: { voiceTodoTaskId: taskId } } },
  });
  return event.id;
}

export async function patchEvent(calendarId: string, eventId: string, fields: Partial<EventFields>): Promise<void> {
  await googleFetch(`/calendars/${enc(calendarId)}/events/${enc(eventId)}`, {
    method: 'PATCH',
    body: eventBody(fields),
  });
}

/** Deletes an event. Already-deleted events count as success. */
export async function deleteEvent(calendarId: string, eventId: string): Promise<void> {
  try {
    await googleFetch(`/calendars/${enc(calendarId)}/events/${enc(eventId)}`, { method: 'DELETE' });
  } catch (error) {
    if (!isGone(error)) throw error;
  }
}

export { isGone as isGoogleNotFound };

// ---- Sharing (calendar.acls) ---------------------------------------------------------------------

/**
 * Gives `email` access to the app calendar, or changes the access they already have. Google emails
 * them a link to add it to their own Google Calendar. Returns the ACL rule id.
 */
export async function shareAppCalendar(
  calendarId: string,
  email: string,
  role: 'reader' | 'freeBusyReader'
): Promise<string> {
  const rule = await googleFetch<{ id: string }>(`/calendars/${enc(calendarId)}/acl`, {
    method: 'POST',
    body: { role, scope: { type: 'user', value: email } },
  });
  return rule.id;
}

/** Removes someone's access. Already removed (e.g. in Google Calendar) counts as done. */
export async function unshareAppCalendar(calendarId: string, ruleId: string): Promise<void> {
  try {
    await googleFetch(`/calendars/${enc(calendarId)}/acl/${enc(ruleId)}`, { method: 'DELETE' });
  } catch (error) {
    if (!isGone(error)) throw error;
  }
}

// ---- Event guests -------------------------------------------------------------------------------

export type Attendee = {
  email: string;
  displayName?: string;
  responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted';
};

export async function getEventAttendees(calendarId: string, eventId: string): Promise<Attendee[]> {
  const event = await googleFetch<{ attendees?: Attendee[] }>(`/calendars/${enc(calendarId)}/events/${enc(eventId)}`, {
    query: { fields: 'attendees(email,displayName,responseStatus)' },
  });
  return event.attendees ?? [];
}

/** Replaces the guest list; Google emails new guests an invite (and removed ones a cancellation). */
export async function setEventAttendees(calendarId: string, eventId: string, attendees: Attendee[]): Promise<Attendee[]> {
  const event = await googleFetch<{ attendees?: Attendee[] }>(`/calendars/${enc(calendarId)}/events/${enc(eventId)}`, {
    method: 'PATCH',
    query: { sendUpdates: 'all', fields: 'attendees(email,displayName,responseStatus)' },
    body: { attendees: attendees.map(({ email, displayName }) => ({ email, ...(displayName && { displayName }) })) },
  });
  return event.attendees ?? [];
}
