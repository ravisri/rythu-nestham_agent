"use client"

import { useId, type ComponentProps } from "react"
import {
  Controller,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useI18n } from "@/lib/i18n/client"

type FormInputProps<T extends FieldValues, U extends FieldValues> = {
  control: Control<T, unknown, U>
  name: Path<T>
  label: string
  description?: string
} & Omit<ComponentProps<typeof Input>, "name" | "id">

// shadcn Field + react-hook-form Controller, sized for easy tapping.
export function FormInput<T extends FieldValues, U extends FieldValues>({
  control,
  name,
  label,
  description,
  ...inputProps
}: FormInputProps<T, U>) {
  const id = `${useId()}-${name}` // unique even with many forms on one page
  const { tr } = useI18n()
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={id} className="text-base">
            {label}
          </FieldLabel>
          <Input
            {...field}
            {...inputProps}
            id={id}
            value={field.value ?? ""}
            aria-invalid={fieldState.invalid}
            className="h-12 text-base"
          />
          {description && <FieldDescription>{description}</FieldDescription>}
          {fieldState.invalid && <FieldError errors={[{ message: tr(fieldState.error?.message ?? "") }]} />}
        </Field>
      )}
    />
  )
}
