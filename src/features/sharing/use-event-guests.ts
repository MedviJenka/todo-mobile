import { useCallback, useEffect, useState } from 'react';

import { AppError, toAppError } from '@/lib/errors';
import { getEventAttendees, setEventAttendees, type Attendee } from '@/lib/google/calendar';

import { isValidEmail, normalizeEmail } from './contact';

/** Guests on a task's calendar event. `eventId` null means the task isn't on the calendar. */
export function useEventGuests(calendarId: string, eventId: string | null) {
  const [loaded, setLoaded] = useState<{ eventId: string; guests: Attendee[] } | null>(null);
  const [error, setError] = useState<AppError | null>(null);

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    getEventAttendees(calendarId, eventId).then(
      (guests) => !cancelled && setLoaded({ eventId, guests }),
      (e) => !cancelled && setError(toAppError(e))
    );
    return () => {
      cancelled = true;
    };
  }, [calendarId, eventId]);

  const guests = loaded && loaded.eventId === eventId ? loaded.guests : null;

  const update = useCallback(
    async (next: Attendee[]) => {
      if (!eventId) throw new AppError('unknown', 'Book this task in your calendar to invite people.');
      const saved = await setEventAttendees(calendarId, eventId, next);
      setLoaded({ eventId, guests: saved });
    },
    [calendarId, eventId]
  );

  const invite = useCallback(
    async (email: string, displayName?: string) => {
      const address = normalizeEmail(email);
      if (!isValidEmail(address)) throw new AppError('unknown', 'Enter a valid email address.');
      const current = guests ?? [];
      if (current.some((g) => normalizeEmail(g.email) === address)) return;
      await update([...current, { email: address, displayName }]);
    },
    [guests, update]
  );

  const uninvite = useCallback(
    async (email: string) => {
      const address = normalizeEmail(email);
      await update((guests ?? []).filter((g) => normalizeEmail(g.email) !== address));
    },
    [guests, update]
  );

  return { guests, error, invite, uninvite };
}
