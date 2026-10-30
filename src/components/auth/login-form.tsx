"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { applyActionResult } from "@/components/forms/apply-action-result";
import { Field, fieldInputClass, fieldProps } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { PasswordInput } from "@/components/forms/password-input";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { loginAction } from "@/features/customers/auth-actions";
import { MESSAGES } from "@/features/customers/types";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";

export function LoginForm({ next }: { next?: string }) {
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    getValues,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  // The server re-validates the raw values; the browser check is only for quick feedback.
  const onSubmit = handleSubmit(async () => {
    setFormError(undefined);
    try {
      const result = await loginAction({ ...getValues(), next });
      if (!result.ok) setFormError(applyActionResult(result, setError));
    } catch {
      setFormError(MESSAGES.unexpected);
    }
  });

  return (
    <form onSubmit={onSubmit} method="post" noValidate className="space-y-4">
      {formError && <FormAlert tone="error">{formError}</FormAlert>}
      <Field id="login-email" label="Email" error={errors.email?.message}>
        <Input
          type="email"
          autoComplete="email"
          inputMode="email"
          className={fieldInputClass}
          {...fieldProps("login-email", { error: errors.email?.message })}
          {...register("email")}
        />
      </Field>
      <Field id="login-password" label="Password" error={errors.password?.message}>
        <PasswordInput
          autoComplete="current-password"
          {...fieldProps("login-password", { error: errors.password?.message })}
          {...register("password")}
        />
      </Field>
      <div className="text-right">
        <Link href="/forgot-password" className="text-label-lg text-brand-deep underline-offset-4 hover:underline">
          Forgot your password?
        </Link>
      </div>
      <SubmitButton pending={isSubmitting}>Sign in</SubmitButton>
    </form>
  );
}
