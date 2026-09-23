import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { toast } from "sonner";
import type { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordField } from "@/components/shared/password-field";
import { changeMyPassword } from "@/lib/access.functions";
import { resetPasswordSchema } from "@/lib/schemas";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Choose a new password — Priority Handling Logistics, Inc." },
      {
        name: "description",
        content: "Set a new password for your internal evaluation system account.",
      },
      { property: "og:title", content: "Choose a new password" },
      { property: "og:description", content: "Set a new password for your internal account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

type Values = z.infer<typeof resetPasswordSchema>;

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const changePassword = useServerFn(changeMyPassword);
  const form = useForm<Values>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  async function onSubmit(values: Values) {
    setPending(true);
    try {
      await changePassword({ data: values });
      toast.success("Password updated");
      navigate({ to: "/login" });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "This reset link is invalid or has expired.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md border border-border bg-card shadow-lg">
        <CardHeader>
          <CardTitle>Choose a new password</CardTitle>
          <CardDescription>
            Use at least 14 characters with uppercase, lowercase, a number, and a special character.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <div>
              <PasswordField
                id="password"
                label="New password"
                value={form.watch("password")}
                onChange={(value) => form.setValue("password", value, { shouldValidate: true })}
              />
              {form.formState.errors.password ? (
                <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
              ) : null}
            </div>
            <div>
              <PasswordField
                id="confirmPassword"
                label="Confirm password"
                value={form.watch("confirmPassword")}
                onChange={(value) =>
                  form.setValue("confirmPassword", value, { shouldValidate: true })
                }
              />
              {form.formState.errors.confirmPassword ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.confirmPassword.message}
                </p>
              ) : null}
            </div>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Saving…" : "Update password"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            <Link to="/login" className="text-primary hover:underline font-medium">
              Back to sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
