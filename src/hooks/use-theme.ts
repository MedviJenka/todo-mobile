import { useColorScheme } from 'react-native';

import { Themes, type Theme } from '@/constants/theme';

/** Colors and shadows for the current light/dark appearance. */
export function useTheme(): Theme {
  return Themes[useColorScheme() === 'dark' ? 'dark' : 'light'];
}
