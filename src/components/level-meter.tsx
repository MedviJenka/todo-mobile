import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

const BARS = 32;

/** Live input level, newest on the right. `levels` are 0–1. */
export function LevelMeter({ levels }: { levels: readonly number[] }) {
  const theme = useTheme();
  const padded = Array.from({ length: BARS }, (_, i) => levels[levels.length - BARS + i] ?? 0);
  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {padded.map((level, i) => (
        <View key={i} style={[styles.bar, { height: 4 + level * 32, backgroundColor: theme.tint }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  bar: { width: 4, borderRadius: 2 },
});
