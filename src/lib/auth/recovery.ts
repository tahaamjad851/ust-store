// Set by /auth/confirm after a password-reset link is verified (value: the user id); required by the
// reset-password action, and removed on sign-out.
export const RECOVERY_COOKIE = "ust-recovery";
export const RECOVERY_MAX_AGE_SECONDS = 15 * 60;
