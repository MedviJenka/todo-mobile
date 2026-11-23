import { useCallback, useEffect, useState } from 'react';

import { deleteShare, fetchShares, saveShare, type CalendarShare, type ShareRole } from '@/lib/db';
import { AppError, toAppError } from '@/lib/errors';
import { hasGrantedScope, requestSharingAccess, SHARING_SCOPE } from '@/lib/google/auth';
import { shareAppCalendar, unshareAppCalendar } from '@/lib/google/calendar';

import { isValidEmail, normalizeEmail } from './contact';

export type ShareInput = { name: string; email: string; role: ShareRole };

/** Saved contacts for the app calendar, plus share / remove that keep Google and the list in step. */
export function useCalendarShares(calendarId: string) {
  const [shares, setShares] = useState<CalendarShare[] | null>(null);
  const [loadError, setLoadError] = useState<AppError | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchShares().then(
      (rows) => !cancelled && setShares(rows),
      (error) => !cancelled && setLoadError(toAppError(error))
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const share = useCallback(
    async ({ name, email, role }: ShareInput) => {
      const address = normalizeEmail(email);
      if (!isValidEmail(address)) throw new AppError('unknown', 'Enter a valid email address.');
      const displayName = name.trim() || address;

      // The first share asks Google for the extra "sharing permissions" box.
      if (!(await hasGrantedScope(SHARING_SCOPE))) await requestSharingAccess();

      // Google first, then the card: a saved card always means the person really has access.
      const aclRuleId = await shareAppCalendar(calendarId, address, role);
      const saved = await saveShare({ name: displayName, email: address, role, aclRuleId });
      setShares((current) =>
        [...(current ?? []).filter((s) => s.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name))
      );
    },
    [calendarId]
  );

  const remove = useCallback(
    async (target: CalendarShare) => {
      if (!(await hasGrantedScope(SHARING_SCOPE))) await requestSharingAccess();
      await unshareAppCalendar(calendarId, target.aclRuleId);
      await deleteShare(target.id);
      setShares((current) => current?.filter((s) => s.id !== target.id) ?? null);
    },
    [calendarId]
  );

  return { shares, loadError, share, remove };
}
