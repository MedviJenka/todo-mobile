import { getCalendars, getLocales } from 'expo-localization';

export function deviceTimeZone(): string {
  return getCalendars()[0]?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
}

export function deviceLocale(): string {
  return getLocales()[0]?.languageTag ?? 'en-US';
}

/** Distinct ISO-639-1 codes of the device's preferred languages (hints for speech-to-text). */
export function deviceLanguages(): string[] {
  const codes = getLocales()
    .map((locale) => locale.languageCode)
    .filter((code): code is string => !!code && /^[a-z]{2}$/.test(code));
  return [...new Set(codes)].slice(0, 5);
}
