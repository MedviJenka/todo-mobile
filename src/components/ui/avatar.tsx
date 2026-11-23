import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { RainbowVivid } from '@/constants/theme';
import { initials } from '@/features/sharing/contact';

/** Initials on a color picked from the name, so the same person always gets the same color. */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  const color = RainbowVivid[Math.abs(hash) % RainbowVivid.length];
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
      <ThemedText type="smallBold" style={[styles.text, { fontSize: size * 0.38, lineHeight: size * 0.5 }]}>
        {initials(name) || '?'}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  text: { color: '#FFFFFF' },
});
