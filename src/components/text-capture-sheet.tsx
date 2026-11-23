import { useRef, useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputInstance } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { KeyboardSheet } from '@/components/ui/keyboard-sheet';
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
  const [text, setText] = useState(initialText);
  const inputRef = useRef<TextInputInstance>(null);

  return (
    <KeyboardSheet onClose={onCancel} focusRef={inputRef}>
      <ThemedText type="heading">{title}</ThemedText>
      <TextInput
        ref={inputRef}
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
    </KeyboardSheet>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 120,
    maxHeight: 200,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    padding: Spacing.three,
    fontSize: 16,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.two },
});
