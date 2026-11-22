import * as Linking from 'expo-linking';
import { useState, type ReactNode } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import { LevelMeter } from '@/components/level-meter';
import { MicButton } from '@/components/mic-button';
import { TextCaptureSheet } from '@/components/text-capture-sheet';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Radius, Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { describeError, toAppError } from '@/lib/errors';
import { formatSlot } from '@/lib/time';
import { useCapture, type CaptureState } from '@/features/capture/capture-provider';
import type { CaptureOutcome, CaptureStage } from '@/features/capture/run-capture';
import { describePlacementReason, describeUnscheduled, formatDuration } from '@/features/tasks/present';
import { useSettings } from '@/providers/settings-provider';

const STAGES: { stage: CaptureStage; label: string; activeLabel: string }[] = [
  { stage: 'transcribing', label: 'Transcribe', activeLabel: 'Transcribing…' },
  { stage: 'planning', label: 'Plan', activeLabel: 'Planning…' },
  { stage: 'booking', label: 'Book', activeLabel: 'Booking…' },
];

const enter = FadeInDown.springify().damping(20).stiffness(220);
const exit = FadeOutDown.duration(160);

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/** Bottom-of-screen capture UI: mic, live recording, progress, result with Undo, or error with Retry. */
export function CapturePanel({ timeZone }: { timeZone: string }) {
  const theme = useTheme();
  const { state, recorder, startRecording, submitText, dismiss } = useCapture();
  const [sheet, setSheet] = useState<{ title: string; text: string; captureId: string | null } | null>(null);

  // "starting" already looks like recording: the button answers the tap at once.
  const recording = recorder.phase === 'starting' || recorder.phase === 'recording';
  const busy = state.kind === 'working' || recorder.phase === 'stopping';
  const level = recorder.levels[recorder.levels.length - 1] ?? 0;

  const openSheet = (title: string, text = '', captureId: string | null = null) => setSheet({ title, text, captureId });

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {state.kind === 'result' && !recording && (
        <ResultCard key="result" state={state} timeZone={timeZone} onEditTranscript={openSheet} />
      )}
      {state.kind === 'error' && !recording && <ErrorCard key="error" state={state} onEditTranscript={openSheet} />}
      {state.kind === 'working' && (
        <Card key="working">
          <StageSteps current={state.stage} />
          <ProgressBar height={4} />
          {state.transcript && (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={3}>
              “{state.transcript}”
            </ThemedText>
          )}
        </Card>
      )}

      {recording && (
        <Animated.View entering={enter} exiting={exit} style={styles.recording}>
          <ThemedText type="label" themeColor="textSecondary">
            Listening
          </ThemedText>
          <LevelMeter levels={recorder.levels} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.timer}>
            {clock(recorder.elapsedSeconds)} / {clock(recorder.maxSeconds)}
          </ThemedText>
        </Animated.View>
      )}

      <View style={styles.controls} pointerEvents="box-none">
        <View style={styles.side}>
          {recording ? (
            <RoundButton label="Cancel recording" onPress={() => void recorder.cancel()}>
              <Icon ios="xmark" android="close" size={18} color={theme.text} />
            </RoundButton>
          ) : (
            <RoundButton label="Type tasks instead" disabled={busy} onPress={() => openSheet('Type your tasks')}>
              <Icon ios="keyboard" android="keyboard" size={20} color={theme.text} />
            </RoundButton>
          )}
        </View>
        <MicButton
          mode={busy ? 'busy' : recording ? 'recording' : 'idle'}
          level={level}
          onPress={() => {
            if (recording) void recorder.stop();
            else {
              if (state.kind === 'result' || state.kind === 'error') dismiss();
              void startRecording();
            }
          }}
        />
        <View style={styles.side} />
      </View>

      {sheet && (
        <TextCaptureSheet
          title={sheet.title}
          initialText={sheet.text}
          onCancel={() => setSheet(null)}
          onSubmit={(text) => {
            const captureId = sheet.captureId;
            setSheet(null);
            submitText(text, captureId);
          }}
        />
      )}
    </View>
  );
}

function Card({ children, alert }: { children: ReactNode; alert?: boolean }) {
  const theme = useTheme();
  return (
    <Animated.View
      entering={enter}
      exiting={exit}
      accessibilityRole={alert ? 'alert' : undefined}
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.border, boxShadow: theme.shadowFloat },
      ]}>
      {children}
    </Animated.View>
  );
}

function StageSteps({ current }: { current: CaptureStage }) {
  const theme = useTheme();
  const currentIndex = STAGES.findIndex((s) => s.stage === current);
  return (
    <View style={styles.steps}>
      {STAGES.map(({ stage, label, activeLabel }, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <View key={stage} style={styles.step}>
            {done ? (
              <Icon ios="checkmark.circle.fill" android="check_circle" size={16} color={theme.success} />
            ) : (
              <View style={[styles.stepDot, { backgroundColor: active ? theme.tint : theme.backgroundSelected }]} />
            )}
            <ThemedText type={active ? 'smallBold' : 'small'} themeColor={active || done ? 'text' : 'textSecondary'}>
              {active ? activeLabel : label}
            </ThemedText>
          </View>
        );
      })}
    </View>
  );
}

function RoundButton({
  label,
  onPress,
  disabled,
  children,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      scaleTo={0.9}
      style={[
        styles.round,
        { backgroundColor: theme.surface, borderColor: theme.border, boxShadow: theme.shadowCard },
        disabled && styles.disabled,
      ]}>
      {children}
    </PressableScale>
  );
}

function summarize(outcome: CaptureOutcome): string {
  const scheduled = outcome.tasks.filter((t) => t.scheduledStart !== null).length;
  const listOnly = outcome.tasks.filter((t) => t.scheduledStart === null && !t.unscheduledReason).length;
  const failed = outcome.tasks.length - scheduled - listOnly;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const parts = [];
  if (scheduled) parts.push(`Scheduled ${plural(scheduled, 'task')}`);
  if (listOnly) parts.push(`${listOnly} added to your list`);
  if (failed) parts.push(`${failed} couldn't be scheduled`);
  return parts.join(', ') || 'No tasks found';
}

function ResultCard({
  state,
  timeZone,
  onEditTranscript,
}: {
  state: Extract<CaptureState, { kind: 'result' }>;
  timeZone: string;
  onEditTranscript: (title: string, text: string, captureId: string | null) => void;
}) {
  const theme = useTheme();
  const { undo, dismiss } = useCapture();
  const now = useNow(1000);
  const { outcome } = state;
  const secondsLeft = Math.ceil((state.undoUntil - now) / 1000);
  const canUndo = outcome.tasks.length > 0 && secondsLeft > 0;
  const found = outcome.tasks.length > 0;

  return (
    <Card>
      <View style={styles.cardHeader}>
        <Icon
          ios={found ? 'checkmark.circle.fill' : 'questionmark.circle'}
          android={found ? 'check_circle' : 'help'}
          size={20}
          color={found ? theme.success : theme.textSecondary}
        />
        <ThemedText type="smallBold" style={styles.flex}>
          {summarize(outcome)}
        </ThemedText>
      </View>
      <ScrollView style={styles.resultList} contentContainerStyle={styles.resultListContent}>
        {outcome.tasks.map((task) => {
          const problem = task.scheduledStart === null && !!task.unscheduledReason;
          return (
            <View key={task.id} style={[styles.resultRow, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText numberOfLines={1} style={styles.resultTitle}>
                {task.title}
              </ThemedText>
              <ThemedText type="small" style={[styles.resultMeta, { color: problem ? theme.warning : theme.textSecondary }]}>
                {task.scheduledStart !== null && task.scheduledEnd !== null
                  ? `${formatSlot(task.scheduledStart, task.scheduledEnd, timeZone, now)} · ${describePlacementReason(task, timeZone, now)}`
                  : problem
                    ? describeUnscheduled(task, timeZone, now)
                    : `List only · ${formatDuration(task.durationMinutes)}`}
              </ThemedText>
            </View>
          );
        })}
        {!found && (
          <ThemedText type="small" themeColor="textSecondary">
            “{outcome.transcript}”
          </ThemedText>
        )}
        {outcome.unparsed.length > 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            Didn’t understand: {outcome.unparsed.join(' · ')}
          </ThemedText>
        )}
        {outcome.calendarError && (
          <ThemedText type="small" style={{ color: theme.danger }}>
            {describeError(outcome.calendarError)}
          </ThemedText>
        )}
      </ScrollView>
      <View style={styles.cardActions}>
        {!found && (
          <Button
            title="Edit transcript"
            size="compact"
            onPress={() => onEditTranscript('Edit transcript', outcome.transcript, outcome.captureId)}
          />
        )}
        {canUndo && (
          <Button
            title={`Undo · ${secondsLeft}`}
            size="compact"
            loading={state.undoing}
            onPress={() => undo().catch((e) => Alert.alert("Couldn't undo", describeError(toAppError(e))))}
          />
        )}
        <Button title="Done" size="compact" variant="primary" onPress={dismiss} />
      </View>
    </Card>
  );
}

function ErrorCard({
  state,
  onEditTranscript,
}: {
  state: Extract<CaptureState, { kind: 'error' }>;
  onEditTranscript: (title: string, text: string, captureId: string | null) => void;
}) {
  const theme = useTheme();
  const { retry, dismiss } = useCapture();
  const { markCalendarDisconnected } = useSettings();
  const { error } = state;

  return (
    <Card alert>
      <View style={styles.cardHeader}>
        <Icon ios="exclamationmark.triangle.fill" android="warning" size={18} color={theme.danger} />
        <ThemedText type="smallBold" style={styles.flex}>
          {describeError(error)}
        </ThemedText>
      </View>
      {state.transcript && (
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={3}>
          “{state.transcript}”
        </ThemedText>
      )}
      <View style={styles.cardActions}>
        <Button title="Dismiss" size="compact" variant="plain" onPress={dismiss} />
        {error.code === 'mic_denied' && (
          <Button title="Open Settings" size="compact" variant="primary" onPress={() => void Linking.openSettings()} />
        )}
        {error.code === 'calendar_disconnected' && (
          <Button title="Reconnect" size="compact" variant="primary" onPress={markCalendarDisconnected} />
        )}
        {state.transcript && (
          <Button
            title="Edit"
            size="compact"
            onPress={() => onEditTranscript('Edit transcript', state.transcript ?? '', state.captureId)}
          />
        )}
        {state.retry && <Button title="Retry" size="compact" variant="primary" onPress={retry} />}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.three, paddingHorizontal: Spacing.three },
  card: {
    borderRadius: Radius.large + 2,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.two + 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
  steps: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  step: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepDot: { width: 8, height: 8, borderRadius: 4, marginHorizontal: 4 },
  resultList: { maxHeight: 232 },
  resultListContent: { gap: 6 },
  resultRow: { borderRadius: Radius.small + 2, borderCurve: 'continuous', paddingHorizontal: 12, paddingVertical: 8, gap: 1 },
  resultTitle: { fontSize: 15, lineHeight: 20, fontWeight: 500 },
  resultMeta: { fontSize: 13, lineHeight: 18 },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: Spacing.two },
  recording: { alignItems: 'center', gap: Spacing.one },
  timer: { fontVariant: ['tabular-nums'] },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.five },
  side: { width: 48, alignItems: 'center' },
  round: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.45 },
});
