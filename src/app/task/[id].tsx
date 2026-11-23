import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { ShareTaskSheet } from '@/components/share-task-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Segmented } from '@/components/ui/segmented';
import { Stepper } from '@/components/ui/stepper';
import { Radius, Spacing } from '@/constants/theme';
import { useErrorAlert } from '@/hooks/use-error-alert';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import type { Task } from '@/lib/db';
import { formatDeadline } from '@/lib/time';
import type { Priority } from '@/schemas/ai-schema';
import { nameFromEmail } from '@/features/sharing/contact';
import { useCalendarShares } from '@/features/sharing/use-calendar-shares';
import { useEventGuests } from '@/features/sharing/use-event-guests';
import { describeUnscheduled, describeWhen, formatDuration } from '@/features/tasks/present';
import type { TaskEdit } from '@/features/tasks/task-operations';
import { useReadySettings } from '@/providers/settings-provider';
import { useTasks } from '@/providers/tasks-provider';

type IconName = { ios: Parameters<typeof Icon>[0]['ios']; android: Parameters<typeof Icon>[0]['android'] };

/**
 * Edit sheet (formSheet). Native form sheets have no header, so the actions live in the content.
 *
 * The ScrollView is the screen's root on purpose. iOS may lay a form sheet's content out before it
 * has a height, and a `flex: 1` wrapper then collapses to 0 (a blank sheet). A ScrollView sizes to
 * its content in that case and fills the sheet otherwise. Being first child also lets the sheet
 * expand when the list is scrolled to its edge.
 */
export default function TaskSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tasks } = useTasks();
  const task = tasks.find((t) => t.id === id);

  if (!task) {
    return (
      <ThemedView type="surface" style={styles.missing}>
        <ThemedText themeColor="textSecondary">This task no longer exists.</ThemedText>
        <Button title="Close" onPress={() => router.back()} />
      </ThemedView>
    );
  }
  return <TaskEditor key={task.id} task={task} />;
}

function TaskEditor({ task }: { task: Task }) {
  const theme = useTheme();
  const settings = useReadySettings();
  const calendarId = settings.appCalendarId!;
  const { edit, reschedule, complete, reopen, remove } = useTasks();
  const showError = useErrorAlert();
  const now = useNow();
  const { shares } = useCalendarShares(calendarId);
  const { guests, invite, uninvite } = useEventGuests(calendarId, task.calendarEventId);

  const [draft, setDraft] = useState<TaskEdit>({
    title: task.title,
    notes: task.notes,
    priority: task.priority,
    durationMinutes: task.durationMinutes,
    scheduleToCalendar: task.scheduleToCalendar,
  });
  const [busy, setBusy] = useState<'save' | 'reschedule' | 'status' | 'delete' | null>(null);
  const [sharing, setSharing] = useState(false);

  const priorities = [
    { value: 'high', label: 'High', dot: theme.priorityHigh },
    { value: 'medium', label: 'Medium', dot: theme.priorityMedium },
    { value: 'low', label: 'Low', dot: theme.priorityLow },
  ] as const;

  const cleaned: TaskEdit = { ...draft, title: draft.title.trim(), notes: draft.notes?.trim() || null };
  const dirty =
    cleaned.title !== task.title ||
    cleaned.notes !== task.notes ||
    cleaned.priority !== task.priority ||
    cleaned.durationMinutes !== task.durationMinutes ||
    cleaned.scheduleToCalendar !== task.scheduleToCalendar;
  const set = (patch: Partial<TaskEdit>) => setDraft((d) => ({ ...d, ...patch }));
  const done = task.status === 'done';
  const problem = !done && task.scheduledStart === null && !!task.unscheduledReason;
  const canSchedule = !done && draft.scheduleToCalendar;
  const when = describeWhen(task, settings.timeZone, now);
  const due = task.deadline !== null ? `Due ${formatDeadline(task.deadline, settings.timeZone, now)}` : null;

  async function run(kind: NonNullable<typeof busy>, action: () => Promise<void>) {
    setBusy(kind);
    try {
      await action();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(null);
    }
  }

  /** Saves pending edits first, so "Reschedule" uses the new duration and priority. */
  async function saveIfDirty(): Promise<Task> {
    if (!dirty) return task;
    const result = await edit(task, cleaned);
    if (result.warning) showError(result.warning, 'Calendar not updated');
    return result.task;
  }

  const save = () =>
    run('save', async () => {
      await saveIfDirty();
      router.back();
    });

  const findNewTime = () =>
    run('reschedule', async () => {
      const current = await saveIfDirty();
      const reason = await reschedule(current);
      if (reason) {
        Alert.alert("Couldn't find a time", describeUnscheduled({ ...current, unscheduledReason: reason }, settings.timeZone, now));
      } else {
        router.back();
      }
    });

  const toggleStatus = () =>
    run('status', async () => {
      const warning = done ? await reopen(task) : await complete(task);
      if (warning) showError(warning, 'Calendar not updated');
      router.back();
    });

  const confirmDelete = () =>
    Alert.alert('Delete task?', task.calendarEventId ? 'Its calendar event is deleted too.' : undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          void run('delete', async () => {
            await remove(task);
            router.back();
          }),
      },
    ]);

  return (
    <ScrollView
      style={{ backgroundColor: theme.surface }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive">
      {/* Title + when */}
      <View style={styles.header}>
        <TextInput
          value={draft.title}
          onChangeText={(title) => set({ title })}
          maxLength={200}
          multiline
          accessibilityLabel="Title"
          selectionColor={theme.tint}
          style={[styles.title, { color: theme.text }, done && styles.titleDone]}
        />
        <View style={styles.chips}>
          <Chip
            icon={
              problem
                ? { ios: 'exclamationmark.circle', android: 'error' }
                : task.scheduledStart !== null
                  ? { ios: 'calendar', android: 'calendar_today' }
                  : { ios: 'list.bullet', android: 'list' }
            }
            color={problem ? theme.warning : undefined}>
            {when}
          </Chip>
          {due && <Chip icon={{ ios: 'flag', android: 'flag' }}>{due}</Chip>}
          {done && (
            <Chip icon={{ ios: 'checkmark', android: 'check' }} color={theme.success}>
              Done
            </Chip>
          )}
        </View>
      </View>

      {/* Quick actions */}
      <View style={styles.tiles}>
        <ActionTile
          icon={done ? { ios: 'arrow.uturn.backward', android: 'undo' } : { ios: 'checkmark', android: 'check' }}
          label={done ? 'Reopen' : 'Done'}
          accent={done ? theme.textSecondary : theme.success}
          loading={busy === 'status'}
          onPress={toggleStatus}
        />
        {canSchedule && (
          <ActionTile
            icon={{ ios: 'calendar.badge.clock', android: 'event_repeat' }}
            label={task.scheduledStart !== null ? 'Reschedule' : 'Find a time'}
            accent={theme.tint}
            disabled={!cleaned.title}
            loading={busy === 'reschedule'}
            onPress={findNewTime}
          />
        )}
        <ActionTile
          icon={{ ios: 'person.badge.plus', android: 'person_add' }}
          label="Share"
          accent={theme.priorityMedium}
          onPress={() => setSharing(true)}
        />
      </View>

      {/* Guests */}
      {guests && guests.length > 0 && (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Manage who this task is shared with"
          onPress={() => setSharing(true)}
          style={[styles.guests, { borderColor: theme.border }]}>
          <View style={styles.avatarStack}>
            {guests.slice(0, 4).map((g, i) => (
              <View key={g.email} style={[styles.stacked, { marginLeft: i === 0 ? 0 : -10, borderColor: theme.surface }]}>
                <Avatar name={g.displayName || nameFromEmail(g.email) || g.email} size={28} />
              </View>
            ))}
          </View>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.flex}>
            Shared with{' '}
            <ThemedText type="smallBold">
              {guests
                .map((g) => g.displayName || nameFromEmail(g.email) || g.email)
                .slice(0, 2)
                .join(', ')}
              {guests.length > 2 ? ` +${guests.length - 2}` : ''}
            </ThemedText>
          </ThemedText>
          <Icon ios="chevron.right" android="chevron_right" size={14} color={theme.textSecondary} />
        </PressableScale>
      )}

      {/* Notes */}
      <TextInput
        value={draft.notes ?? ''}
        onChangeText={(notes) => set({ notes })}
        placeholder="Add notes"
        placeholderTextColor={theme.textSecondary}
        selectionColor={theme.tint}
        multiline
        maxLength={1000}
        style={[styles.notes, { color: theme.text, backgroundColor: theme.backgroundElement }]}
      />

      {/* Details */}
      <View style={styles.section}>
        <ThemedText type="label" themeColor="textSecondary" style={styles.sectionLabel}>
          Priority
        </ThemedText>
        <Segmented<Priority> options={priorities} value={draft.priority} onChange={(priority) => set({ priority })} />
      </View>

      <View style={[styles.card, { borderColor: theme.border }]}>
        <Stepper
          label="Duration"
          value={draft.durationMinutes}
          step={15}
          min={5}
          max={480}
          format={formatDuration}
          onChange={(durationMinutes) => set({ durationMinutes })}
        />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <View style={styles.switchRow}>
          <View style={styles.flex}>
            <ThemedText>Book in calendar</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {draft.scheduleToCalendar ? 'Gets a time slot in your calendar' : 'Stays on your list only'}
            </ThemedText>
          </View>
          <Switch
            value={draft.scheduleToCalendar}
            onValueChange={(scheduleToCalendar) => set({ scheduleToCalendar })}
            trackColor={{ true: theme.tint }}
            accessibilityLabel="Book in calendar"
          />
        </View>
      </View>

      {/* Save + delete */}
      <View style={styles.footer}>
        {dirty && (
          <Button title="Save changes" variant="primary" disabled={!cleaned.title} loading={busy === 'save'} onPress={save} />
        )}
        <Button title="Delete task" variant="destructive" loading={busy === 'delete'} onPress={confirmDelete} style={styles.delete} />
      </View>

      {sharing && (
        <ShareTaskSheet
          taskTitle={task.title}
          shareText={[task.title, when, due, task.notes].filter(Boolean).join('\n')}
          onCalendar={task.calendarEventId !== null}
          people={shares ?? []}
          guests={task.calendarEventId ? guests : []}
          onInvite={(person) => invite(person.email, person.name)}
          onUninvite={uninvite}
          onClose={() => setSharing(false)}
        />
      )}
    </ScrollView>
  );
}

function Chip({ icon, color, children }: { icon: IconName; color?: string; children: ReactNode }) {
  const theme = useTheme();
  const tone = color ?? theme.textSecondary;
  return (
    <View style={[styles.chip, { backgroundColor: theme.backgroundElement }]}>
      <Icon ios={icon.ios} android={icon.android} size={13} color={tone} />
      <ThemedText type="small" style={[styles.chipText, { color: tone }]} numberOfLines={1}>
        {children}
      </ThemedText>
    </View>
  );
}

function ActionTile({
  icon,
  label,
  accent,
  onPress,
  loading,
  disabled,
}: {
  icon: IconName;
  label: string;
  accent: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={[styles.tile, { backgroundColor: theme.backgroundElement }, disabled && styles.dim]}>
      <View style={[styles.tileIcon, { backgroundColor: theme.surface }]}>
        {loading ? (
          <ActivityIndicator size="small" color={accent} />
        ) : (
          <Icon ios={icon.ios} android={icon.android} size={18} color={accent} />
        )}
      </View>
      <ThemedText type="smallBold" numberOfLines={1}>
        {label}
      </ThemedText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, paddingTop: Spacing.five, paddingBottom: Spacing.six, gap: Spacing.four },
  missing: { alignItems: 'center', gap: Spacing.three, padding: Spacing.four, paddingTop: Spacing.six },
  flex: { flex: 1 },
  header: { gap: Spacing.three },
  title: { fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -0.4, paddingVertical: 0 },
  titleDone: { opacity: 0.55, textDecorationLine: 'line-through' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: { fontSize: 13, lineHeight: 18, flexShrink: 1 },
  tiles: { flexDirection: 'row', gap: Spacing.two },
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    borderRadius: Radius.large,
    borderCurve: 'continuous',
  },
  tileIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.45 },
  guests: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.large,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
  },
  avatarStack: { flexDirection: 'row' },
  stacked: { borderWidth: 2, borderRadius: 16 },
  notes: {
    minHeight: 72,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    padding: Spacing.three,
    paddingTop: Spacing.three,
    fontSize: 16,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  section: { gap: Spacing.two },
  sectionLabel: { paddingHorizontal: Spacing.one },
  card: {
    borderRadius: Radius.large,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  divider: { height: StyleSheet.hairlineWidth },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 60, paddingVertical: Spacing.two },
  footer: { gap: Spacing.two },
  delete: { alignSelf: 'center', backgroundColor: 'transparent' },
});
