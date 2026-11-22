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

/** Personal-app guard: when ALLOWED_EMAILS is set, only those accounts may spend OpenAI credits. */
export function rejectIfNotAllowed(ctx: SupabaseContext): Response | null {
  const allowed = (Deno.env.get('ALLOWED_EMAILS') ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return null;

  const email = ctx.userClaims?.email?.toLowerCase();
  if (!email || !allowed.includes(email)) {
    return apiError('forbidden', 'This account is not allowed to use Voice To-Do.');
  }
  return null;
}

/** Per-user daily cap on new captures (cost guard). Counts through the RLS-scoped client. */
export async function rejectIfOverDailyCap(ctx: SupabaseContext): Promise<Response | null> {
  const cap = Number(Deno.env.get('MAX_CAPTURES_PER_DAY') ?? 50);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await ctx.supabase
    .from('captures')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since);

  if (error) {
    log('rate-limit', 'count_failed', { code: error.code ?? null });
    return apiError('internal', 'Could not check usage limits.');
  }
  if ((count ?? 0) >= cap) {
    return apiError('rate_limited', `Daily limit of ${cap} captures reached. Try again tomorrow.`);
  }
  return null;
}
