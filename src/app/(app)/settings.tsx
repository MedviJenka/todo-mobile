import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Stepper } from '@/components/ui/stepper';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useErrorAlert } from '@/hooks/use-error-alert';
import { signOut } from '@/lib/auth';
import { deleteAllUserData, type UserSettings } from '@/lib/db';
import { deviceTimeZone } from '@/lib/device';
import { describeError, toAppError } from '@/lib/errors';
import { APP_CALENDAR_NAME, deleteAppCalendar } from '@/lib/google/calendar';
import { formatTimeOfDay, parseTimeOfDay } from '@/lib/time';
import { useAuth } from '@/providers/auth-provider';
import { useReadySettings, useSettings } from '@/providers/settings-provider';

const minutes = (value: number) => `${value} min`;

export default function SettingsScreen() {
  const settings = useReadySettings();
  // Remount the form when saved settings change, so the draft starts from them.
  return <SettingsForm key={JSON.stringify(settings)} saved={settings} />;
}

function SettingsForm({ saved }: { saved: UserSettings }) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { updateSettings, markCalendarDisconnected } = useSettings();
  const showError = useErrorAlert();
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState<'save' | 'signout' | 'delete' | null>(null);

  const start = parseTimeOfDay(draft.dayStart);
  const end = parseTimeOfDay(draft.dayEnd);
  const deviceZone = deviceTimeZone();
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const set = (patch: Partial<UserSettings>) => setDraft((d) => ({ ...d, ...patch }));

  async function save() {
    setBusy('save');
    try {
      await updateSettings(draft);
    } catch (e) {
      showError(e, "Couldn't save settings");
    } finally {
      setBusy(null);
    }
  }

  function confirmDelete() {
    Alert.alert(
      'Delete all data?',
      `This deletes the “${APP_CALENDAR_NAME}” calendar and its events, all tasks and transcripts, and disconnects Google. It can’t be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete everything', style: 'destructive', onPress: () => void deleteEverything() },
      ]
    );
  }

  async function deleteEverything() {
    if (!session) return;
    setBusy('delete');
    let calendarWarning: string | null = null;
    try {
      if (saved.appCalendarId) {
        try {
          await deleteAppCalendar(saved.appCalendarId);
        } catch (e) {
          calendarWarning = `${describeError(toAppError(e))} Delete the “${APP_CALENDAR_NAME}” calendar in Google Calendar yourself.`;
        }
      }
      await deleteAllUserData(session.user.id);
      if (calendarWarning) Alert.alert('Calendar not deleted', calendarWarning);
      await signOut({ revokeGoogle: true });
    } catch (e) {
      setBusy(null);
      showError(e, "Couldn't delete your data");
    }
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + BottomTabInset + Spacing.four },
        ]}>
        <ThemedText type="subtitle">Settings</ThemedText>

        <Section title="Scheduling">
          <Stepper
            label="Day starts"
            value={start}
            step={30}
            min={0}
            max={end - 60}
            format={formatTimeOfDay}
            onChange={(v) => set({ dayStart: formatTimeOfDay(v) })}
          />
          <Stepper
            label="Day ends"
            value={end}
            step={30}
            min={start + 60}
            max={24 * 60}
            format={formatTimeOfDay}
            onChange={(v) => set({ dayEnd: formatTimeOfDay(v) })}
          />
          <Stepper
            label="Buffer between items"
            value={draft.bufferMinutes}
            step={5}
            min={0}
            max={60}
            format={minutes}
            onChange={(v) => set({ bufferMinutes: v })}
          />
          <Stepper
            label="Reminder before"
            value={draft.reminderMinutes}
            step={5}
            min={0}
            max={120}
            format={(v) => (v === 0 ? 'None' : minutes(v))}
            onChange={(v) => set({ reminderMinutes: v })}
          />
          <View style={styles.row}>
            <ThemedText>Time zone</ThemedText>
            <ThemedText type="smallBold">{draft.timeZone}</ThemedText>
          </View>
          {deviceZone !== draft.timeZone && (
            <Button title={`Use this device’s zone (${deviceZone})`} onPress={() => set({ timeZone: deviceZone })} />
          )}
          {dirty && <Button title="Save changes" variant="primary" loading={busy === 'save'} onPress={save} />}
          <ThemedText type="small" themeColor="textSecondary">
            New tasks are booked inside these hours, never on top of busy time in your primary calendar.
          </ThemedText>
        </Section>

        <Section title="Google Calendar">
          <ThemedText type="small" themeColor="textSecondary">
            Tasks go into the “{APP_CALENDAR_NAME}” calendar. Only your primary calendar counts as busy.
          </ThemedText>
          <Button title="Reconnect calendar" onPress={markCalendarDisconnected} />
        </Section>

        <Section title="Account">
          <View style={styles.row}>
            <ThemedText>Signed in as</ThemedText>
            <ThemedText type="smallBold" numberOfLines={1} style={styles.shrink}>
              {session?.user.email ?? '—'}
            </ThemedText>
          </View>
          <Button
            title="Sign out"
            loading={busy === 'signout'}
            onPress={async () => {
              setBusy('signout');
              await signOut().catch((e) => showError(e, "Couldn't sign out"));
              setBusy(null);
            }}
          />
          <Button
            title="Delete all data"
            variant="destructive"
            loading={busy === 'delete'}
            onPress={confirmDelete}
          />
          <ThemedText type="small" themeColor="textSecondary">
            Audio is never stored. Transcripts are kept as capture history until you delete your data.
          </ThemedText>
        </Section>
      </ScrollView>
    </ThemedView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {title.toUpperCase()}
      </ThemedText>
      <ThemedView type="backgroundElement" style={styles.sectionBody}>
        {children}
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: Spacing.four, gap: Spacing.four },
  section: { gap: Spacing.two },
  sectionBody: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40, gap: Spacing.three },
  shrink: { flexShrink: 1 },
});
