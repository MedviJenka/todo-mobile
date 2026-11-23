import type { SupabaseContext } from '@supabase/server';

import type { ApiErrorBody, ApiErrorCode } from './task-schema.ts';

const STATUS: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  bad_request: 400,
  payload_too_large: 413,
  unsupported_media_type: 415,
  rate_limited: 429,
  no_speech: 422,
  model_refused: 502,
  model_incomplete: 502,
  upstream_error: 502,
  internal: 500,
  google_disconnected: 409,
};

export function json<T>(body: T, status = 200): Response {
  return Response.json(body, { status });
}

export function apiError(error: ApiErrorCode, message: string, status = STATUS[error]): Response {
  return json<ApiErrorBody>({ error, message }, status);
}

/**
 * Structured log line. NEVER pass transcript or task text here: only sizes, counts and timings.
 */
export function log(fn: string, event: string, fields: Record<string, number | string | boolean | null> = {}) {
  console.log(JSON.stringify({ fn, event, ...fields }));
}

/** Verified user JWTs only: Supabase Auth issues user access tokens with `aud: authenticated`. */
export const USER_AUTH = { auth: 'user', audience: 'authenticated' } as const;

/**
 * Personal-app guard: only ALLOWED_EMAILS accounts may spend OpenAI credits. Unset fails closed;
 * `ALLOWED_EMAILS=*` opts in to every signed-in user.
 */
export function rejectIfNotAllowed(ctx: SupabaseContext): Response | null {
  const allowed = (Deno.env.get('ALLOWED_EMAILS') ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) {
    log('auth', 'allowlist_missing');
    return apiError('forbidden', 'The server has no ALLOWED_EMAILS configured.');
  }
  if (allowed.includes('*')) return null;

  // The email claim proves mailbox ownership only for accounts Google created: an email/password
  // signup can claim any address that has no account yet. app_metadata is set by Supabase Auth.
  const provider = ctx.userClaims?.appMetadata?.provider;
  const email = ctx.userClaims?.email?.toLowerCase();
  if (provider !== 'google' || !email || !allowed.includes(email)) {
    return apiError('forbidden', 'This account is not allowed to use Voice To-Do.');
  }
  return null;
}

export type QuotaKind = 'transcribe' | 'extract';

/**
 * Per-user daily cap on OpenAI calls of one kind (cost guard). Call it right before spending:
 * it records the call in `ai_usage`, a table users can't write, even if the call then fails.
 */
export async function claimQuota(ctx: SupabaseContext, kind: QuotaKind): Promise<Response | null> {
  const configured = Number(Deno.env.get('MAX_CAPTURES_PER_DAY') || 50);
  const cap = Number.isInteger(configured) && configured >= 0 ? configured : 50;
  const userId = ctx.userClaims?.id;
  if (!userId) return apiError('unauthorized', 'Please sign in again.');

  const { data, error } = await ctx.supabaseAdmin.rpc('consume_ai_quota', {
    p_user_id: userId,
    p_kind: kind,
    p_cap: cap,
  });
  if (error) {
    log('rate-limit', 'claim_failed', { code: error.code ?? null });
    return apiError('internal', 'Could not check usage limits.');
  }
  if (data !== true) {
    const what = kind === 'transcribe' ? 'recordings' : 'task extractions';
    return apiError('rate_limited', `Daily limit of ${cap} ${what} reached. Try again tomorrow.`);
  }
  return null;
}

/**
 * The request body (re-wrapped for `formData()`/`json()`), or null once it passes `maxBytes`.
 * Counts bytes as they arrive, so a chunked upload without Content-Length can't buffer unbounded.
 */
export async function readBody(req: Request, maxBytes: number): Promise<Response | null> {
  if (Number(req.headers.get('content-length') ?? 0) > maxBytes) return null;
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  if (req.body) {
    let size = 0;
    const reader = req.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  }
  // Header, not Blob.type: Blob lowercases its type, which would break a multipart boundary.
  return new Response(new Blob(chunks), { headers: { 'content-type': req.headers.get('content-type') ?? '' } });
}
