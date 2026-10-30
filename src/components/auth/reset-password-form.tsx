"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { applyActionResult } from "@/components/forms/apply-action-result";
import { Field, fieldProps } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { isRedirectError } from "@/components/forms/is-redirect-error";
import { PasswordInput } from "@/components/forms/password-input";
import { SubmitButton } from "@/components/forms/submit-button";
import { resetPasswordAction } from "@/features/customers/auth-actions";
import { MESSAGES } from "@/features/customers/types";
import { PASSWORD_MIN, resetPasswordSchema, type ResetPasswordInput } from "@/lib/validation/auth";

export function ResetPasswordForm() {
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    getValues,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirm_password: "" },
  });

  const onSubmit = handleSubmit(async () => {
    setFormError(undefined);
    try {
      const result = await resetPasswordAction(getValues());
      if (!result.ok) setFormError(applyActionResult(result, setError));
    } catch (error) {
      // A redirect (the action succeeded) reaches the caller as a rejection; it is not a failure.
      if (isRedirectError(error)) return;
      setFormError(MESSAGES.unexpected);
    }
  });

  const expired = formError === MESSAGES.linkExpired;

  return (
    <form onSubmit={onSubmit} method="post" noValidate className="space-y-4">
      {formError && (
        <FormAlert tone="error">
          {formError}{" "}
          {expired && (
            <Link href="/forgot-password" className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">
              Request a new link
            </Link>
          )}
        </FormAlert>
      )}
      <Field
        id="reset-password"
        label="New password"
        hint={`At least ${PASSWORD_MIN} characters, with a letter and a number.`}
        error={errors.password?.message}
      >
        <PasswordInput
          autoComplete="new-password"
          {...fieldProps("reset-password", { error: errors.password?.message, hint: true })}
          {...register("password")}
        />
      </Field>
      <Field id="reset-confirm" label="Confirm new password" error={errors.confirm_password?.message}>
        <PasswordInput
          autoComplete="new-password"
          {...fieldProps("reset-confirm", { error: errors.confirm_password?.message })}
          {...register("confirm_password")}
        />
      </Field>
      <SubmitButton pending={isSubmitting}>Save new password</SubmitButton>
    </form>
  );
}
