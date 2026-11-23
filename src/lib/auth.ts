import { AppError } from '@/lib/errors';
import { forgetAccessToken } from '@/lib/google/auth';
import { supabase } from '@/lib/supabase';

/** Google sign-in in the browser → Supabase session. Resolves false if the user cancelled. */
export { signInWithGoogle as signIn } from '@/lib/google/auth';

export async function signOut(): Promise<void> {
  forgetAccessToken();
  const { error } = await supabase.auth.signOut();
  if (!error) return;
  // Offline or a server error leaves the session on disk; still sign out of this device.
  const local = await supabase.auth.signOut({ scope: 'local' });
  if (local.error) throw new AppError('server_error', local.error.message);
}
