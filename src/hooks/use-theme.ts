import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

/** The color palette for the current light/dark appearance. */
export function useTheme() {
  return Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
}
