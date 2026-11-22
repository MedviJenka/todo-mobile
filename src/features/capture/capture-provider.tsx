/**
 * Capture flow state: idle → recording → working (transcribing / planning / booking) →
 * result (with Undo) or error (with Retry). It lives above the route guard, so a "reconnect
 * calendar" detour doesn't lose a pending retry.
 */
import { createContext, use, useCallback, useState, type PropsWithChildren } from 'react';

import { AppError, toAppError } from '@/lib/errors';
import { useSettings } from '@/providers/settings-provider';
import { useTasks } from '@/providers/tasks-provider';
import { runCapture, type CaptureOutcome, type CaptureSource, type CaptureStage } from './run-capture';
import { deleteRecording, useVoiceCapture, type Recording } from './use-voice-capture';

export const UNDO_WINDOW_MS = 10_000;

export type CaptureState =
  | { kind: 'idle' }
  | { kind: 'working'; stage: CaptureStage; transcript: string | null }
  | { kind: 'result'; outcome: CaptureOutcome; undoUntil: number; undoing: boolean }
  | {
      kind: 'error';
      error: AppError;
      /** What Retry will run: the furthest completed step, so audio isn't uploaded twice. */
      retry: CaptureSource | null;
      transcript: string | null;
      captureId: string | null;
    };

/** Errors where running the same input again won't help. */
const FINAL_ERRORS = new Set(['no_speech', 'too_large', 'forbidden', 'mic_denied']);

type CaptureContextValue = {
  state: CaptureState;
  recorder: ReturnType<typeof useVoiceCapture>;
  startRecording: () => Promise<void>;
  submitText: (text: string, captureId?: string | null) => void;
  retry: () => void;
  undo: () => Promise<void>;
  dismiss: () => void;
};

const CaptureContext = createContext<CaptureContextValue | null>(null);

export function CaptureProvider({ children }: PropsWithChildren) {
  const { settings, setAppCalendarId } = useSettings();
  const { addTasks, forgetTasks } = useTasks();
  const [state, setState] = useState<CaptureState>({ kind: 'idle' });

  const process = useCallback(
    async (source: CaptureSource) => {
      if (!settings) return;
      let captureId = source.kind === 'text' ? source.captureId : null;
      let transcript = source.kind === 'text' ? source.text : null;
      setState({ kind: 'working', stage: source.kind === 'audio' ? 'transcribing' : 'planning', transcript });

      try {
        const outcome = await runCapture(source, settings, {
          onStage: (stage) => setState({ kind: 'working', stage, transcript }),
          onTranscript: (id, text) => {
            captureId = id;
            transcript = text;
          },
          onAppCalendarChanged: setAppCalendarId,
        });
        addTasks(outcome.tasks);
        setState({ kind: 'result', outcome, undoUntil: Date.now() + UNDO_WINDOW_MS, undoing: false });
      } catch (e) {
        const error = toAppError(e);
        let retry: CaptureSource | null =
          transcript !== null ? { kind: 'text', text: transcript, captureId } : source;
        if (FINAL_ERRORS.has(error.code)) {
          if (source.kind === 'audio') deleteRecording(source.uri);
          retry = null;
        }
        setState({ kind: 'error', error, retry, transcript, captureId });
      }
    },
    [settings, setAppCalendarId, addTasks]
  );

  const onRecordingFinished = useCallback(
    (recording: Recording) => {
      void process({ kind: 'audio', ...recording });
    },
    [process]
  );
  const recorder = useVoiceCapture(onRecordingFinished);

  const startRecording = async () => {
    try {
      setState({ kind: 'idle' });
      await recorder.start();
    } catch (e) {
      setState({ kind: 'error', error: toAppError(e), retry: null, transcript: null, captureId: null });
    }
  };

  const submitText = (text: string, captureId: string | null = null) => {
    if (text.trim()) void process({ kind: 'text', text: text.trim(), captureId });
  };

  const retry = () => {
    if (state.kind === 'error' && state.retry) void process(state.retry);
  };

  const undo = async () => {
    if (state.kind !== 'result') return;
    const { outcome } = state;
    setState({ ...state, undoing: true });
    try {
      await outcome.undo();
      forgetTasks(outcome.tasks.map((t) => t.id));
      setState({ kind: 'idle' });
    } catch (e) {
      setState({ ...state, undoing: false });
      throw e;
    }
  };

  const dismiss = () => {
    if (state.kind === 'error' && state.retry?.kind === 'audio') deleteRecording(state.retry.uri);
    setState({ kind: 'idle' });
  };

  return (
    <CaptureContext value={{ state, recorder, startRecording, submitText, retry, undo, dismiss }}>
      {children}
    </CaptureContext>
  );
}

export function useCapture(): CaptureContextValue {
  const value = use(CaptureContext);
  if (!value) throw new Error('useCapture must be used inside <CaptureProvider>');
  return value;
}
