import { createContext, use, useCallback, useEffect, useState, type PropsWithChildren } from 'react';

import { DEFAULT_SETTINGS, fetchSettings, saveSettings, type UserSettings } from '@/lib/db';
import { deviceTimeZone } from '@/lib/device';
import { AppError, toAppError } from '@/lib/errors';
import { requestCalendarAccess } from '@/lib/google/auth';
import { ensureAppCalendar } from '@/lib/google/calendar';
import { useAuth } from '@/providers/auth-provider';

type SettingsContextValue = {
  settings: UserSettings | null;
  isLoading: boolean;
  loadError: AppError | null;
  /** Signed in, app calendar exists, and no calendar call has reported lost access. */
  calendarReady: boolean;
  reload: () => void;
  /** Connect step: request scopes, create/find the app calendar, save settings. */
  connectCalendar: () => Promise<void>;
  /** A calendar call reported lost access: send the user back to the connect step. */
  markCalendarDisconnected: () => void;
  setAppCalendarId: (calendarId: string) => Promise<void>;
  updateSettings: (patch: Partial<UserSettings>) => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

type Loaded = { userId: string; settings: UserSettings | null; error: AppError | null };

export function SettingsProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [disconnected, setDisconnected] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchSettings().then(
      (settings) => !cancelled && setLoaded({ userId, settings, error: null }),
      (error) => !cancelled && setLoaded({ userId, settings: null, error: toAppError(error) })
    );
    return () => {
      cancelled = true;
    };
  }, [userId, reloadCount]);

  // Anything loaded for a previous user is ignored until this user's settings arrive.
  const current = loaded && loaded.userId === userId ? loaded : null;
  const settings = current?.settings ?? null;

  const reload = useCallback(() => {
    setLoaded(null);
    setReloadCount((n) => n + 1);
  }, []);

  const persist = useCallback(
    async (next: UserSettings) => {
      if (!userId) throw new AppError('not_signed_in', 'Please sign in again.');
      const saved = await saveSettings(next);
      setLoaded({ userId, settings: saved, error: null });
    },
    [userId]
  );

  const connectCalendar = useCallback(async () => {
    await requestCalendarAccess();
    const timeZone = settings?.timeZone ?? deviceTimeZone();
    const appCalendarId = await ensureAppCalendar(settings?.appCalendarId ?? null, timeZone);
    await persist({ ...DEFAULT_SETTINGS, ...settings, timeZone, appCalendarId });
    setDisconnected(false);
  }, [persist, settings]);

  const setAppCalendarId = useCallback(
    async (appCalendarId: string) => {
      if (settings) await persist({ ...settings, appCalendarId });
    },
    [persist, settings]
  );

  const updateSettings = useCallback(
    async (patch: Partial<UserSettings>) => {
      if (settings) await persist({ ...settings, ...patch });
    },
    [persist, settings]
  );

  const value: SettingsContextValue = {
    settings,
    isLoading: userId !== null && current === null,
    loadError: current?.error ?? null,
    calendarReady: !!settings?.appCalendarId && !disconnected,
    reload,
    connectCalendar,
    markCalendarDisconnected: () => setDisconnected(true),
    setAppCalendarId,
    updateSettings,
  };

  return <SettingsContext value={value}>{children}</SettingsContext>;
}

export function useSettings(): SettingsContextValue {
  const value = use(SettingsContext);
  if (!value) throw new Error('useSettings must be used inside <SettingsProvider>');
  return value;
}

/** For screens behind the calendar guard, where settings are always present. */
export function useReadySettings(): UserSettings {
  const { settings } = useSettings();
  if (!settings?.appCalendarId) throw new Error('useReadySettings used before the calendar was connected');
  return settings;
}
