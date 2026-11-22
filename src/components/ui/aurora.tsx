import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { gradient, RainbowSoft, RainbowVivid, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const DRIFT_MS = 18_000;

/**
 * A soft rainbow wash behind the top of a screen that fades into the page color. It drifts
 * slowly sideways (an 18 s loop) and holds still when the system asks for reduced motion.
 */
export function Aurora({ height = 320 }: { height?: number }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const drift = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    drift.set(withRepeat(withTiming(1, { duration: DRIFT_MS, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(drift);
  }, [drift, reduceMotion]);

  const driftStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -drift.get() * width }] }));
  const fade = `linear-gradient(180deg, ${withAlpha(theme.background, 0.1)} 0%, ${withAlpha(theme.background, 0.55)} 55%, ${theme.background} 100%)`;

  return (
    <View pointerEvents="none" style={[styles.wrap, { height }]}>
      <Animated.View
        style={[
          {
            width: width * 2,
            height,
            opacity: theme.dark ? 0.26 : 0.9,
            backgroundImage: gradient(theme.dark ? RainbowVivid : RainbowSoft, 90, true),
          },
          driftStyle,
        ]}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundImage: fade }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
});
