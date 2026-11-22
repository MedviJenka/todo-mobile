import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { RainbowRing } from '@/components/ui/rainbow-ring';
import { gradient, RainbowVivid } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type MicMode = 'idle' | 'recording' | 'busy';

const SIZE = 80;
/** Ring speed per state: calm at rest, lively while listening, quick while working. */
const PERIOD_MS: Record<MicMode, number> = { idle: 10_000, recording: 2_600, busy: 1_400 };

/**
 * The primary action. A rainbow ring around an ink disk; while recording, a soft rainbow halo
 * breathes with the input level so it's obvious the mic is live.
 */
export function MicButton({ mode, level = 0, onPress }: { mode: MicMode; level?: number; onPress: () => void }) {
  const theme = useTheme();
  const recording = mode === 'recording';
  const busy = mode === 'busy';
  const halo = useSharedValue(0);

  useEffect(() => {
    halo.set(withTiming(recording ? Math.max(0.15, level) : 0, { duration: 140 }));
  }, [halo, level, recording]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.16 + halo.get() * 0.3,
    transform: [{ scale: 1.08 + halo.get() * 0.42 }],
  }));

  return (
    <View style={styles.wrap}>
      <Animated.View pointerEvents="none" style={[styles.halo, haloStyle]} />
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={recording ? 'Stop recording' : 'Start recording'}
        accessibilityState={{ busy, disabled: busy }}
        disabled={busy}
        onPress={onPress}
        hitSlop={10}
        scaleTo={0.92}
        style={[styles.button, { boxShadow: theme.shadowFloat }]}>
        <RainbowRing size={SIZE} thickness={4} periodMs={PERIOD_MS[mode]} centerColor={theme.ink}>
          {busy ? (
            <ActivityIndicator color={theme.onInk} />
          ) : recording ? (
            <View style={[styles.stop, { backgroundColor: theme.onInk }]} />
          ) : (
            <Icon ios="mic.fill" android="mic" size={30} color={theme.onInk} />
          )}
        </RainbowRing>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  halo: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundImage: gradient(RainbowVivid, 45, true),
  },
  button: { width: SIZE, height: SIZE, borderRadius: SIZE / 2 },
  stop: { width: 24, height: 24, borderRadius: 7 },
});
