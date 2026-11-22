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
import { MaxContentWidth, RainbowVivid, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { signIn } from '@/lib/auth';
import { describeError, toAppError } from '@/lib/errors';

const rise = (step: number) => FadeInDown.delay(80 + step * 90).duration(520);

export default function SignInScreen() {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setError(null);
    setBusy(true);
    try {
      await signIn();
      // On success the auth listener flips the route guard.
    } catch (e) {
      setError(describeError(toAppError(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <Aurora height={height * 0.62} />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.hero}>
          <Animated.View entering={rise(0)}>
            <RainbowRing size={108} thickness={5} periodMs={8000} centerColor={theme.ink}>
              <Icon ios="mic.fill" android="mic" size={42} color={theme.onInk} />
            </RainbowRing>
          </Animated.View>
          <Animated.View entering={rise(1)} style={styles.copy}>
            <ThemedText type="title" style={styles.center}>
              Voice To-Do
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.center}>
              Say what you need to do. It becomes tasks, ordered and booked into the free time in your Google
              Calendar.
            </ThemedText>
          </Animated.View>
          <Animated.View entering={rise(2)} style={[styles.features, { backgroundColor: theme.surface, boxShadow: theme.shadowCard }]}>
            <FeatureRow icon={{ ios: 'waveform', android: 'graphic_eq' }} color={RainbowVivid[0]} text="Just talk. No commands to learn" />
            <FeatureRow icon={{ ios: 'calendar', android: 'calendar_today' }} color={RainbowVivid[4]} text="Booked around your busy time" />
            <FeatureRow icon={{ ios: 'arrow.uturn.backward', android: 'undo' }} color={RainbowVivid[5]} text="Undo any capture for 10 seconds" />
          </Animated.View>
        </View>

        <Animated.View entering={FadeInUp.delay(420).duration(520)} style={styles.footer}>
          <Button title="Continue with Google" variant="primary" loading={busy} onPress={handleSignIn} />
          {error ? (
            <ThemedText type="small" style={[styles.center, { color: theme.danger }]} accessibilityRole="alert">
              {error}
            </ThemedText>
          ) : (
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              Your recordings are never stored.
            </ThemedText>
          )}
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
    paddingBottom: Spacing.four,
  },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.four },
  copy: { gap: Spacing.two, alignItems: 'center' },
  features: { alignSelf: 'stretch', borderRadius: 20, borderCurve: 'continuous', padding: Spacing.three, gap: Spacing.three },
  footer: { gap: Spacing.three },
  center: { textAlign: 'center' },
});
