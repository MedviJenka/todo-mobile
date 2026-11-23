// Must run before supabase-js creates a PKCE challenge.
import './crypto-polyfill';
import 'react-native-url-polyfill/auto';
import 'expo-sqlite/localStorage/install';

import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY. ' +
      'Add them to .env (local) or the EAS environment (cloud builds).'
  );
}

// supabase-js saves the whole session, Google's provider tokens included. The refresh token only
// needs to live in memory long enough to reach the google-token function (lib/google/auth.ts
// reads it from the exchange result), so it never lands in plain-text storage.
const storage = {
  getItem: (key: string) => globalThis.localStorage.getItem(key),
  setItem: (key: string, value: string) => {
    let stored = value;
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && ('provider_token' in parsed || 'provider_refresh_token' in parsed)) {
        const session = { ...(parsed as Record<string, unknown>) };
        delete session.provider_token;
        delete session.provider_refresh_token;
        stored = JSON.stringify(session);
      }
    } catch {
      // Not JSON (e.g. the PKCE code verifier): store as is.
    }
    globalThis.localStorage.setItem(key, stored);
  },
  removeItem: (key: string) => globalThis.localStorage.removeItem(key),
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    // PKCE: the Google redirect comes back with ?code=, which lib/google/auth.ts exchanges by hand.
    flowType: 'pkce',
    detectSessionInUrl: false,
  },
});

// Refresh tokens only while the app is in the foreground.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
