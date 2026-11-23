import { useState, type ReactNode } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ROLE_OPTIONS, ShareSheet } from '@/components/share-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Aurora } from '@/components/ui/aurora';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Stepper } from '@/components/ui/stepper';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useErrorAlert } from '@/hooks/use-error-alert';
import { useTheme } from '@/hooks/use-theme';
import { signOut } from '@/lib/auth';
import { deleteAllUserData, type CalendarShare, type UserSettings } from '@/lib/db';
import { deviceTimeZone } from '@/lib/device';
import { describeError, toAppError } from '@/lib/errors';
import { revokeGoogleAccess } from '@/lib/google/auth';
import { APP_CALENDAR_NAME, deleteAppCalendar } from '@/lib/google/calendar';
import { formatTimeOfDay, parseTimeOfDay } from '@/lib/time';
import { useCalendarShares } from '@/features/sharing/use-calendar-shares';
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
      // Revoke before deleting data: if this fails, the server may still hold the Google grant.
      await revokeGoogleAccess();
      await deleteAllUserData(session.user.id);
      if (calendarWarning) Alert.alert('Calendar not deleted', calendarWarning);
      await signOut();
    } catch (e) {
      setBusy(null);
      showError(e, "Couldn't delete your data");
    }
  }

  return (
    <ThemedView style={styles.container}>
      <Aurora height={insets.top + 200} />
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.four, paddingBottom: insets.bottom + BottomTabInset + Spacing.four },
        ]}>
        <ThemedText type="title">Settings</ThemedText>

        <Section
          title="Scheduling"
          footer="New tasks are booked inside these hours, never on top of busy time in your primary calendar.">
          <Stepper
            label="Day starts"
            value={start}
            step={30}
            min={0}
            max={end - 60}
            format={formatTimeOfDay}
            onChange={(v) => set({ dayStart: formatTimeOfDay(v) })}
          />
          <Divider />
          <Stepper
            label="Day ends"
            value={end}
            step={30}
            min={start + 60}
            max={24 * 60}
            format={formatTimeOfDay}
            onChange={(v) => set({ dayEnd: formatTimeOfDay(v) })}
          />
          <Divider />
          <Stepper
            label="Buffer between items"
            value={draft.bufferMinutes}
            step={5}
            min={0}
            max={60}
            format={minutes}
            onChange={(v) => set({ bufferMinutes: v })}
          />
          <Divider />
          <Stepper
            label="Reminder before"
            value={draft.reminderMinutes}
            step={5}
            min={0}
            max={120}
            format={(v) => (v === 0 ? 'None' : minutes(v))}
            onChange={(v) => set({ reminderMinutes: v })}
          />
          <Divider />
          <View style={styles.row}>
            <ThemedText>Time zone</ThemedText>
            <ThemedText type="smallBold" themeColor="textSecondary" numberOfLines={1} style={styles.shrink}>
              {draft.timeZone}
            </ThemedText>
          </View>
          {deviceZone !== draft.timeZone && (
            <Button title={`Use this device’s zone (${deviceZone})`} size="compact" onPress={() => set({ timeZone: deviceZone })} />
          )}
          {dirty && <Button title="Save changes" variant="primary" loading={busy === 'save'} onPress={save} style={styles.save} />}
        </Section>

        <Section title="Google Calendar" footer={`Tasks go into the “${APP_CALENDAR_NAME}” calendar. Only your primary calendar counts as busy.`}>
          <Button title="Reconnect calendar" onPress={markCalendarDisconnected} style={styles.save} />
        </Section>

        <SharingSection calendarId={saved.appCalendarId!} />

        <Section title="Account" footer="Audio is never stored. Transcripts are kept as capture history until you delete your data.">
          <View style={styles.row}>
            <ThemedText>Signed in as</ThemedText>
            <ThemedText type="smallBold" themeColor="textSecondary" numberOfLines={1} style={styles.shrink}>
              {session?.user.email ?? '—'}
            </ThemedText>
          </View>
          <View style={styles.buttons}>
            <Button
              title="Sign out"
              loading={busy === 'signout'}
              onPress={async () => {
                setBusy('signout');
                await signOut().catch((e) => showError(e, "Couldn't sign out"));
                setBusy(null);
              }}
            />
            <Button title="Delete all data" variant="destructive" loading={busy === 'delete'} onPress={confirmDelete} />
          </View>
        </Section>
      </ScrollView>
    </ThemedView>
  );
}

function SharingSection({ calendarId }: { calendarId: string }) {
  const theme = useTheme();
  const showError = useErrorAlert();
  const { shares, loadError, share, remove } = useCalendarShares(calendarId);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  function confirmRemove(person: CalendarShare) {
    Alert.alert(`Stop sharing with ${person.name}?`, `${person.email} will no longer see the “${APP_CALENDAR_NAME}” calendar.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Stop sharing',
        style: 'destructive',
        onPress: async () => {
          setRemoving(person.id);
          await remove(person).catch((e) => showError(e, "Couldn't stop sharing"));
          setRemoving(null);
        },
      },
    ]);
  }

  return (
    <Section title="Sharing" footer={`People here can see the “${APP_CALENDAR_NAME}” calendar in their own Google Calendar.`}>
      {loadError && (
        <ThemedText type="small" style={[styles.shareNote, { color: theme.danger }]}>
          {describeError(loadError)}
        </ThemedText>
      )}
      {shares?.length === 0 && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.shareNote}>
          Not shared with anyone yet.
        </ThemedText>
      )}
      {shares?.map((person) => (
        <View key={person.id} style={[styles.person, { backgroundColor: theme.backgroundElement }]}>
          <Avatar name={person.name} />
          <View style={styles.personText}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {person.name}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {person.email}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {ROLE_OPTIONS.find((o) => o.value === person.role)?.label}
            </ThemedText>
          </View>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`Stop sharing with ${person.name}`}
            disabled={removing === person.id}
            onPress={() => confirmRemove(person)}
            hitSlop={8}
            scaleTo={0.9}
            style={[styles.removeButton, removing === person.id && styles.dim]}>
            <Icon ios="trash" android="delete" size={18} color={theme.danger} />
          </PressableScale>
        </View>
      ))}
      <Button title="Share with someone" onPress={() => setAdding(true)} style={styles.save} />
      {adding && (
        <ShareSheet
          onCancel={() => setAdding(false)}
          onSubmit={async (input) => {
            try {
              await share(input);
              setAdding(false);
            } catch (e) {
              showError(e, "Couldn't share the calendar");
            }
          }}
        />
      )}
    </Section>
  );
}

function Section({ title, footer, children }: { title: string; footer?: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <ThemedText type="label" themeColor="textSecondary" style={styles.inset}>
        {title}
      </ThemedText>
      <View style={[styles.sectionBody, { backgroundColor: theme.surface, boxShadow: theme.shadowCard }]}>{children}</View>
      {footer && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.inset}>
          {footer}
        </ThemedText>
      )}
    </View>
  );
}

function Divider() {
  const theme = useTheme();
  return <View style={[styles.divider, { backgroundColor: theme.border }]} />;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: Spacing.three + 4, gap: Spacing.four },
  section: { gap: Spacing.two },
  inset: { paddingHorizontal: Spacing.one },
  sectionBody: {
    borderRadius: Radius.large,
    borderCurve: 'continuous',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.one,
  },
  divider: { height: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, gap: Spacing.three },
  shrink: { flexShrink: 1 },
  save: { marginVertical: Spacing.two },
  buttons: { gap: Spacing.two, paddingBottom: Spacing.two },
  shareNote: { paddingVertical: Spacing.two },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    marginTop: Spacing.two,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
  },
  personText: { flex: 1, gap: 1 },
  removeButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.4 },
});
