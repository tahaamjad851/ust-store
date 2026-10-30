"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { applyActionResult } from "@/components/forms/apply-action-result";
import { Field, fieldInputClass, fieldProps } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { PasswordInput } from "@/components/forms/password-input";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { registerAction } from "@/features/customers/auth-actions";
import { MESSAGES } from "@/features/customers/types";
import { PASSWORD_MIN, registerSchema, type RegisterInput } from "@/lib/validation/auth";

export function RegisterForm() {
  const [formError, setFormError] = useState<string>();
  const [sent, setSent] = useState<string>();
  const {
    register,
    handleSubmit,
    getValues,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { full_name: "", email: "", password: "", confirm_password: "" },
  });

  const onSubmit = handleSubmit(async () => {
    setFormError(undefined);
    try {
      const result = await registerAction(getValues());
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
        <p className="text-body-md text-muted-foreground">
          The email can take a few minutes and may land in your spam folder. If it does not arrive, register again with the
          same address and we will send it again.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} method="post" noValidate className="space-y-4">
      {formError && <FormAlert tone="error">{formError}</FormAlert>}
      <Field id="register-name" label="Full name" error={errors.full_name?.message}>
        <Input
          autoComplete="name"
          className={fieldInputClass}
          {...fieldProps("register-name", { error: errors.full_name?.message })}
          {...register("full_name")}
        />
      </Field>
      <Field id="register-email" label="Email" error={errors.email?.message}>
        <Input
          type="email"
          autoComplete="email"
          inputMode="email"
          className={fieldInputClass}
          {...fieldProps("register-email", { error: errors.email?.message })}
          {...register("email")}
        />
      </Field>
      <Field
        id="register-password"
        label="Password"
        hint={`At least ${PASSWORD_MIN} characters, with a letter and a number.`}
        error={errors.password?.message}
      >
        <PasswordInput
          autoComplete="new-password"
          {...fieldProps("register-password", { error: errors.password?.message, hint: true })}
          {...register("password")}
        />
      </Field>
      <Field id="register-confirm" label="Confirm password" error={errors.confirm_password?.message}>
        <PasswordInput
          autoComplete="new-password"
          {...fieldProps("register-confirm", { error: errors.confirm_password?.message })}
          {...register("confirm_password")}
        />
      </Field>
      <SubmitButton pending={isSubmitting}>Create account</SubmitButton>
    </form>
  );
}
