import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { File } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';

import { MAX_RECORDING_SECONDS } from '@/schemas/ai-schema';
import { AppError } from '@/lib/errors';

/**
 * m4a/AAC, mono, ~64 kbps (≈0.5 MB/min). Never LOW_QUALITY: on Android it records 3gp/AMR,
 * which OpenAI rejects.
 */
const RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 64_000,
  isMeteringEnabled: true,
};

const POLL_MS = 100;
const METER_FLOOR_DB = -60;
const LEVEL_HISTORY = 32;

export type Recording = { uri: string; durationSeconds: number };
export type RecorderPhase = 'idle' | 'starting' | 'recording' | 'stopping';

/** Deletes a recording from the cache. Best effort. */
export function deleteRecording(uri: string) {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // The OS clears the cache eventually anyway.
  }
}

/**
 * Mic capture: permission, audio mode, record ≤180 s, level meter, stop → file URI.
 * `onFinished` also fires when recording ends by itself (time limit, phone call, headphones
 * unplugged), so whatever was captured still gets processed.
 */
export function useVoiceCapture(onFinished: (recording: Recording) => void) {
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const [phase, setPhase] = useState<RecorderPhase>('idle');
  const [levels, setLevels] = useState<number[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const finishing = useRef(false);
  const onFinishedRef = useRef(onFinished);

  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  const finish = useCallback(
    async (discard: boolean) => {
      // Stop and auto-stop can race. Only the first one processes the file.
      if (finishing.current) return;
      finishing.current = true;
      setPhase('stopping');
      const durationSeconds = recorder.getStatus().durationMillis / 1000;
      try {
        await recorder.stop();
      } catch {
        // Already stopped (time limit or interruption).
      }
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      setPhase('idle');
      setLevels([]);
      setElapsedSeconds(0);
      finishing.current = false;

      const uri = recorder.uri;
      if (!uri) return;
      if (discard || durationSeconds < 0.5) {
        deleteRecording(uri);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      onFinishedRef.current({ uri, durationSeconds });
    },
    [recorder]
  );

  // While recording, poll the recorder for the meter and timer, and notice when it stopped
  // without the user tapping stop (time limit, call, audio route change).
  useEffect(() => {
    if (phase !== 'recording') return;
    let sawRecording = false;
    const timer = setInterval(() => {
      const status = recorder.getStatus();
      if (status.isRecording) {
        sawRecording = true;
        setElapsedSeconds(Math.floor(status.durationMillis / 1000));
        if (status.metering !== undefined) {
          const level = Math.min(1, Math.max(0, (status.metering - METER_FLOOR_DB) / -METER_FLOOR_DB));
          setLevels((previous) => [...previous.slice(-(LEVEL_HISTORY - 1)), level]);
        }
      } else if (sawRecording) {
        clearInterval(timer);
        void finish(false);
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [phase, recorder, finish]);

  async function start() {
    if (phase !== 'idle') return;
    setPhase('starting');
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        throw new AppError('mic_denied', 'Microphone access is off.', { canAskAgain: permission.canAskAgain });
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        // Exclusive focus, so a phone call interrupts us (and we then process what we have).
        interruptionMode: 'doNotMix',
      });
      // Prepare every time: it also recovers from an iOS media-services reset.
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: MAX_RECORDING_SECONDS });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
      setPhase('recording');
    } catch (error) {
      setPhase('idle');
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      throw error;
    }
  }

  return {
    phase,
    levels,
    elapsedSeconds,
    maxSeconds: MAX_RECORDING_SECONDS,
    start,
    stop: () => (phase === 'recording' ? finish(false) : Promise.resolve()),
    cancel: () => (phase === 'recording' ? finish(true) : Promise.resolve()),
  };
}
