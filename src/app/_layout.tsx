import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme as NavigationTheme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Colors, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { describeError } from '@/lib/errors';
import { CaptureProvider } from '@/features/capture/capture-provider';
import { AuthProvider, useAuth } from '@/providers/auth-provider';
import { SettingsProvider, useSettings } from '@/providers/settings-provider';
import { TasksProvider } from '@/providers/tasks-provider';

SplashScreen.preventAutoHideAsync();

/** Navigation chrome in the app palette, so screen transitions never flash a stock white/black. */
function navigationTheme(base: NavigationTheme, colors: (typeof Colors)['light' | 'dark']): NavigationTheme {
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.tint,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
    },
  };
}

const NAVIGATION_THEMES = {
  light: navigationTheme(DefaultTheme, Colors.light),
  dark: navigationTheme(DarkTheme, Colors.dark),
};

function RootNavigator() {
  const theme = useTheme();
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
        <Icon ios="wifi.exclamationmark" android="wifi_off" size={40} color={theme.textSecondary} />
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
            sheetAllowedDetents: [0.85, 1],
            sheetGrabberVisible: true,
            sheetCornerRadius: 28,
            contentStyle: { backgroundColor: theme.surface },
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
      <ThemeProvider value={NAVIGATION_THEMES[colorScheme === 'dark' ? 'dark' : 'light']}>
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
