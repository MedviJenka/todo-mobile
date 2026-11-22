// POST application/json GoogleTokenRequest
//   connect { refreshToken } → 200 GoogleAccessToken   (stores the refresh token first)
//   refresh                  → 200 GoogleAccessToken   | 409 google_disconnected
//   revoke                   → 200 { revoked }
// Google only hands out Calendar refresh tokens to the Web client, and refreshing needs its
// client secret, so that one step runs here. Calendar data itself never passes through: the
// device calls the Calendar API directly with the access token this returns.
import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';

import { apiError, json, log, rejectIfNotAllowed } from '../_shared/http.ts';
import {
  GoogleTokenRequest,
  type GoogleAccessToken,
  type GoogleRevokeResponse,
} from '../_shared/task-schema.ts';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

type Exchange =
  | { ok: true; token: GoogleAccessToken }
  | { ok: false; /** Google says the grant is gone (revoked, expired, or scopes removed). */ revoked: boolean };

async function exchange(refreshToken: string): Promise<Exchange> {
  // Same Web client ID the app config uses, so one name covers .env, EAS and function secrets.
  const clientId = Deno.env.get('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET is not set');

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const body = (await response.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
  } | null;

  if (response.ok && body?.access_token) {
    return {
      ok: true,
      token: {
        accessToken: body.access_token,
        expiresIn: body.expires_in ?? 3600,
        scopes: body.scope?.split(' ').filter(Boolean) ?? [],
      },
    };
  }
  log('google-token', 'refresh_failed', { status: response.status, error: body?.error ?? null });
  return { ok: false, revoked: body?.error === 'invalid_grant' };
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return apiError('bad_request', 'Use POST.', 405);

    const denied = rejectIfNotAllowed(ctx);
    if (denied) return denied;

    const parsed = GoogleTokenRequest.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return apiError('bad_request', 'Invalid request.');
    const request = parsed.data;

    // RLS scopes every query to the caller's own row.
    const tokens = () => ctx.supabase.from('google_tokens');

    if (request.action === 'connect') {
      // user_id defaults to auth.uid(), so the upsert hits the caller's row.
      const { error } = await tokens().upsert({ refresh_token: request.refreshToken }, { onConflict: 'user_id' });
      if (error) {
        log('google-token', 'store_failed', { code: error.code ?? null });
        return apiError('internal', 'Could not save Google access.');
      }
    }

    const { data: row, error } = await tokens().select('user_id, refresh_token').maybeSingle();
    if (error) {
      log('google-token', 'read_failed', { code: error.code ?? null });
      return apiError('internal', 'Could not read Google access.');
    }

    if (request.action === 'revoke') {
      if (!row) return json<GoogleRevokeResponse>({ revoked: false });
      // Best effort: the row goes either way, so a failed revoke never leaves a usable token here.
      const revoked = await fetch(REVOKE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: row.refresh_token }),
      })
        .then((r) => r.ok)
        .catch(() => false);
      await tokens().delete().eq('user_id', row.user_id);
      log('google-token', 'revoked', { ok: revoked });
      return json<GoogleRevokeResponse>({ revoked });
    }

    if (!row) return apiError('google_disconnected', 'Connect Google Calendar to continue.');

    let result: Exchange;
    try {
      result = await exchange(row.refresh_token);
    } catch (e) {
      log('google-token', 'config_error', { message: e instanceof Error ? e.message : 'unknown' });
      return apiError('internal', 'Google access is not configured on the server.');
    }

    if (result.ok) return json<GoogleAccessToken>(result.token);
    if (result.revoked) {
      await tokens().delete().eq('user_id', row.user_id);
      return apiError('google_disconnected', 'Google Calendar access was removed. Reconnect your calendar.');
    }
    return apiError('upstream_error', 'Google did not respond. Try again.');
  }),
};
