import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/hooks/use-theme';

export type MicMode = 'idle' | 'recording' | 'busy';

export function MicButton({ mode, onPress }: { mode: MicMode; onPress: () => void }) {
  const theme = useTheme();
  const recording = mode === 'recording';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={recording ? 'Stop recording' : 'Start recording'}
      accessibilityState={{ busy: mode === 'busy', disabled: mode === 'busy' }}
      disabled={mode === 'busy'}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: recording ? theme.danger : theme.tint },
        pressed && styles.pressed,
        mode === 'busy' && styles.busy,
      ]}>
      {mode === 'busy' ? (
        <ActivityIndicator color={theme.onTint} />
      ) : recording ? (
        <Icon ios="stop.fill" android="stop" size={30} color={theme.onTint} />
      ) : (
        <Icon ios="mic.fill" android="mic" size={32} color={theme.onTint} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  pressed: { transform: [{ scale: 0.95 }] },
  busy: { opacity: 0.7 },
});
