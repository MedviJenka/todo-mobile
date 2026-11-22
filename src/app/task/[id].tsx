import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Segmented } from '@/components/ui/segmented';
import { Stepper } from '@/components/ui/stepper';
import { Radius, Spacing } from '@/constants/theme';
import { useErrorAlert } from '@/hooks/use-error-alert';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import type { Task } from '@/lib/db';
import { formatDeadline } from '@/lib/time';
import type { Priority } from '@/schemas/ai-schema';
import { describeUnscheduled, describeWhen, formatDuration } from '@/features/tasks/present';
import type { TaskEdit } from '@/features/tasks/task-operations';
import { useReadySettings } from '@/providers/settings-provider';
import { useTasks } from '@/providers/tasks-provider';

/** Edit sheet (formSheet). Native form sheets have no header, so the actions live in the content. */
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
  const { edit, reschedule, complete, reopen, remove } = useTasks();
  const showError = useErrorAlert();
  const now = useNow();

  const [draft, setDraft] = useState<TaskEdit>({
    title: task.title,
    notes: task.notes,
    priority: task.priority,
    durationMinutes: task.durationMinutes,
    scheduleToCalendar: task.scheduleToCalendar,
  });
  const [busy, setBusy] = useState<'save' | 'reschedule' | 'status' | 'delete' | null>(null);

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
  const problem = task.status === 'todo' && task.scheduledStart === null && !!task.unscheduledReason;

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

  /** Saves pending edits first, so "Find a new time" uses the new duration and priority. */
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
      const warning = task.status === 'done' ? await reopen(task) : await complete(task);
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
    <ThemedView type="surface" style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextInput
          value={draft.title}
          onChangeText={(title) => set({ title })}
          maxLength={200}
          multiline
          accessibilityLabel="Title"
          selectionColor={theme.tint}
          style={[styles.title, { color: theme.text }]}
        />
        <View style={[styles.when, { backgroundColor: theme.backgroundElement }]}>
          <Icon
            ios={problem ? 'exclamationmark.circle' : task.scheduledStart !== null ? 'calendar' : 'list.bullet'}
            android={problem ? 'error' : task.scheduledStart !== null ? 'calendar_today' : 'list'}
            size={14}
            color={problem ? theme.warning : theme.textSecondary}
          />
          <ThemedText type="small" style={[styles.whenText, { color: problem ? theme.warning : theme.textSecondary }]}>
            {describeWhen(task, settings.timeZone, now)}
            {task.deadline !== null && ` · due ${formatDeadline(task.deadline, settings.timeZone, now)}`}
          </ThemedText>
        </View>

        <TextInput
          value={draft.notes ?? ''}
          onChangeText={(notes) => set({ notes })}
          placeholder="Notes"
          placeholderTextColor={theme.textSecondary}
          selectionColor={theme.tint}
          multiline
          maxLength={1000}
          style={[styles.notes, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />

        <View style={styles.group}>
          <ThemedText type="label" themeColor="textSecondary">
            Priority
          </ThemedText>
          <Segmented<Priority> options={priorities} value={draft.priority} onChange={(priority) => set({ priority })} />
        </View>

        <View style={[styles.card, { backgroundColor: theme.background }]}>
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
            <ThemedText>Book in calendar</ThemedText>
            <Switch
              value={draft.scheduleToCalendar}
              onValueChange={(scheduleToCalendar) => set({ scheduleToCalendar })}
              trackColor={{ true: theme.tint }}
              accessibilityLabel="Book in calendar"
            />
          </View>
        </View>

        <View style={styles.actions}>
          {dirty && (
            <Button title="Save" variant="primary" disabled={!cleaned.title} loading={busy === 'save'} onPress={save} />
          )}
          {task.status === 'todo' && draft.scheduleToCalendar && (
            <Button
              title={task.scheduledStart !== null ? 'Find a new time' : 'Find a time'}
              disabled={!cleaned.title}
              loading={busy === 'reschedule'}
              onPress={findNewTime}
            />
          )}
          <Button
            title={task.status === 'done' ? 'Mark as not done' : 'Mark as done'}
            loading={busy === 'status'}
            onPress={toggleStatus}
          />
          <Button title="Delete" variant="destructive" loading={busy === 'delete'} onPress={confirmDelete} />
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, paddingTop: Spacing.five, gap: Spacing.three },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  title: { fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -0.4, paddingVertical: 0 },
  when: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  whenText: { fontSize: 13, lineHeight: 18, flexShrink: 1 },
  notes: {
    minHeight: 88,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    padding: Spacing.three,
    fontSize: 16,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  group: { gap: Spacing.two },
  card: { borderRadius: Radius.large, borderCurve: 'continuous', paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  divider: { height: StyleSheet.hairlineWidth },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52 },
  actions: { gap: Spacing.two, paddingTop: Spacing.two },
});
