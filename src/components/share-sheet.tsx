import { useRef, useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputInstance } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { KeyboardSheet } from '@/components/ui/keyboard-sheet';
import { Segmented } from '@/components/ui/segmented';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ShareRole } from '@/lib/db';
import { isValidEmail, nameFromEmail } from '@/features/sharing/contact';
import type { ShareInput } from '@/features/sharing/use-calendar-shares';

export const ROLE_OPTIONS = [
  { value: 'reader', label: 'All details' },
  { value: 'freeBusyReader', label: 'Free/busy only' },
] as const satisfies readonly { value: ShareRole; label: string }[];

/** Email + name + what they may see. The name fills itself from the email until edited. */
export function ShareSheet({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (input: ShareInput) => Promise<void> }) {
  const theme = useTheme();
  const emailRef = useRef<TextInputInstance>(null);
  const nameRef = useRef<TextInputInstance>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [nameEdited, setNameEdited] = useState(false);
  const [role, setRole] = useState<ShareRole>('reader');
  const [sending, setSending] = useState(false);

  const valid = isValidEmail(email);
  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }];

  async function submit() {
    if (!valid || sending) return;
    setSending(true);
    try {
      await onSubmit({ name, email, role });
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardSheet onClose={onCancel} focusRef={emailRef}>
      <ThemedText type="heading">Share calendar</ThemedText>
      <View style={styles.field}>
        <ThemedText type="label" themeColor="textSecondary">
          Email
        </ThemedText>
        <TextInput
          ref={emailRef}
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            if (!nameEdited) setName(nameFromEmail(text));
          }}
          placeholder="johndoe@gmail.com"
          placeholderTextColor={theme.textSecondary}
          selectionColor={theme.tint}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => nameRef.current?.focus()}
          maxLength={254}
          style={inputStyle}
        />
      </View>
      <View style={styles.field}>
        <ThemedText type="label" themeColor="textSecondary">
          Name
        </ThemedText>
        <TextInput
          ref={nameRef}
          value={name}
          onChangeText={(text) => {
            setName(text);
            setNameEdited(true);
          }}
          placeholder="John Doe"
          placeholderTextColor={theme.textSecondary}
          selectionColor={theme.tint}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          returnKeyType="done"
          onSubmitEditing={() => void submit()}
          maxLength={100}
          style={inputStyle}
        />
      </View>
      <View style={styles.field}>
        <ThemedText type="label" themeColor="textSecondary">
          They can see
        </ThemedText>
        <Segmented options={ROLE_OPTIONS} value={role} onChange={setRole} />
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        Google emails them a link to add the “Voice To-Do” calendar to their own Google Calendar.
      </ThemedText>
      <View style={styles.actions}>
        <Button title="Cancel" variant="plain" onPress={onCancel} />
        <Button title="Share" variant="primary" disabled={!valid} loading={sending} onPress={() => void submit()} />
      </View>
    </KeyboardSheet>
  );
}

const styles = StyleSheet.create({
  field: { gap: Spacing.one + 2 },
  input: {
    minHeight: 48,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.two },
});
