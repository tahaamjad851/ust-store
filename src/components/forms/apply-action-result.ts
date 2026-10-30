import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import type { ActionResult } from "@/features/customers/types";

/** Puts a server action's field errors on the form and returns the form-level message, if any. */
export function applyActionResult<T extends FieldValues>(
  result: Extract<ActionResult, { ok: false }>,
  setError: UseFormSetError<T>,
): string | undefined {
  for (const [name, message] of Object.entries(result.fieldErrors ?? {})) {
    setError(name as Path<T>, { type: "server", message });
  }
  return result.message;
}
