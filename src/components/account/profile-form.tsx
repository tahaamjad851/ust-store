"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { applyActionResult } from "@/components/forms/apply-action-result";
import { Field, fieldInputClass, fieldProps } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { updateProfileAction } from "@/features/customers/account-actions";
import { MESSAGES } from "@/features/customers/types";
import { profileSchema, type ProfileInput, type ProfileValues } from "@/lib/validation/auth";

export function ProfileForm({ email, defaults }: { email: string | null; defaults: ProfileInput }) {
  const [status, setStatus] = useState<{ tone: "error" | "success"; text: string }>();
  const {
    register,
    handleSubmit,
    getValues,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProfileInput, unknown, ProfileValues>({ resolver: zodResolver(profileSchema), defaultValues: defaults });

  const onSubmit = handleSubmit(async () => {
    setStatus(undefined);
    try {
      const result = await updateProfileAction(getValues());
      if (result.ok) setStatus({ tone: "success", text: result.message ?? "Saved." });
      else {
        const message = applyActionResult(result, setError);
        if (message) setStatus({ tone: "error", text: message });
      }
    } catch {
      setStatus({ tone: "error", text: MESSAGES.unexpected });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-xl space-y-4">
      {status && <FormAlert tone={status.tone}>{status.text}</FormAlert>}
      <Field id="profile-email" label="Email" hint="This is what you sign in with. To change it, please contact us.">
        <Input
          type="email"
          value={email ?? ""}
          readOnly
          className={`${fieldInputClass} bg-surface-low`}
          {...fieldProps("profile-email", { hint: true })}
        />
      </Field>
      <Field id="profile-name" label="Full name" error={errors.full_name?.message}>
        <Input
          autoComplete="name"
          className={fieldInputClass}
          {...fieldProps("profile-name", { error: errors.full_name?.message })}
          {...register("full_name")}
        />
      </Field>
      <Field id="profile-phone" label="Mobile number" optional error={errors.phone?.message}>
        <Input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0300 1234567"
          className={fieldInputClass}
          {...fieldProps("profile-phone", { error: errors.phone?.message })}
          {...register("phone")}
        />
      </Field>
      <Field id="profile-company" label="Business or shop name" optional error={errors.company_name?.message}>
        <Input
          autoComplete="organization"
          className={fieldInputClass}
          {...fieldProps("profile-company", { error: errors.company_name?.message })}
          {...register("company_name")}
        />
      </Field>
      <SubmitButton pending={isSubmitting} className="sm:w-auto sm:px-8">
        Save changes
      </SubmitButton>
    </form>
  );
}
