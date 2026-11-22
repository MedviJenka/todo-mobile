import { View, type ViewProps } from 'react-native';

import { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function ThemedView({ style, type = 'background', ...rest }: ViewProps & { type?: ThemeColor }) {
  const theme = useTheme();
  return <View style={[{ backgroundColor: theme[type] }, style]} {...rest} />;
}
