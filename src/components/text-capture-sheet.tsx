import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { MAX_TRANSCRIPT_CHARS } from '@/schemas/ai-schema';

/** Type instead of speaking, or fix a transcript before re-running it. Same pipeline either way. */
export function TextCaptureSheet({
  title,
  initialText = '',
  onCancel,
  onSubmit,
}: {
  title: string;
  initialText?: string;
  onCancel: () => void;
  onSubmit: (text: string) => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState(initialText);

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={[styles.fill, styles.backdrop]} onPress={onCancel} accessibilityLabel="Close" />
        <Animated.View
          entering={SlideInDown.springify().damping(22).stiffness(240)}
          style={[
            styles.sheet,
            { backgroundColor: theme.surface, paddingBottom: Math.max(insets.bottom, Spacing.three) + Spacing.three },
          ]}>
          <View style={[styles.grabber, { backgroundColor: theme.backgroundSelected }]} />
          <ThemedText type="heading">{title}</ThemedText>
          <TextInput
            autoFocus
            multiline
            value={text}
            onChangeText={setText}
            maxLength={MAX_TRANSCRIPT_CHARS}
            placeholder="e.g. Dentist tomorrow at 10, finish the report by Friday…"
            placeholderTextColor={theme.textSecondary}
            selectionColor={theme.tint}
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          />
          <View style={styles.actions}>
            <Button title="Cancel" variant="plain" onPress={onCancel} />
            <Button title="Add tasks" variant="primary" disabled={!text.trim()} onPress={() => onSubmit(text)} />
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { backgroundColor: 'rgba(8, 10, 20, 0.4)' },
  sheet: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two + 2,
    gap: Spacing.three,
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    borderCurve: 'continuous',
  },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: Spacing.one },
  input: {
    minHeight: 120,
    maxHeight: 260,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    padding: Spacing.three,
    fontSize: 16,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.two },
});
