"use client";

import Link from "next/link";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { applyActionResult } from "@/components/forms/apply-action-result";
import { Field, fieldInputClass, fieldProps } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createAddressAction, updateAddressAction } from "@/features/customers/account-actions";
import { MESSAGES } from "@/features/customers/types";
import { addressSchema, type AddressInput, type AddressValues } from "@/lib/validation/auth";
import { PROVINCES } from "@/lib/validation/checkout";

type Props = {
  /** Present when editing; absent when adding a new address. */
  addressId?: string;
  defaults: AddressInput;
};

export function AddressForm({ addressId, defaults }: Props) {
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    getValues,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AddressInput, unknown, AddressValues>({ resolver: zodResolver(addressSchema), defaultValues: defaults });

  const onSubmit = handleSubmit(async () => {
    setFormError(undefined);
    try {
      const values = getValues();
      const result = addressId ? await updateAddressAction(addressId, values) : await createAddressAction(values);
      if (!result.ok) setFormError(applyActionResult(result, setError));
    } catch {
      setFormError(MESSAGES.unexpected);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-2xl space-y-4">
      {formError && <FormAlert tone="error">{formError}</FormAlert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="address-label" label="Label" optional hint="For example Farm, Workshop or Home." error={errors.label?.message}>
          <Input
            className={fieldInputClass}
            {...fieldProps("address-label", { error: errors.label?.message, hint: true })}
            {...register("label")}
          />
        </Field>
        <div className="hidden sm:block" aria-hidden="true" />
        <Field id="address-name" label="Receiver's name" error={errors.full_name?.message}>
          <Input
            autoComplete="name"
            className={fieldInputClass}
            {...fieldProps("address-name", { error: errors.full_name?.message })}
            {...register("full_name")}
          />
        </Field>
        <Field id="address-phone" label="Mobile number" error={errors.phone?.message}>
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0300 1234567"
            className={fieldInputClass}
            {...fieldProps("address-phone", { error: errors.phone?.message })}
            {...register("phone")}
          />
        </Field>
        <Field
          id="address-line1"
          label="Address"
          hint="House, shop, farm or village."
          error={errors.line1?.message}
          className="sm:col-span-2"
        >
          <Input
            autoComplete="address-line1"
            className={fieldInputClass}
            {...fieldProps("address-line1", { error: errors.line1?.message, hint: true })}
            {...register("line1")}
          />
        </Field>
        <Field id="address-street" label="Street" optional error={errors.street?.message}>
          <Input
            autoComplete="address-line2"
            className={fieldInputClass}
            {...fieldProps("address-street", { error: errors.street?.message })}
            {...register("street")}
          />
        </Field>
        <Field id="address-area" label="Area or tehsil" optional error={errors.area?.message}>
          <Input
            className={fieldInputClass}
            {...fieldProps("address-area", { error: errors.area?.message })}
            {...register("area")}
          />
        </Field>
        <Field id="address-city" label="City" error={errors.city?.message}>
          <Input
            autoComplete="address-level2"
            className={fieldInputClass}
            {...fieldProps("address-city", { error: errors.city?.message })}
            {...register("city")}
          />
        </Field>
        <Field id="address-province" label="Province" error={errors.province?.message}>
          <select
            autoComplete="address-level1"
            className="h-11 w-full rounded-lg border border-input bg-card px-3 text-body-lg aria-invalid:border-destructive md:text-body-md"
            {...fieldProps("address-province", { error: errors.province?.message })}
            {...register("province")}
          >
            {PROVINCES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
        <Field id="address-postal" label="Postal code" optional error={errors.postal_code?.message}>
          <Input
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={5}
            className={fieldInputClass}
            {...fieldProps("address-postal", { error: errors.postal_code?.message })}
            {...register("postal_code")}
          />
        </Field>
        <Field
          id="address-instructions"
          label="Landmark or delivery instructions"
          optional
          error={errors.instructions?.message}
          className="sm:col-span-2"
        >
          <Textarea
            rows={3}
            className="rounded-lg border-input bg-card text-body-lg md:text-body-md"
            {...fieldProps("address-instructions", { error: errors.instructions?.message })}
            {...register("instructions")}
          />
        </Field>
      </div>

      <div className="flex items-center gap-3 rounded-lg bg-surface-low px-3">
        <Controller
          control={control}
          name="is_default"
          render={({ field }) => (
            <Checkbox
              id="address-default"
              checked={field.value}
              onCheckedChange={(v) => field.onChange(v === true)}
              className="relative size-5 after:absolute after:-inset-3 after:content-['']"
            />
          )}
        />
        <Label htmlFor="address-default" className="min-h-11 flex-1 text-body-md font-normal">
          Use this as my default delivery address
        </Label>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <SubmitButton pending={isSubmitting} className="sm:w-auto sm:px-8">
          {addressId ? "Save address" : "Add address"}
        </SubmitButton>
        <Button asChild variant="outline" className="h-11 sm:px-8">
          <Link href="/account/addresses">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
