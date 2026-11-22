import { AppError } from '@/lib/errors';
import { forgetAccessToken, revokeGoogleAccess } from '@/lib/google/auth';
import { supabase } from '@/lib/supabase';

/** Google sign-in in the browser → Supabase session. Resolves false if the user cancelled. */
export { signInWithGoogle as signIn } from '@/lib/google/auth';

export async function signOut(options: { revokeGoogle?: boolean } = {}): Promise<void> {
  if (options.revokeGoogle) await revokeGoogleAccess();
  forgetAccessToken();
  const { error } = await supabase.auth.signOut();
  if (error) throw new AppError('server_error', error.message);
}
