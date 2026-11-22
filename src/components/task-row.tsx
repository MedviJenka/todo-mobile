import { useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Task } from '@/lib/db';
import { describeWhen } from '@/features/tasks/present';

/** One task. Swipe left to complete (or reopen a done task). Tap to edit. */
export function TaskRow({
  task,
  timeZone,
  now,
  onPress,
  onToggleDone,
}: {
  task: Task;
  timeZone: string;
  now: number;
  onPress: () => void;
  onToggleDone: () => void;
}) {
  const theme = useTheme();
  const swipeable = useRef<SwipeableMethods>(null);
  const done = task.status === 'done';
  const priorityColor = {
    high: theme.priorityHigh,
    medium: theme.priorityMedium,
    low: theme.priorityLow,
  }[task.priority];
  const problem = task.scheduledStart === null && !!task.unscheduledReason;

  return (
    <ReanimatedSwipeable
      ref={swipeable}
      friction={2}
      rightThreshold={64}
      overshootRight={false}
      onSwipeableOpen={() => {
        swipeable.current?.close();
        onToggleDone();
      }}
      renderRightActions={() => (
        <View style={[styles.action, { backgroundColor: done ? theme.backgroundSelected : theme.success }]}>
          <ThemedText type="smallBold" style={{ color: done ? theme.text : theme.onTint }}>
            {done ? 'Reopen' : 'Done'}
          </ThemedText>
        </View>
      )}>
      <Pressable
        accessibilityRole="button"
        accessibilityHint={done ? 'Swipe left to reopen' : 'Swipe left to mark done'}
        accessibilityActions={[{ name: 'activate' }, { name: 'toggleDone', label: done ? 'Reopen' : 'Mark done' }]}
        onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'toggleDone' ? onToggleDone() : onPress())}
        onPress={onPress}
        style={({ pressed }) => [styles.row, { backgroundColor: pressed ? theme.backgroundElement : theme.background }]}>
        <View style={[styles.dot, { backgroundColor: done ? theme.backgroundSelected : priorityColor }]} />
        <View style={styles.body}>
          <ThemedText
            numberOfLines={2}
            style={[styles.title, done && { textDecorationLine: 'line-through', color: theme.textSecondary }]}>
            {task.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={problem && { color: theme.danger }}>
            {describeWhen(task, timeZone, now)}
          </ThemedText>
        </View>
      </Pressable>
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three - 4,
    minHeight: 60,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 16, lineHeight: 22 },
  action: { width: 96, alignItems: 'center', justifyContent: 'center' },
});
