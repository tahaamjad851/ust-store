import { get, type FieldErrors, type FieldValues } from "react-hook-form";

/** The message of the error at a dotted path ("product.name", "specs.0.label"), if any. */
export function errorAt(errors: FieldErrors<FieldValues>, path: string): string | undefined {
  const entry = get(errors, path) as { message?: unknown } | undefined;
  return typeof entry?.message === "string" ? entry.message : undefined;
}
