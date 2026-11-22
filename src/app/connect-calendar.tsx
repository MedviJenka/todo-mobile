import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { signOut } from '@/lib/auth';
import { describeError, toAppError } from '@/lib/errors';
import { APP_CALENDAR_NAME } from '@/lib/google/calendar';
import { useSettings } from '@/providers/settings-provider';

const POINTS = [
  `Creates a separate “${APP_CALENDAR_NAME}” calendar for your tasks. It shows up in Google Calendar like any other.`,
  'Reads only busy/free times from your main calendar, never event titles or details.',
  'Can’t edit or delete any of your existing events.',
  'Only your primary calendar counts as busy for now.',
];

export default function ConnectCalendarScreen() {
  const theme = useTheme();
  const { connectCalendar, settings } = useSettings();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reconnecting = !!settings?.appCalendarId;

  async function handleConnect() {
    setError(null);
    setBusy(true);
    try {
      await connectCalendar();
    } catch (e) {
      const appError = toAppError(e);
      if (appError.code !== 'cancelled') setError(describeError(appError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.hero}>
          <Icon ios="calendar.badge.plus" android="calendar_add_on" size={56} color={theme.tint} />
          <ThemedText type="subtitle" style={styles.center}>
            {reconnecting ? 'Reconnect your calendar' : 'Connect Google Calendar'}
          </ThemedText>
          <View style={styles.points}>
            {POINTS.map((point) => (
              <View key={point} style={styles.point}>
                <Icon ios="checkmark.circle.fill" android="check_circle" size={18} color={theme.success} />
                <ThemedText type="small" themeColor="textSecondary" style={styles.pointText}>
                  {point}
                </ThemedText>
              </View>
            ))}
          </View>
        </View>

        <Button
          title={reconnecting ? 'Reconnect' : 'Connect calendar'}
          variant="primary"
          loading={busy}
          onPress={handleConnect}
        />
        {error && (
          <ThemedText type="small" style={[styles.center, { color: theme.danger }]} accessibilityRole="alert">
            {error}
          </ThemedText>
        )}
        <Button title="Sign out" variant="plain" disabled={busy} onPress={() => void signOut()} />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', justifyContent: 'center' },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
    gap: Spacing.two,
  },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  center: { textAlign: 'center' },
  points: { gap: Spacing.two, alignSelf: 'stretch' },
  point: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  pointText: { flex: 1 },
});
