import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CapturePanel } from '@/components/capture-panel';
import { TaskRow } from '@/components/task-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useErrorAlert } from '@/hooks/use-error-alert';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import type { Task } from '@/lib/db';
import { describeError } from '@/lib/errors';
import { formatLongDate } from '@/lib/time';
import { groupTasks } from '@/features/tasks/present';
import { useReadySettings } from '@/providers/settings-provider';
import { useTasks } from '@/providers/tasks-provider';

/** Room at the bottom of the list so the last rows clear the floating mic. */
const PANEL_CLEARANCE = 140;

export default function TasksScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const settings = useReadySettings();
  const { tasks, isLoading, error, refresh, complete, reopen } = useTasks();
  const showError = useErrorAlert();
  const now = useNow(60_000);
  const [refreshing, setRefreshing] = useState(false);

  const sections = groupTasks(tasks, settings.timeZone, now);
  const panelBottom = insets.bottom + BottomTabInset + Spacing.two;

  async function toggleDone(task: Task) {
    try {
      const warning = task.status === 'done' ? await reopen(task) : await complete(task);
      Haptics.selectionAsync().catch(() => undefined);
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
      <SectionList
        sections={sections}
        keyExtractor={(task) => task.id}
        contentInsetAdjustmentBehavior="never"
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: panelBottom + PANEL_CLEARANCE }}
        ListHeaderComponent={
          <View style={styles.header}>
            <ThemedText type="subtitle">Tasks</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {formatLongDate(now, settings.timeZone)}
            </ThemedText>
            {error && (
              <ThemedText type="small" style={{ color: theme.danger }}>
                {describeError(error)}
              </ThemedText>
            )}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionHeader}>
            {section.title.toUpperCase()}
          </ThemedText>
        )}
        renderItem={({ item }) => (
          <TaskRow
            task={item}
            timeZone={settings.timeZone}
            now={now}
            onPress={() => router.push({ pathname: '/task/[id]', params: { id: item.id } })}
            onToggleDone={() => void toggleDone(item)}
          />
        )}
        ItemSeparatorComponent={() => (
          <View style={[styles.separator, { backgroundColor: theme.backgroundElement }]} />
        )}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator style={styles.empty} />
          ) : (
            <View style={styles.empty}>
              <ThemedText themeColor="textSecondary" style={styles.emptyText}>
                Tap the mic and say what you need to do.{'\n'}“Dentist tomorrow at 10, finish the report by Friday, buy milk.”
              </ThemedText>
            </View>
          )
        }
      />
      <View style={[styles.panel, { bottom: panelBottom }]} pointerEvents="box-none">
        <CapturePanel timeZone={settings.timeZone} />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three, paddingBottom: Spacing.two, gap: 2 },
  sectionHeader: { paddingHorizontal: Spacing.four, paddingTop: Spacing.four, paddingBottom: Spacing.one },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: Spacing.four + 10 + Spacing.three },
  empty: { paddingTop: Spacing.six, paddingHorizontal: Spacing.five },
  emptyText: { textAlign: 'center' },
  panel: { position: 'absolute', left: 0, right: 0 },
});
