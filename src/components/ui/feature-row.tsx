import type { SymbolViewProps } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type IconName = {
  ios: Extract<SymbolViewProps['name'], string>;
  android: NonNullable<Exclude<SymbolViewProps['name'], string>['android']>;
};

/** Icon tile + one line of text. Used for the short promises on onboarding screens. */
export function FeatureRow({ icon, text, color }: { icon: IconName; text: string; color?: string }) {
  const theme = useTheme();
  const tone = color ?? theme.tint;
  return (
    <View style={styles.row}>
      <View style={[styles.tile, { backgroundColor: withAlpha(tone, theme.dark ? 0.22 : 0.12) }]}>
        <Icon ios={icon.ios} android={icon.android} size={18} color={tone} />
      </View>
      <ThemedText type="small" style={styles.text}>
        {text}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  tile: {
    width: 36,
    height: 36,
    borderRadius: Radius.small,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1 },
});
