"use client";

import { useCallback, useState } from "react";
import { useForm, type DefaultValues, type FieldValues, type Path, type Resolver, type UseFormReturn } from "react-hook-form";
import { isRedirectError } from "@/components/forms/is-redirect-error";
import type { AdminResult } from "@/features/admin/types";
import { MESSAGES } from "@/features/customers/types";

type Options<TIn extends FieldValues, TOut> = {
  resolver: Resolver<TIn, unknown, TOut>;
  defaults: DefaultValues<TIn>;
  /** Called with the VALIDATED values (the same parse the server repeats). */
  action: (values: TOut) => Promise<AdminResult<unknown>>;
  /** Empty the form after a successful save (a form that adds things). */
  resetOnSuccess?: boolean;
};

export type AdminFormState<TIn extends FieldValues, TOut> = {
  form: UseFormReturn<TIn, unknown, TOut>;
  /** Pass to <form onSubmit>. */
  submit: (event?: React.BaseSyntheticEvent) => Promise<void>;
  pending: boolean;
  error: string | undefined;
  success: string | undefined;
};

/**
 * Wires a react-hook-form form to an admin server action: browser-side check with the shared schema,
 * then the action; the server's field errors and message are put back on the form. A redirect from the
 * action (a successful create that moves on) is the navigation under way, not a failure.
 */
export function useAdminForm<TIn extends FieldValues, TOut>({ resolver, defaults, action, resetOnSuccess }: Options<TIn, TOut>): AdminFormState<TIn, TOut> {
  const form = useForm<TIn, unknown, TOut>({ resolver, defaultValues: defaults });
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [pending, setPending] = useState(false);
  const { handleSubmit, setError: setFieldError, reset } = form;

  const submit = useCallback(
    (event?: React.BaseSyntheticEvent) =>
      handleSubmit(async (values) => {
        setError(undefined);
        setSuccess(undefined);
        setPending(true);
        try {
          const result = await action(values);
          if (result.ok) {
            setSuccess(result.message ?? "Saved.");
            if (resetOnSuccess) reset();
            else reset(undefined, { keepValues: true });
            return;
          }
          Object.entries(result.fieldErrors ?? {}).forEach(([name, message], index) => {
            setFieldError(name as Path<TIn>, { type: "server", message }, { shouldFocus: index === 0 });
          });
          setError(result.message ?? MESSAGES.unexpected);
        } catch (e) {
          if (!isRedirectError(e)) setError(MESSAGES.unexpected);
        } finally {
          setPending(false);
        }
      })(event),
    [handleSubmit, action, resetOnSuccess, reset, setFieldError],
  );

  return { form, submit, pending, error, success };
}
