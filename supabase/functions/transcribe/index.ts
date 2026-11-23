// POST multipart/form-data { audio: File, languages?: "en,de", durationSeconds?: "31.4" }
//   → 200 { captureId, transcript }
// Speech-to-text only. Extraction is a separate call (extract-tasks), so the transcript can be
// fixed and re-run without uploading audio again.
import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';

import { apiError, claimQuota, json, log, readBody, rejectIfNotAllowed, USER_AUTH } from '../_shared/http.ts';
import { openai, sttModel } from '../_shared/openai.ts';
import { MAX_AUDIO_BYTES, MAX_RECORDING_SECONDS, type TranscribeResponse } from '../_shared/task-schema.ts';

const AUDIO_EXTENSIONS = new Set(['m4a', 'mp4', 'mp3', 'mpeg', 'mpga', 'wav', 'webm', 'ogg', 'flac']);
// Multipart framing adds a little on top of the file itself.
const MAX_BODY_BYTES = MAX_AUDIO_BYTES + 64 * 1024;
const TOO_LARGE = `Recording is too large (max ${MAX_AUDIO_BYTES / (1024 * 1024)} MB).`;

function parseLanguages(value: FormDataEntryValue | null): string[] {
  if (typeof value !== 'string') return [];
  return [...new Set(value.split(',').map((l) => l.trim().toLowerCase()))]
    .filter((l) => /^[a-z]{2}$/.test(l))
    .slice(0, 5);
}

function parseSeconds(value: FormDataEntryValue | null): number | null {
  const seconds = typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds, MAX_RECORDING_SECONDS + 5) : null;
}

export default {
  fetch: withSupabase(USER_AUTH, async (req, ctx) => {
    if (req.method !== 'POST') return apiError('bad_request', 'Use POST.', 405);

    const denied = rejectIfNotAllowed(ctx);
    if (denied) return denied;

    const body = await readBody(req, MAX_BODY_BYTES);
    if (!body) return apiError('payload_too_large', TOO_LARGE);

    let form: FormData;
    try {
      form = await body.formData();
    } catch {
      return apiError('bad_request', 'Expected multipart/form-data with an "audio" file.');
    }

    const audio = form.get('audio');
    if (!(audio instanceof File)) return apiError('bad_request', 'Missing "audio" file.');
    if (audio.size === 0) return apiError('no_speech', 'The recording was empty.');
    if (audio.size > MAX_AUDIO_BYTES) return apiError('payload_too_large', TOO_LARGE);

    const extension = audio.name.split('.').pop()?.toLowerCase() ?? '';
    if (!AUDIO_EXTENSIONS.has(extension)) {
      return apiError('unsupported_media_type', `Unsupported audio format ".${extension}".`);
    }

    // Counted before the call: OpenAI bills silent or failed transcriptions too.
    const capped = await claimQuota(ctx, 'transcribe');
    if (capped) return capped;

    const model = sttModel();
    const languages = parseLanguages(form.get('languages'));
    const audioSeconds = parseSeconds(form.get('durationSeconds'));
    const started = Date.now();

    let transcript: string;
    try {
      const result = await openai().audio.transcriptions.create({
        file: audio,
        model,
        response_format: 'json',
        // `languages` (several hints) is a gpt-transcribe feature. Older models take one `language`.
        ...(model.startsWith('gpt-transcribe')
          ? languages.length > 0 && { languages }
          : languages.length === 1 && { language: languages[0] }),
      });
      transcript = result.text.trim();
    } catch (error) {
      const status = (error as { status?: number }).status ?? null;
      log('transcribe', 'openai_failed', { status, ms: Date.now() - started, bytes: audio.size });
      return apiError('upstream_error', 'Transcription failed. Please try again.');
    }

    if (!transcript) {
      log('transcribe', 'no_speech', { ms: Date.now() - started, bytes: audio.size });
      return apiError('no_speech', "Didn't catch any speech. Try again a little closer to the mic.");
    }

    const { data, error } = await ctx.supabase
      .from('captures')
      .insert({ transcript, audio_seconds: audioSeconds })
      .select('id')
      .single();
    if (error || !data) {
      log('transcribe', 'insert_failed', { code: error?.code ?? null });
      return apiError('internal', 'Could not save the transcript.');
    }

    log('transcribe', 'ok', {
      ms: Date.now() - started,
      bytes: audio.size,
      audioSeconds,
      chars: transcript.length,
      languages: languages.length,
    });
    return json<TranscribeResponse>({ captureId: data.id, transcript });
  }),
};
