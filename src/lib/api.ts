/**
 * Calls to our Edge Functions. Plain fetch with the user's JWT: it handles multipart uploads
 * (React Native FormData with a file URI), and every error maps to an AppError code.
 */
import { File } from 'expo-file-system';
import type { z } from 'zod';

import {
  ApiErrorBody,
  ExtractTasksResponse,
  GoogleAccessToken,
  GoogleRevokeResponse,
  TranscribeResponse,
  type ApiErrorCode,
  type ExtractTasksRequest,
  type GoogleTokenRequest,
} from '@/schemas/ai-schema';
import { AppError, type AppErrorCode } from '@/lib/errors';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from '@/lib/supabase';

const TIMEOUT_MS = 60_000;

const CODE_MAP: Record<ApiErrorCode, AppErrorCode> = {
  unauthorized: 'not_signed_in',
  forbidden: 'forbidden',
  bad_request: 'server_error',
  payload_too_large: 'too_large',
  unsupported_media_type: 'server_error',
  rate_limited: 'rate_limited',
  no_speech: 'no_speech',
  model_refused: 'model_error',
  model_incomplete: 'model_error',
  upstream_error: 'server_error',
  internal: 'server_error',
  google_disconnected: 'calendar_disconnected',
};

async function callFunction<T>(
  name: 'transcribe' | 'extract-tasks' | 'google-token',
  body: BodyInit,
  schema: z.ZodType<T>,
  headers: Record<string, string> = {}
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new AppError('not_signed_in', 'Please sign in again.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        apikey: SUPABASE_PUBLISHABLE_KEY,
        ...headers,
      },
      body,
      signal: controller.signal,
    });
  } catch (cause) {
    if (__DEV__) console.warn(`[api] ${name} fetch failed`, cause);
    const detail = __DEV__ ? ` [${cause instanceof Error ? cause.message : String(cause)}]` : '';
    throw new AppError(
      'offline',
      controller.signal.aborted
        ? `The server took too long to respond (${name}).${detail}`
        : `Couldn't reach the server (${name}).${detail}`
    );
  } finally {
    clearTimeout(timer);
  }

  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = ApiErrorBody.safeParse(json);
    if (error.success) {
      throw new AppError(CODE_MAP[error.data.error], error.data.message, { status: response.status });
    }
    const code: AppErrorCode = response.status === 401 ? 'not_signed_in' : 'server_error';
    throw new AppError(code, `Server error (${response.status}).`, { status: response.status });
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new AppError('server_error', 'Unexpected response from the server.');
  return parsed.data;
}

/** Uploads the recording (m4a) and returns its transcript. */
export function transcribeAudio(uri: string, durationSeconds: number, languages: string[]) {
  const form = new FormData();
  // Expo's global fetch rejects React Native's { uri, name, type } parts ("Unsupported
  // FormDataPart implementation"). It reads an expo-file-system File instead, using the file's
  // own name (the recorder writes .m4a), which the server checks the extension of.
  form.append('audio', new File(uri) as unknown as Blob);
  form.append('durationSeconds', durationSeconds.toFixed(1));
  if (languages.length > 0) form.append('languages', languages.join(','));
  return callFunction('transcribe', form, TranscribeResponse);
}

export function extractTasks(request: ExtractTasksRequest) {
  return callFunction('extract-tasks', JSON.stringify(request), ExtractTasksResponse, {
    'Content-Type': 'application/json',
  });
}

const json = { 'Content-Type': 'application/json' };

/** Store a refresh token ('connect') or mint an access token from the stored one ('refresh'). */
export function googleAccessToken(request: Exclude<GoogleTokenRequest, { action: 'revoke' }>) {
  return callFunction('google-token', JSON.stringify(request), GoogleAccessToken, json);
}

export function revokeGoogleToken() {
  return callFunction('google-token', JSON.stringify({ action: 'revoke' }), GoogleRevokeResponse, json);
}
