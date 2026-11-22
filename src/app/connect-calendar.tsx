import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Aurora } from '@/components/ui/aurora';
import { Button } from '@/components/ui/button';
import { FeatureRow } from '@/components/ui/feature-row';
import { Icon } from '@/components/ui/icon';
import { RainbowRing } from '@/components/ui/rainbow-ring';
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

const rise = (step: number) => FadeInDown.delay(80 + step * 90).duration(520);

export default function ConnectCalendarScreen() {
  const theme = useTheme();
  const { height } = useWindowDimensions();
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
      <Aurora height={height * 0.5} />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.hero}>
          <Animated.View entering={rise(0)}>
            <RainbowRing size={96} thickness={4} periodMs={9000} centerColor={theme.surface}>
              <Icon ios="calendar.badge.plus" android="calendar_add_on" size={38} color={theme.tint} />
            </RainbowRing>
          </Animated.View>
          <Animated.View entering={rise(1)}>
            <ThemedText type="title" style={styles.center}>
              {reconnecting ? 'Reconnect your calendar' : 'Connect Google Calendar'}
            </ThemedText>
          </Animated.View>
          <Animated.View entering={rise(2)} style={[styles.points, { backgroundColor: theme.surface, boxShadow: theme.shadowCard }]}>
            {POINTS.map((point) => (
              <FeatureRow key={point} icon={{ ios: 'checkmark', android: 'check' }} color={theme.success} text={point} />
            ))}
          </Animated.View>
        </View>

        <Animated.View entering={FadeInUp.delay(420).duration(520)} style={styles.footer}>
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
        </Animated.View>
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
    paddingBottom: Spacing.three,
  },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.four },
  center: { textAlign: 'center' },
  points: { alignSelf: 'stretch', borderRadius: 20, borderCurve: 'continuous', padding: Spacing.three, gap: Spacing.three },
  footer: { gap: Spacing.two },
});
