import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${a11y} ${label}`}
        disabled={disabled}
        hitSlop={6}
        onPress={() => onChange(next)}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: theme.backgroundSelected },
          (pressed || disabled) && styles.dimmed,
        ]}>
        <ThemedText type="smallBold">{symbol}</ThemedText>
      </Pressable>
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
  button: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  value: { minWidth: 64, textAlign: 'center', fontVariant: ['tabular-nums'] },
  dimmed: { opacity: 0.4 },
});
