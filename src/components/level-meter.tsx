import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { RainbowVivid } from '@/constants/theme';

const BARS = 28;
const MAX_HEIGHT = 30;

/** Live input level as a rainbow equalizer, newest on the right. `levels` are 0–1. */
export function LevelMeter({ levels }: { levels: readonly number[] }) {
  const padded = Array.from({ length: BARS }, (_, i) => levels[levels.length - BARS + i] ?? 0);
  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {padded.map((level, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            {
              height: 4 + level * MAX_HEIGHT,
              backgroundColor: RainbowVivid[Math.floor((i / BARS) * RainbowVivid.length)],
              opacity: 0.35 + level * 0.65,
              transitionProperty: ['height', 'opacity'],
              transitionDuration: 110,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { height: MAX_HEIGHT + 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  bar: { width: 4, borderRadius: 2 },
});
