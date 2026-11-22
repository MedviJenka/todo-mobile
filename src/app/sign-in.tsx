import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { signIn } from '@/lib/auth';
import { describeError, toAppError } from '@/lib/errors';

export default function SignInScreen() {
  const theme = useTheme();
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
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.hero}>
          <View style={[styles.badge, { backgroundColor: theme.tint }]}>
            <Icon ios="mic.fill" android="mic" size={40} color={theme.onTint} />
          </View>
          <ThemedText type="subtitle" style={styles.center}>
            Voice To-Do
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.center}>
            Say what you need to do. It becomes tasks, ordered and booked into free time in your Google Calendar.
          </ThemedText>
        </View>

        <Button title="Continue with Google" variant="primary" loading={busy} onPress={handleSignIn} />
        {error && (
          <ThemedText type="small" style={[styles.center, { color: theme.danger }]} accessibilityRole="alert">
            {error}
          </ThemedText>
        )}
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
    paddingBottom: Spacing.five,
    gap: Spacing.three,
  },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  badge: { width: 88, height: 88, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
});
