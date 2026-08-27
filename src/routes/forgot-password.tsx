import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import type { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { recordAuthFailure } from "@/lib/access.functions";
import { forgotPasswordSchema } from "@/lib/schemas";

export const Route = createFileRoute("/forgot-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset your password — Priority Handling Logistics, Inc." },
      { name: "description", content: "Request a password reset link for your internal account." },
      { property: "og:title", content: "Reset your password" },
      { property: "og:description", content: "Request a password reset link for your internal account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ForgotPasswordPage,
});

type Values = z.infer<typeof forgotPasswordSchema>;

function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const logRequest = useServerFn(recordAuthFailure);
  const form = useForm<Values>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } });

  async function onSubmit(values: Values) {
    setPending(true);
    try {
      await supabase.auth.resetPasswordForEmail(values.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      await logRequest({ data: { email: values.email, event: "PASSWORD_RESET_REQUESTED" } }).catch(
        () => undefined,
      );
      setSent(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center flex flex-col items-center">
          <img
            src="/priority-handling-logo.png"
            alt="Priority Handling Logistics, Inc."
            className="h-10 w-auto max-w-56 object-contain mb-3"
          />
        </div>
        <Card className="border border-border bg-card shadow-lg">
          <CardHeader>
            <CardTitle>Forgot password</CardTitle>
            <CardDescription>We'll email a reset link if the account exists.</CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <p className="text-sm text-muted-foreground">
                If that address belongs to an internal account, a reset link is on its way.
              </p>
            ) : (
              <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" {...form.register("email")} />
                  {form.formState.errors.email ? (
                    <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
                  ) : null}
                </div>
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? "Sending…" : "Send reset link"}
                </Button>
              </form>
            )}
            <div className="mt-4 text-center text-sm">
              <Link to="/login" className="text-primary hover:underline font-medium">
                Back to sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
