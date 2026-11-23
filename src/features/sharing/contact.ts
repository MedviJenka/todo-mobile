/** Trimmed and lower-cased, so "John@Gmail.com " and "john@gmail.com" are the same person. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeEmail(email));
}

/**
 * A starting name for the contact card, guessed from the address: "john.doe@gmail.com" → "John Doe".
 * Only separators (. _ - +tag, digits) split words, so "johndoe@gmail.com" → "Johndoe"; the user
 * can edit it.
 */
export function nameFromEmail(email: string): string {
  const local = normalizeEmail(email).split('@')[0]?.split('+')[0] ?? '';
  return local
    .split(/[._\-\d]+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(' ');
}

/** Initials for the card avatar: "John Doe" → "JD", "Johndoe" → "J". */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('');
}
