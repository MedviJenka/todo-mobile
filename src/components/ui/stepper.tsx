import * as Haptics from 'expo-haptics';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Label · value · − / + buttons. Cross-platform and needs no native picker. */
export function Stepper({
  label,
  value,
  onChange,
  step,
  min,
  max,
  format = String,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step: number;
  min: number;
  max: number;
  format?: (value: number) => string;
}) {
  const theme = useTheme();
  const button = (delta: number, symbol: string, a11y: string) => {
    const next = value + delta;
    const disabled = next < min || next > max;
    return (
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${a11y} ${label}`}
        disabled={disabled}
        hitSlop={6}
        scaleTo={0.88}
        onPress={() => {
          Haptics.selectionAsync().catch(() => undefined);
          onChange(next);
        }}
        style={[styles.button, { backgroundColor: theme.backgroundElement }, disabled && styles.disabled]}>
        <ThemedText type="heading" style={styles.symbol}>
          {symbol}
        </ThemedText>
      </PressableScale>
    );
  };

  return (
    <View style={styles.row} accessibilityRole="adjustable" accessibilityValue={{ text: format(value) }}>
      <ThemedText style={styles.label}>{label}</ThemedText>
      <View style={styles.controls}>
        {button(-step, '−', 'Decrease')}
        <ThemedText type="smallBold" style={styles.value}>
          {format(value)}
        </ThemedText>
        {button(step, '+', 'Increase')}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  label: { flexShrink: 1 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  button: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  symbol: { fontSize: 20, lineHeight: 24, fontWeight: 500 },
  value: { minWidth: 72, textAlign: 'center', fontVariant: ['tabular-nums'] },
  disabled: { opacity: 0.35 },
});
