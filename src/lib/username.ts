/** User IDs: 3–20 letters, numbers, dots, dashes or underscores; unique ignoring case. */
export const USERNAME_RULE = '3–20 letters, numbers, . _ or -';

export const cleanUsername = (s: string) => s.trim();

/** Error message for an invalid user ID, or null when it is fine. */
export function usernameProblem(name: string): string | null {
  const n = cleanUsername(name);
  if (n.length < 3) return 'User ID must be at least 3 characters.';
  if (n.length > 20) return 'User ID must be at most 20 characters.';
  if (!/^[A-Za-z0-9._-]+$/.test(n)) return 'Use only letters, numbers, . _ or -';
  return null;
}

export const MIN_PASSWORD = 6;
