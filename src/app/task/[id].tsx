import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { Stepper } from '@/components/ui/stepper';
import { Spacing } from '@/constants/theme';
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

const PRIORITIES = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
] as const;

/** Edit sheet (formSheet). Native form sheets have no header, so the actions live in the content. */
export default function TaskSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tasks } = useTasks();
  const task = tasks.find((t) => t.id === id);

  if (!task) {
    return (
      <ThemedView style={styles.missing}>
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

  const cleaned: TaskEdit = { ...draft, title: draft.title.trim(), notes: draft.notes?.trim() || null };
  const dirty =
    cleaned.title !== task.title ||
    cleaned.notes !== task.notes ||
    cleaned.priority !== task.priority ||
    cleaned.durationMinutes !== task.durationMinutes ||
    cleaned.scheduleToCalendar !== task.scheduleToCalendar;
  const set = (patch: Partial<TaskEdit>) => setDraft((d) => ({ ...d, ...patch }));

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
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextInput
          value={draft.title}
          onChangeText={(title) => set({ title })}
          maxLength={200}
          multiline
          accessibilityLabel="Title"
          style={[styles.title, { color: theme.text }]}
        />
        <ThemedText type="small" themeColor="textSecondary">
          {describeWhen(task, settings.timeZone, now)}
          {task.deadline !== null && ` · due ${formatDeadline(task.deadline, settings.timeZone, now)}`}
        </ThemedText>

        <TextInput
          value={draft.notes ?? ''}
          onChangeText={(notes) => set({ notes })}
          placeholder="Notes"
          placeholderTextColor={theme.textSecondary}
          multiline
          maxLength={1000}
          style={[styles.notes, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />

        <View style={styles.group}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            PRIORITY
          </ThemedText>
          <Segmented<Priority> options={PRIORITIES} value={draft.priority} onChange={(priority) => set({ priority })} />
        </View>

        <Stepper
          label="Duration"
          value={draft.durationMinutes}
          step={15}
          min={5}
          max={480}
          format={formatDuration}
          onChange={(durationMinutes) => set({ durationMinutes })}
        />
        <View style={styles.switchRow}>
          <ThemedText>Book in calendar</ThemedText>
          <Switch
            value={draft.scheduleToCalendar}
            onValueChange={(scheduleToCalendar) => set({ scheduleToCalendar })}
            accessibilityLabel="Book in calendar"
          />
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
  content: { padding: Spacing.four, gap: Spacing.three },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '600', paddingVertical: 0 },
  notes: { minHeight: 72, borderRadius: 14, padding: Spacing.three, fontSize: 16, textAlignVertical: 'top' },
  group: { gap: Spacing.two },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  actions: { gap: Spacing.two, paddingTop: Spacing.two },
});
