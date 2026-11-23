import type { ConfigContext, ExpoConfig } from 'expo/config';

// app.json holds the config; this file only checks the build-time env before EAS bundles the app.
// A release build with a bad Supabase value closes on launch with no message (lib/supabase.ts throws),
// so fail the cloud build instead. EAS stores values literally: `${SUPABASE_URL}` is never expanded
// there, even though Expo expands it from a local .env.
const REQUIRED = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'] as const;

function problem(name: (typeof REQUIRED)[number]): string | null {
  const value = process.env[name]?.trim();
  if (!value) return `${name} is not set`;
  if (value.includes('${')) return `${name} is a reference (${value}); EAS needs the real value`;
  if (name === 'EXPO_PUBLIC_SUPABASE_URL' && !/^https:\/\/\S+$/.test(value)) {
    return `${name} must be an https:// URL`;
  }
  return null;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  if (process.env.EAS_BUILD) {
    const problems = REQUIRED.map(problem).filter((p): p is string => p !== null);
    if (problems.length > 0) {
      const env = process.env.EAS_BUILD_PROFILE ?? 'build';
      throw new Error(`Fix the EAS "${env}" environment:\n- ${problems.join('\n- ')}`);
    }
  }
  return config as ExpoConfig;
};
