import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { describeError } from '@/lib/errors';
import { CaptureProvider } from '@/features/capture/capture-provider';
import { AuthProvider, useAuth } from '@/providers/auth-provider';
import { SettingsProvider, useSettings } from '@/providers/settings-provider';
import { TasksProvider } from '@/providers/tasks-provider';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { session, isLoading: authLoading } = useAuth();
  const { isLoading: settingsLoading, loadError, calendarReady, reload } = useSettings();
  const signedIn = !!session;
  const ready = !authLoading && !(signedIn && settingsLoading);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  // Keep the splash screen up until we know where to send the user.
  if (!ready) return null;

  if (signedIn && loadError) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText style={styles.centerText}>{describeError(loadError)}</ThemedText>
        <Button title="Try again" variant="primary" onPress={reload} />
      </ThemedView>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !calendarReady}>
        <Stack.Screen name="connect-calendar" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && calendarReady}>
        <Stack.Screen name="(app)" />
        <Stack.Screen
          name="task/[id]"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.8, 1],
            sheetGrabberVisible: true,
            sheetCornerRadius: 24,
          }}
        />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <GestureHandlerRootView style={styles.fill}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AuthProvider>
          <SettingsProvider>
            <TasksProvider>
              <CaptureProvider>
                <View style={styles.fill}>
                  <RootNavigator />
                </View>
              </CaptureProvider>
            </TasksProvider>
          </SettingsProvider>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  centerText: { textAlign: 'center' },
});
