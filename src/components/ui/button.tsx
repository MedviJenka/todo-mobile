import { ActivityIndicator, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { PressableScale } from '@/components/ui/pressable-scale';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Variant = 'primary' | 'secondary' | 'destructive' | 'plain';

export function Button({
  title,
  onPress,
  variant = 'secondary',
  size = 'regular',
  loading = false,
  disabled = false,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  /** `compact` for actions inside cards. */
  size?: 'regular' | 'compact';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const background = {
    primary: theme.tint,
    secondary: theme.backgroundElement,
    destructive: theme.backgroundElement,
    plain: 'transparent',
  }[variant];
  const foreground = {
    primary: theme.onTint,
    secondary: theme.text,
    destructive: theme.danger,
    plain: theme.tint,
  }[variant];
  const inactive = disabled || loading;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      scaleTo={0.97}
      style={[
        styles.button,
        size === 'compact' && styles.compact,
        { backgroundColor: background },
        disabled && styles.disabled,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <Text style={[styles.title, size === 'compact' && styles.compactTitle, { color: foreground }]}>{title}</Text>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    borderCurve: 'continuous',
  },
  compact: { minHeight: 38, paddingHorizontal: Spacing.three, borderRadius: Radius.small },
  title: { fontSize: 16, lineHeight: 21, fontWeight: 600 },
  compactTitle: { fontSize: 14, lineHeight: 19 },
  disabled: { opacity: 0.45 },
});
