import { useCallback } from 'react';
import { Alert } from 'react-native';

import { describeError, toAppError } from '@/lib/errors';
import { useSettings } from '@/providers/settings-provider';

/** Shows an error as an Alert. Lost calendar access offers to reconnect. */
export function useErrorAlert() {
  const { markCalendarDisconnected } = useSettings();
  return useCallback(
    (error: unknown, title = 'Something went wrong') => {
      const appError = toAppError(error);
      if (appError.code === 'cancelled') return;
      if (appError.code === 'calendar_disconnected') {
        Alert.alert('Reconnect Google Calendar', describeError(appError), [
          { text: 'Later', style: 'cancel' },
          { text: 'Reconnect', onPress: markCalendarDisconnected },
        ]);
        return;
      }
      Alert.alert(title, describeError(appError));
    },
    [markCalendarDisconnected]
  );
}
