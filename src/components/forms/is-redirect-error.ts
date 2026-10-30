/**
 * True for the error Next.js rejects a Server Action's promise with when the action redirected.
 * A form that awaits such an action in its own try/catch gets this on every success: it is the
 * navigation under way, not a failure, and must not be shown as one.
 */
export function isRedirectError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "digest" in error && typeof error.digest === "string" && error.digest.startsWith("NEXT_REDIRECT;");
}
