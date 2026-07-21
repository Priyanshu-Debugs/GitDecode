/**
 * Central Developer Account Utilities
 * ============================================
 * Defines system developer handles and provides helpers to check
 * if an authenticated user has Developer status with unlimited access.
 */

export const DEVELOPER_USERNAMES = [
  "mihirpatel204",
  "Priyanshu-Debugs",
  "Sameer-0904"
];

/**
 * Check if a given username string matches any master developer account (case-insensitive).
 */
export function isDeveloperUsername(username?: string | null): boolean {
  if (!username) return false;
  const normalized = username.trim().toLowerCase();
  return DEVELOPER_USERNAMES.some(dev => dev.toLowerCase() === normalized);
}

/**
 * Extract GitHub username / handle from Supabase user object and check for developer privileges.
 */
export function isDeveloperAccount(user: any): boolean {
  if (!user) return false;

  const metadata = user.user_metadata || {};
  const candidates = [
    metadata.preferred_username,
    metadata.user_name,
    metadata.full_name,
    user.email ? user.email.split("@")[0] : null
  ];

  return candidates.some(candidate => isDeveloperUsername(candidate));
}
