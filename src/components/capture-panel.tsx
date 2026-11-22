import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { LevelMeter } from '@/components/level-meter';
import { MicButton } from '@/components/mic-button';
import { TextCaptureSheet } from '@/components/text-capture-sheet';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { describeError, toAppError } from '@/lib/errors';
import { formatSlot } from '@/lib/time';
import { useCapture, type CaptureState } from '@/features/capture/capture-provider';
import type { CaptureOutcome } from '@/features/capture/run-capture';
import { describePlacementReason, describeUnscheduled, formatDuration } from '@/features/tasks/present';
import { useSettings } from '@/providers/settings-provider';

const STAGE_LABEL = { transcribing: 'Transcribing…', planning: 'Planning…', booking: 'Booking…' } as const;

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/** Bottom-of-screen capture UI: mic, live recording, progress, result with Undo, or error with Retry. */
export function CapturePanel({ timeZone }: { timeZone: string }) {
  const theme = useTheme();
  const { state, recorder, startRecording, submitText, dismiss } = useCapture();
  const [sheet, setSheet] = useState<{ title: string; text: string; captureId: string | null } | null>(null);

  const recording = recorder.phase === 'recording' || recorder.phase === 'stopping';
  const busy = state.kind === 'working' || recorder.phase === 'starting' || recorder.phase === 'stopping';

  const openSheet = (title: string, text = '', captureId: string | null = null) => setSheet({ title, text, captureId });

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {state.kind === 'result' && !recording && (
        <ResultCard state={state} timeZone={timeZone} onEditTranscript={openSheet} />
      )}
      {state.kind === 'error' && !recording && <ErrorCard state={state} onEditTranscript={openSheet} />}
      {state.kind === 'working' && (
        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold">{STAGE_LABEL[state.stage]}</ThemedText>
          {state.transcript && (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={3}>
              “{state.transcript}”
            </ThemedText>
          )}
        </View>
      )}

      {recording && (
        <View style={styles.recording}>
          <LevelMeter levels={recorder.levels} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.timer}>
            {clock(recorder.elapsedSeconds)} / {clock(recorder.maxSeconds)}
          </ThemedText>
        </View>
      )}

      <View style={styles.controls}>
        <View style={styles.side}>
          {recording ? (
            <RoundButton label="Cancel recording" onPress={() => void recorder.cancel()}>
              <Icon ios="xmark" android="close" color={theme.text} />
            </RoundButton>
          ) : (
            <RoundButton label="Type tasks instead" disabled={busy} onPress={() => openSheet('Type your tasks')}>
              <Icon ios="keyboard" android="keyboard" color={theme.text} />
            </RoundButton>
          )}
        </View>
        <MicButton
          mode={busy ? 'busy' : recording ? 'recording' : 'idle'}
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
          visible
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

function RoundButton({
  label,
  onPress,
  disabled,
  children,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.round,
        { backgroundColor: theme.backgroundElement },
        (pressed || disabled) && { opacity: 0.5 },
      ]}>
      {children}
    </Pressable>
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

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="smallBold">{summarize(outcome)}</ThemedText>
      <ScrollView style={styles.resultList} contentContainerStyle={styles.resultListContent}>
        {outcome.tasks.map((task) => (
          <View key={task.id} style={styles.resultRow}>
            <ThemedText numberOfLines={1} style={styles.resultTitle}>
              {task.title}
            </ThemedText>
            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={task.unscheduledReason && task.scheduledStart === null && { color: theme.danger }}>
              {task.scheduledStart !== null && task.scheduledEnd !== null
                ? `${formatSlot(task.scheduledStart, task.scheduledEnd, timeZone, now)} · ${describePlacementReason(task, timeZone, now)}`
                : task.unscheduledReason
                  ? describeUnscheduled(task, timeZone, now)
                  : `List only · ${formatDuration(task.durationMinutes)}`}
            </ThemedText>
          </View>
        ))}
        {outcome.tasks.length === 0 && (
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
        {outcome.tasks.length === 0 && (
          <Button
            title="Edit transcript"
            onPress={() => onEditTranscript('Edit transcript', outcome.transcript, outcome.captureId)}
          />
        )}
        {canUndo && (
          <Button
            title={`Undo (${secondsLeft})`}
            loading={state.undoing}
            onPress={() =>
              undo().catch((e) => Alert.alert("Couldn't undo", describeError(toAppError(e))))
            }
          />
        )}
        <Button title="Done" variant="primary" onPress={dismiss} />
      </View>
    </View>
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
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]} accessibilityRole="alert">
      <ThemedText type="smallBold" style={{ color: theme.danger }}>
        {describeError(error)}
      </ThemedText>
      {state.transcript && (
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={3}>
          “{state.transcript}”
        </ThemedText>
      )}
      <View style={styles.cardActions}>
        <Button title="Dismiss" variant="plain" onPress={dismiss} />
        {error.code === 'mic_denied' && (
          <Button title="Open Settings" variant="primary" onPress={() => void Linking.openSettings()} />
        )}
        {error.code === 'calendar_disconnected' && (
          <Button title="Reconnect" variant="primary" onPress={markCalendarDisconnected} />
        )}
        {state.transcript && (
          <Button
            title="Edit"
            onPress={() => onEditTranscript('Edit transcript', state.transcript ?? '', state.captureId)}
          />
        )}
        {state.retry && (
          <Button title="Retry" variant="primary" onPress={retry} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.three, paddingHorizontal: Spacing.three },
  card: { borderRadius: 20, padding: Spacing.three, gap: Spacing.two },
  resultList: { maxHeight: 220 },
  resultListContent: { gap: Spacing.two },
  resultRow: { gap: 1 },
  resultTitle: { fontSize: 15, lineHeight: 20 },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: Spacing.two },
  recording: { alignItems: 'center', gap: Spacing.one },
  timer: { fontVariant: ['tabular-nums'] },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.five },
  side: { width: 48, alignItems: 'center' },
  round: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
