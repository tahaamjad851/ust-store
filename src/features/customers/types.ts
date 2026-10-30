/** What a customer-facing server action returns. Actions that succeed by redirecting never return. */
export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; message?: string; fieldErrors?: Record<string, string> };

export const MESSAGES = {
  // One message for "no such account" and "wrong password", so nobody can find out which emails have accounts.
  invalidCredentials: "Incorrect email or password.",
  emailNotConfirmed: "Please confirm your email address first. Open the link we emailed you when you registered.",
  accountDisabled: "This account has been disabled. Please contact us for help.",
  linkExpired: "This link has expired or was already used. Please request a new one.",
  unexpected: "Something went wrong. Please try again.",
  registerSent: "Check your email. If you can sign up with this address, we have sent you a link to confirm it.",
  forgotSent: "If there is an account for that email address, we have sent a link to reset the password.",
} as const;
