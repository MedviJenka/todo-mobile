import { StyleSheet, Text, type TextProps } from 'react-native';

import { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'title' | 'heading' | 'default' | 'small' | 'smallBold' | 'label';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor = 'text', ...rest }: ThemedTextProps) {
  const theme = useTheme();
  return <Text style={[{ color: theme[themeColor] }, styles[type], style]} {...rest} />;
}

const styles = StyleSheet.create({
  title: { fontSize: 34, lineHeight: 41, fontWeight: 700, letterSpacing: -0.6 },
  heading: { fontSize: 22, lineHeight: 28, fontWeight: 700, letterSpacing: -0.3 },
  default: { fontSize: 16, lineHeight: 22, fontWeight: 400 },
  small: { fontSize: 14, lineHeight: 20, fontWeight: 400 },
  smallBold: { fontSize: 14, lineHeight: 20, fontWeight: 600 },
  /** Section headers and eyebrows. */
  label: { fontSize: 12, lineHeight: 16, fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase' },
});
