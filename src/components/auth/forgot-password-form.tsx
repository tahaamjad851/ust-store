"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { applyActionResult } from "@/components/forms/apply-action-result";
import { Field, fieldInputClass, fieldProps } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { forgotPasswordAction } from "@/features/customers/auth-actions";
import { MESSAGES } from "@/features/customers/types";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/validation/auth";

export function ForgotPasswordForm() {
  const [formError, setFormError] = useState<string>();
  const [sent, setSent] = useState<string>();
  const {
    register,
    handleSubmit,
    getValues,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } });

  const onSubmit = handleSubmit(async () => {
    setFormError(undefined);
    try {
      const result = await forgotPasswordAction(getValues());
      if (result.ok) setSent(result.message);
      else setFormError(applyActionResult(result, setError));
    } catch {
      setFormError(MESSAGES.unexpected);
    }
  });

  if (sent) {
    return (
      <div className="space-y-3">
        <FormAlert tone="success" moveFocus>
          {sent}
        </FormAlert>
        <p className="text-body-md text-muted-foreground">The email can take a few minutes. Check your spam folder too.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} method="post" noValidate className="space-y-4">
      {formError && <FormAlert tone="error">{formError}</FormAlert>}
      <Field id="forgot-email" label="Email" error={errors.email?.message}>
        <Input
          type="email"
          autoComplete="email"
          inputMode="email"
          className={fieldInputClass}
          {...fieldProps("forgot-email", { error: errors.email?.message })}
          {...register("email")}
        />
      </Field>
      <SubmitButton pending={isSubmitting}>Send reset link</SubmitButton>
    </form>
  );
}
