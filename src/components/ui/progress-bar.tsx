import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { gradient, RainbowVivid } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const SWEEP_MS = 1400;
const SWEEP_WIDTH = 40; // percent of the track

/** A thin rainbow bar. Pass `progress` (0–1) for a determinate bar, or leave it out for "working…". */
export function ProgressBar({ progress, height = 6 }: { progress?: number; height?: number }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const indeterminate = progress === undefined;
  const value = useSharedValue(progress ?? 0);

  useEffect(() => {
    if (!indeterminate) {
      value.set(withTiming(progress, { duration: 450, easing: Easing.out(Easing.cubic) }));
      return;
    }
    if (reduceMotion) return;
    value.set(0);
    value.set(withRepeat(withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.quad) }), -1, false));
    return () => cancelAnimation(value);
  }, [value, progress, indeterminate, reduceMotion]);

  const fill = useAnimatedStyle(() =>
    indeterminate
      ? { width: `${SWEEP_WIDTH}%`, left: `${-SWEEP_WIDTH + value.get() * (100 + SWEEP_WIDTH)}%` }
      : { width: `${Math.max(0, Math.min(1, value.get())) * 100}%`, left: 0 }
  );

  return (
    <View
      style={[styles.track, { height, borderRadius: height / 2, backgroundColor: theme.backgroundElement }]}
      accessibilityRole="progressbar"
      accessibilityValue={indeterminate ? undefined : { min: 0, max: 100, now: Math.round((progress ?? 0) * 100) }}>
      <Animated.View
        style={[styles.fill, { borderRadius: height / 2, backgroundImage: gradient(RainbowVivid, 90) }, fill]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { overflow: 'hidden', alignSelf: 'stretch' },
  fill: { position: 'absolute', top: 0, bottom: 0 },
});
