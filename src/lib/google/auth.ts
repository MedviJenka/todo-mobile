/**
 * Google sign-in and Calendar access through Supabase's browser OAuth (same flow as Speach).
 * Only the Web OAuth client is involved: no native Google SDK, no iOS client ID.
 *
 * - Sign-in: Google → Supabase → back to the app with ?code=, exchanged for a Supabase session.
 * - Connect calendar: the same flow with the Calendar scopes and offline access. The resulting
 *   refresh token goes to the google-token Edge Function, which holds it and mints short-lived
 *   access tokens (refreshing needs the client secret, so it can't happen on the device).
 */
import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { googleAccessToken, revokeGoogleToken } from '@/lib/api';
import { AppError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

/** Least privilege (D3): the app's own calendar, plus busy/free only for everything else. */
export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.app.created',
  'https://www.googleapis.com/auth/calendar.freebusy',
];

// Supabase rejects redirect URLs whose host is a bare IP, which is what Expo Go uses on a LAN
// (exp://10.0.0.4:8081/--/). nip.io is public DNS that maps 10.0.0.4.nip.io back to 10.0.0.4,
// so the URL still points at this Metro server but passes the allow list (exp://**).
function withHostname(url: string) {
  return url.replace(/^(exp:\/\/)(\d{1,3}(?:\.\d{1,3}){3})(?=[:/])/, '$1$2.nip.io');
}

/** Runs the browser OAuth round trip. Returns null if the user backs out. */
async function browserOAuth(calendar: boolean): Promise<Session | null> {
  const redirectTo = withHostname(Linking.createURL('/'));
  // Must match Supabase → Auth → URL Configuration → Redirect URLs, else Supabase falls back to the Site URL.
  if (__DEV__) console.log('Google redirectTo:', redirectTo);

  const currentEmail = calendar ? (await supabase.auth.getSession()).data.session?.user.email : undefined;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      ...(calendar && {
        scopes: CALENDAR_SCOPES.join(' '),
        queryParams: {
          // offline + consent makes Google return a refresh token every time.
          access_type: 'offline',
          prompt: 'consent',
          include_granted_scopes: 'true',
          // Keep the calendar on the account that's already signed in.
          ...(currentEmail && { login_hint: currentEmail }),
        },
      }),
    },
  });
  if (error) throw new AppError('server_error', `Google sign-in failed: ${error.message}`);

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return null; // user closed the browser

  const { queryParams } = Linking.parse(result.url);
  if (queryParams?.error === 'access_denied') return null; // user pressed Cancel on Google's page
  const failure = queryParams?.error_description ?? queryParams?.error;
  if (failure) throw new AppError('google_error', String(failure));
  if (typeof queryParams?.code !== 'string') {
    throw new AppError('google_error', 'Google sign-in did not return a code.');
  }

  const exchange = await supabase.auth.exchangeCodeForSession(queryParams.code);
  if (exchange.error) throw new AppError('server_error', `Supabase sign-in failed: ${exchange.error.message}`);
  return exchange.data.session;
}

/** Interactive sign-in. Returns false if the user backs out. */
export async function signInWithGoogle(): Promise<boolean> {
  return (await browserOAuth(false)) !== null;
}

// ---------------------------------------------------------------------------------------------
// Calendar access tokens: cached in memory per user, minted by the google-token function.
// ---------------------------------------------------------------------------------------------
type Cached = { userId: string; token: string; expiresAt: number };
let cached: Cached | null = null;
let inflight: Promise<string> | null = null;

async function currentUserId(): Promise<string> {
  const userId = (await supabase.auth.getSession()).data.session?.user.id;
  if (!userId) throw new AppError('not_signed_in', 'Please sign in again.');
  return userId;
}

function remember(userId: string, token: { accessToken: string; expiresIn: number }): string {
  cached = { userId, token: token.accessToken, expiresAt: Date.now() + token.expiresIn * 1000 };
  return token.accessToken;
}

/** The "Connect calendar" step. Shows Google's consent screen. */
export async function requestCalendarAccess(): Promise<void> {
  const session = await browserOAuth(true);
  if (!session) throw new AppError('cancelled', 'Calendar access was not granted.');
  const refreshToken = session.provider_refresh_token;
  if (!refreshToken) throw new AppError('google_error', "Google didn't grant offline access. Try again.");
  const token = await googleAccessToken({ action: 'connect', refreshToken });
  // Google shows each Calendar permission as a checkbox that starts unticked. Continuing without
  // ticking them grants sign-in only, and every Calendar call would then fail with 403.
  if (!CALENDAR_SCOPES.every((scope) => token.scopes.includes(scope))) {
    throw new AppError(
      'google_error',
      'Google Calendar access wasn’t granted. Tap Connect again and tick both Calendar boxes on Google’s screen.'
    );
  }
  remember(session.user.id, token);
}

/** A Calendar API access token. Throws `calendar_disconnected` when the user must reconnect. */
export async function getAccessToken(): Promise<string> {
  const userId = await currentUserId();
  // Refresh a minute early so a token never expires mid-request.
  if (cached?.userId === userId && cached.expiresAt - 60_000 > Date.now()) return cached.token;
  inflight ??= googleAccessToken({ action: 'refresh' })
    .then((token) => remember(userId, token))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Call after Google answers 401 so the next getAccessToken() fetches a fresh token. */
export function invalidateAccessToken(token: string): void {
  if (cached?.token === token) cached = null;
}

export function forgetAccessToken(): void {
  cached = null;
}

/** Removes the app's Google grant entirely (used by "Delete all data"). */
export async function revokeGoogleAccess(): Promise<void> {
  forgetAccessToken();
  await revokeGoogleToken().catch(() => undefined);
}
