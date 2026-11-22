import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { MAX_TRANSCRIPT_CHARS } from '@/schemas/ai-schema';

/** Type instead of speaking, or fix a transcript before re-running it. Same pipeline either way. */
export function TextCaptureSheet({
  visible,
  title,
  initialText = '',
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  initialText?: string;
  onCancel: () => void;
  onSubmit: (text: string) => void;
}) {
  const theme = useTheme();
  const [text, setText] = useState(initialText);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.fill} onPress={onCancel} accessibilityLabel="Close" />
        <View style={[styles.sheet, { backgroundColor: theme.background }]}>
          <ThemedText type="smallBold">{title}</ThemedText>
          <TextInput
            autoFocus
            multiline
            value={text}
            onChangeText={setText}
            maxLength={MAX_TRANSCRIPT_CHARS}
            placeholder="e.g. Dentist tomorrow at 10, finish the report by Friday…"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          />
          <View style={styles.actions}>
            <Button title="Cancel" variant="plain" onPress={onCancel} />
            <Button title="Add tasks" variant="primary" disabled={!text.trim()} onPress={() => onSubmit(text)} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  sheet: {
    padding: Spacing.four,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  input: { minHeight: 120, maxHeight: 260, borderRadius: 14, padding: Spacing.three, fontSize: 16, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.two },
});
