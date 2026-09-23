import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { toast } from "sonner";
import type { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordField } from "@/components/shared/password-field";
import { PageHeader } from "@/components/shared/shared-ui";
import { changeMyPassword } from "@/lib/access.functions";
import { resetPasswordSchema } from "@/lib/schemas";
import { roleLandingPath } from "@/lib/domain";
import { useAccess } from "@/hooks/use-access";

export const Route = createFileRoute("/_authenticated/account/password")({
  component: ChangePasswordPage,
});

type Values = z.infer<typeof resetPasswordSchema>;

function ChangePasswordPage() {
  const navigate = useNavigate();
  const { access, refetch } = useAccess();
  const changePassword = useServerFn(changeMyPassword);
  const [pending, setPending] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  async function onSubmit(values: Values) {
    setPending(true);
    try {
      await changePassword({ data: values });
      await refetch();
      toast.success("Password updated");
      navigate({ to: roleLandingPath(access?.roles ?? []) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update your password");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Account settings"
        description="Update your password and keep your account secure."
      />

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Change password</CardTitle>
            <CardDescription>
              Use at least 14 characters with uppercase, lowercase, a number, and a special
              character.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
              <div>
                <PasswordField
                  id="password"
                  label="New password"
                  value={form.watch("password")}
                  identifiers={[access?.fullName ?? "", access?.email ?? ""]}
                  onChange={(value) => form.setValue("password", value, { shouldValidate: true })}
                />
                {form.formState.errors.password ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.password.message}
                  </p>
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
              <Button type="submit" disabled={pending}>
                {pending ? "Saving..." : "Update password"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
