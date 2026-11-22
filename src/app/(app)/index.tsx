import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CapturePanel } from '@/components/capture-panel';
import { TaskRow } from '@/components/task-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Aurora } from '@/components/ui/aurora';
import { Icon } from '@/components/ui/icon';
import { ProgressBar } from '@/components/ui/progress-bar';
import { RainbowRing } from '@/components/ui/rainbow-ring';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useErrorAlert } from '@/hooks/use-error-alert';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import type { Task } from '@/lib/db';
import { describeError } from '@/lib/errors';
import { formatLongDate } from '@/lib/time';
import { groupTasks, todayProgress, type SectionKey } from '@/features/tasks/present';
import { useReadySettings } from '@/providers/settings-provider';
import { useTasks } from '@/providers/tasks-provider';

/** Room at the bottom of the list so the last rows clear the floating mic. */
const PANEL_CLEARANCE = 150;

// New tasks drop in, finished ones glide to Done, deleted ones fade out.
const rowEnter = FadeInDown.springify().damping(20);
const rowExit = FadeOut.duration(150);
const rowLayout = LinearTransition.springify().damping(22).stiffness(200);

type Row =
  | { kind: 'header'; key: SectionKey; title: string; count: number }
  | { kind: 'task'; task: Task };

export default function TasksScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const settings = useReadySettings();
  const { tasks, isLoading, error, refresh, complete, reopen } = useTasks();
  const showError = useErrorAlert();
  const now = useNow(60_000);
  const [refreshing, setRefreshing] = useState(false);

  const rows: Row[] = groupTasks(tasks, settings.timeZone, now).flatMap((section) => [
    { kind: 'header', key: section.key, title: section.title, count: section.data.length },
    ...section.data.map((task): Row => ({ kind: 'task', task })),
  ]);
  const progress = todayProgress(tasks, settings.timeZone, now);
  const panelBottom = insets.bottom + BottomTabInset + Spacing.two;

  async function toggleDone(task: Task) {
    try {
      const warning = task.status === 'done' ? await reopen(task) : await complete(task);
      if (warning) showError(warning, 'Calendar not updated');
    } catch (e) {
      showError(e, "Couldn't update the task");
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  return (
    <ThemedView style={styles.container}>
      <Aurora height={insets.top + 280} />
      <Animated.FlatList
        data={rows}
        keyExtractor={(row) => (row.kind === 'header' ? `section:${row.key}` : row.task.id)}
        itemLayoutAnimation={rowLayout}
        skipEnteringExitingAnimations
        contentInsetAdjustmentBehavior="never"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.textSecondary} />}
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: panelBottom + PANEL_CLEARANCE }}
        ListHeaderComponent={
          <View style={styles.header}>
            <ThemedText type="label" themeColor="textSecondary">
              {formatLongDate(now, settings.timeZone)}
            </ThemedText>
            <ThemedText type="title">Tasks</ThemedText>
            {progress.total > 0 && <TodayCard done={progress.done} total={progress.total} />}
            {error && (
              <ThemedText type="small" style={{ color: theme.danger }}>
                {describeError(error)}
              </ThemedText>
            )}
          </View>
        }
        renderItem={({ item }) =>
          item.kind === 'header' ? (
            <View style={styles.sectionHeader}>
              <ThemedText type="label" themeColor="textSecondary">
                {item.title}
              </ThemedText>
              <ThemedText type="label" themeColor="textSecondary" style={styles.count}>
                {item.count}
              </ThemedText>
            </View>
          ) : (
            <Animated.View entering={rowEnter} exiting={rowExit} style={styles.rowGap}>
              <TaskRow
                task={item.task}
                timeZone={settings.timeZone}
                now={now}
                onPress={() => router.push({ pathname: '/task/[id]', params: { id: item.task.id } })}
                onToggleDone={() => toggleDone(item.task)}
              />
            </Animated.View>
          )
        }
        ListEmptyComponent={isLoading ? <ActivityIndicator style={styles.loading} /> : <EmptyState />}
      />
      <View style={[styles.panel, { bottom: panelBottom }]} pointerEvents="box-none">
        <CapturePanel timeZone={settings.timeZone} />
      </View>
    </ThemedView>
  );
}

function TodayCard({ done, total }: { done: number; total: number }) {
  const theme = useTheme();
  const allDone = done === total;
  return (
    <View style={[styles.todayCard, { backgroundColor: theme.surface, boxShadow: theme.shadowCard }]}>
      <View style={styles.todayText}>
        <ThemedText type="smallBold">{allDone ? 'All clear for today' : `${done} of ${total} done today`}</ThemedText>
        {allDone && <Icon ios="sparkles" android="auto_awesome" size={16} color={theme.priorityMedium} />}
      </View>
      <ProgressBar progress={total === 0 ? 0 : done / total} />
    </View>
  );
}

function EmptyState() {
  const theme = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.empty}>
      <RainbowRing size={84} thickness={4} periodMs={12_000} centerColor={theme.surface}>
        <Icon ios="mic.fill" android="mic" size={30} color={theme.text} />
      </RainbowRing>
      <ThemedText type="heading" style={styles.center}>
        Your list is clear
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.center}>
        Tap the mic and say what you need to do.
      </ThemedText>
      <View style={[styles.example, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          “Dentist tomorrow at 10, finish the report by Friday, buy milk.”
        </ThemedText>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: Spacing.three + 4, paddingTop: Spacing.four, paddingBottom: Spacing.two, gap: Spacing.one },
  todayCard: {
    marginTop: Spacing.three,
    borderRadius: Radius.large,
    borderCurve: 'continuous',
    padding: Spacing.three,
    gap: Spacing.two + 2,
  },
  todayText: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three + 4,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.two,
  },
  count: { opacity: 0.7 },
  rowGap: { paddingBottom: Spacing.two },
  loading: { paddingTop: Spacing.six },
  empty: { alignItems: 'center', paddingTop: Spacing.six, paddingHorizontal: Spacing.five, gap: Spacing.two + 2 },
  example: {
    marginTop: Spacing.two,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 4,
  },
  center: { textAlign: 'center' },
  panel: { position: 'absolute', left: 0, right: 0 },
});
