import { z } from "zod";
import { passwordPolicyMessage } from "./password-policy";
import { normalizeDisplayText } from "./validation";

const trimmedName = z
  .string()
  .transform((value) => normalizeDisplayText(value))
  .pipe(z.string().min(2).max(160));

const passwordSchema = z.string().superRefine((value, context) => {
  const message = passwordPolicyMessage(value);
  if (message !== true) context.addIssue({ code: z.ZodIssueCode.custom, message });
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});

export const forgotPasswordSchema = z.object({ email: z.string().email() });

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const accountPasswordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const bootstrapInternalUserSchema = z.object({
  email: z.string().email(),
  fullName: trimmedName,
  password: passwordSchema,
});
