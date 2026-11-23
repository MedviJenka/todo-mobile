import { useState } from 'react';
import { ActivityIndicator, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { KeyboardSheet } from '@/components/ui/keyboard-sheet';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Radius, Spacing } from '@/constants/theme';
import { useErrorAlert } from '@/hooks/use-error-alert';
import { useTheme } from '@/hooks/use-theme';
import type { Attendee } from '@/lib/google/calendar';
import { isValidEmail, nameFromEmail, normalizeEmail } from '@/features/sharing/contact';

type Person = { name: string; email: string };

/**
 * Invite people to a task's calendar event (Google emails them the invite), or send the task as a
 * plain message when it isn't on the calendar.
 */
export function ShareTaskSheet({
  taskTitle,
  shareText,
  onCalendar,
  people,
  guests,
  onInvite,
  onUninvite,
  onClose,
}: {
  taskTitle: string;
  /** Text for the system share sheet. */
  shareText: string;
  /** The task has a calendar event, so people can be invited to it. */
  onCalendar: boolean;
  /** Saved contacts (Settings → Sharing). */
  people: readonly Person[];
  guests: readonly Attendee[] | null;
  onInvite: (person: Person) => Promise<void>;
  onUninvite: (email: string) => Promise<void>;
  onClose: () => void;
}) {
  const theme = useTheme();
  const showError = useErrorAlert();
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState<string | null>(null);

  const invited = new Set((guests ?? []).map((g) => normalizeEmail(g.email)));
  // Saved contacts first, then guests who aren't saved contacts.
  const rows: Person[] = [
    ...people,
    ...(guests ?? [])
      .filter((g) => !people.some((p) => normalizeEmail(p.email) === normalizeEmail(g.email)))
      .map((g) => ({ email: g.email, name: g.displayName || nameFromEmail(g.email) || g.email })),
  ];

  async function toggle(person: Person) {
    const address = normalizeEmail(person.email);
    setPending(address);
    try {
      if (invited.has(address)) await onUninvite(address);
      else await onInvite(person);
    } catch (e) {
      showError(e, "Couldn't update the invite");
    } finally {
      setPending(null);
    }
  }

  async function inviteTyped() {
    const address = normalizeEmail(email);
    await toggle({ email: address, name: nameFromEmail(address) || address });
    setEmail('');
  }

  const sendAsMessage = () => void Share.share({ message: shareText }).catch(() => undefined);

  return (
    <KeyboardSheet onClose={onClose}>
      <View style={styles.header}>
        <ThemedText type="heading">Share task</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {taskTitle}
        </ThemedText>
      </View>

      {onCalendar ? (
        <>
          {rows.length > 0 && (
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {rows.map((person) => {
                const address = normalizeEmail(person.email);
                const isInvited = invited.has(address);
                return (
                  <PressableScale
                    key={address}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isInvited }}
                    accessibilityLabel={`${isInvited ? 'Remove' : 'Invite'} ${person.name}`}
                    disabled={pending !== null || guests === null}
                    onPress={() => void toggle(person)}
                    style={[styles.person, { backgroundColor: theme.backgroundElement }]}>
                    <Avatar name={person.name} size={36} />
                    <View style={styles.personText}>
                      <ThemedText type="smallBold" numberOfLines={1}>
                        {person.name}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                        {person.email}
                      </ThemedText>
                    </View>
                    {pending === address ? (
                      <ActivityIndicator color={theme.textSecondary} />
                    ) : isInvited ? (
                      <Icon ios="checkmark.circle.fill" android="check_circle" size={24} color={theme.success} />
                    ) : (
                      <Icon ios="plus.circle" android="add_circle" size={24} color={theme.tint} />
                    )}
                  </PressableScale>
                );
              })}
            </ScrollView>
          )}
          <View style={styles.emailRow}>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Invite by email"
              placeholderTextColor={theme.textSecondary}
              selectionColor={theme.tint}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              returnKeyType="send"
              onSubmitEditing={() => isValidEmail(email) && void inviteTyped()}
              maxLength={254}
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />
            <Button
              title="Invite"
              variant="primary"
              disabled={!isValidEmail(email) || guests === null}
              loading={pending === normalizeEmail(email) && email !== ''}
              onPress={() => void inviteTyped()}
            />
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            Google emails each person an invite to this event. Tap someone again to remove them.
          </ThemedText>
        </>
      ) : (
        <ThemedText themeColor="textSecondary">
          This task isn’t on your calendar, so there’s no event to invite people to. Turn on “Book in calendar” to
          invite people, or send it as a message.
        </ThemedText>
      )}

      <View style={styles.actions}>
        <Button title="Send as message" variant="plain" onPress={sendAsMessage} />
        <Button title="Done" onPress={onClose} />
      </View>
    </KeyboardSheet>
  );
}

const styles = StyleSheet.create({
  header: { gap: 2 },
  list: { maxHeight: 260 },
  listContent: { gap: Spacing.two },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
  },
  personText: { flex: 1, gap: 1 },
  emailRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  input: {
    flex: 1,
    minHeight: 48,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  actions: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
});
