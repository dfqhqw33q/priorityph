import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { toast } from "sonner";
import type { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui-bits";
import { supabase } from "@/integrations/supabase/client";
import { recordLoginEvent } from "@/lib/access.functions";
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
  const logEvent = useServerFn(recordLoginEvent);
  const [pending, setPending] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  async function onSubmit(values: Values) {
    setPending(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: values.password });
      if (error) {
        toast.error("Could not update your password");
        return;
      }
      await logEvent({ data: { event: "PASSWORD_CHANGED" } }).catch(() => undefined);
      await refetch();
      toast.success("Password updated");
      navigate({ to: roleLandingPath(access?.roles ?? []) });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Account settings" description="Manage your preferences and security." />

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Change password</CardTitle>
            <CardDescription>Keep your account secure with a strong password (at least 10 characters).</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
                <Input id="password" type="password" autoComplete="new-password" {...form.register("password")} />
                {form.formState.errors.password ? (
                  <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  {...form.register("confirmPassword")}
                />
                {form.formState.errors.confirmPassword ? (
                  <p className="text-xs text-destructive">{form.formState.errors.confirmPassword.message}</p>
                ) : null}
              </div>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Update password"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
