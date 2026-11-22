import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View, type ColorValue } from 'react-native';
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

/**
 * A disk inside a slowly turning rainbow ring: the app's signature mark (mic button, hero
 * badges). `periodMs` sets the speed: slow at rest, faster while listening or working.
 */
export function RainbowRing({
  size,
  thickness = 4,
  periodMs = 9000,
  centerColor,
  children,
}: {
  size: number;
  thickness?: number;
  periodMs?: number;
  centerColor: ColorValue;
  children?: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    // Each loop runs from wherever the ring is now, so a speed change never jumps.
    const from = rotation.get() % 360;
    rotation.set(from);
    rotation.set(withRepeat(withTiming(from + 360, { duration: periodMs, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(rotation);
  }, [rotation, periodMs, reduceMotion]);

  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.get()}deg` }] }));
  const inner = size - thickness * 2;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: size / 2, overflow: 'hidden', backgroundImage: gradient(RainbowVivid, 135, true) },
          spin,
        ]}
      />
      <View
        style={{
          width: inner,
          height: inner,
          borderRadius: inner / 2,
          backgroundColor: centerColor,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {children}
      </View>
    </View>
  );
}
