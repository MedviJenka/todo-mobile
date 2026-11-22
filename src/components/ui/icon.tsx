import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ColorValue } from 'react-native';

/** SF Symbols on iOS, Material Symbols on Android. */
export function Icon({
  ios,
  android,
  size = 22,
  color,
}: {
  ios: Extract<SymbolViewProps['name'], string>;
  android: NonNullable<Exclude<SymbolViewProps['name'], string>['android']>;
  size?: number;
  color: ColorValue;
}) {
  return <SymbolView name={{ ios, android, web: android }} size={size} tintColor={color} />;
}
