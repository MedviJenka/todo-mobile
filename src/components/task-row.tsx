import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { ZoomIn, ZoomOut } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Task } from '@/lib/db';
import { describeWhen } from '@/features/tasks/present';

/**
 * One task as a card. Tap the circle (or swipe left) to complete or reopen, tap the card to
 * edit. The check fills right away and the row moves once the change is saved.
 */
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
  onToggleDone: () => Promise<void>;
}) {
  const theme = useTheme();
  const swipeable = useRef<SwipeableMethods>(null);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const done = optimistic ?? task.status === 'done';
  const problem = task.status === 'todo' && task.scheduledStart === null && !!task.unscheduledReason;
  const priorityColor = { high: theme.priorityHigh, medium: theme.priorityMedium, low: theme.priorityLow }[
    task.priority
  ];
  const metaColor = problem ? theme.warning : theme.textSecondary;

  async function toggle() {
    if (optimistic !== null) return;
    setOptimistic(task.status !== 'done');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    try {
      await onToggleDone();
    } finally {
      setOptimistic(null);
    }
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, boxShadow: theme.shadowCard }]}>
      <ReanimatedSwipeable
        ref={swipeable}
        friction={2}
        rightThreshold={72}
        overshootRight={false}
        containerStyle={styles.clip}
        onSwipeableOpen={() => {
          swipeable.current?.close();
          void toggle();
        }}
        renderRightActions={() => (
          <View style={[styles.action, { backgroundColor: done ? theme.backgroundSelected : theme.success }]}>
            <Icon ios={done ? 'arrow.uturn.backward' : 'checkmark'} android={done ? 'undo' : 'check'} size={18} color={done ? theme.text : theme.onTint} />
            <ThemedText type="smallBold" style={{ color: done ? theme.text : theme.onTint }}>
              {done ? 'Reopen' : 'Done'}
            </ThemedText>
          </View>
        )}>
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Opens the task"
          accessibilityActions={[{ name: 'activate' }, { name: 'toggleDone', label: done ? 'Reopen' : 'Mark done' }]}
          onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'toggleDone' ? void toggle() : onPress())}
          onPress={onPress}
          style={({ pressed }) => [styles.row, { backgroundColor: pressed ? theme.backgroundElement : theme.surface }]}>
          <CheckCircle done={done} ringColor={priorityColor} onPress={() => void toggle()} />
          <View style={styles.body}>
            <ThemedText
              numberOfLines={2}
              style={[styles.title, done && { textDecorationLine: 'line-through', color: theme.textSecondary }]}>
              {task.title}
            </ThemedText>
            <View style={styles.meta}>
              <Icon {...metaIcon(task, problem)} size={13} color={metaColor} />
              <ThemedText type="small" numberOfLines={1} style={[styles.metaText, { color: metaColor }]}>
                {describeWhen(task, timeZone, now)}
              </ThemedText>
            </View>
          </View>
        </Pressable>
      </ReanimatedSwipeable>
    </View>
  );
}

function metaIcon(task: Task, problem: boolean) {
  if (problem) return { ios: 'exclamationmark.circle', android: 'error' } as const;
  if (task.scheduledStart !== null) return { ios: 'calendar', android: 'calendar_today' } as const;
  return { ios: 'list.bullet', android: 'list' } as const;
}

/** Priority-colored ring; completing fills it green and pops in a check. */
function CheckCircle({ done, ringColor, onPress }: { done: boolean; ringColor: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <PressableScale
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={done ? 'Reopen task' : 'Complete task'}
      hitSlop={12}
      scaleTo={0.82}
      onPress={onPress}
      style={[
        styles.check,
        done ? { borderColor: theme.success, backgroundColor: theme.success } : { borderColor: ringColor },
      ]}>
      {done && (
        <Animated.View entering={ZoomIn.springify().damping(12)} exiting={ZoomOut.duration(120)}>
          <Icon ios="checkmark" android="check" size={14} color="#FFFFFF" />
        </Animated.View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: Spacing.three, borderRadius: Radius.large, borderCurve: 'continuous' },
  clip: { borderRadius: Radius.large, borderCurve: 'continuous', overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 2,
    paddingHorizontal: Spacing.three,
    paddingVertical: 14,
    minHeight: 64,
  },
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 3 },
  title: { fontSize: 16, lineHeight: 22, fontWeight: 500 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { flexShrink: 1, fontSize: 13, lineHeight: 18 },
  action: { width: 104, alignItems: 'center', justifyContent: 'center', gap: 2 },
});
