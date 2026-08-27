import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { getMyAccess, needsBootstrap, recordAuthFailure, recordLoginEvent } from "@/lib/access.functions";
import { APP_NAME, roleLandingPath } from "@/lib/domain";
import { loginSchema } from "@/lib/schemas";

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — Priority Handling Logistics, Inc." },
      { name: "description", content: "Secure sign-in for HR, supervisors, the President and administrators." },
      { property: "og:title", content: "Sign in — Priority Handling Logistics, Inc." },
      { property: "og:description", content: "Secure sign-in for internal evaluation system users." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LoginPage,
});

type LoginValues = z.infer<typeof loginSchema>;

function LoginPage() {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const checkBootstrap = useServerFn(needsBootstrap);
  const fetchAccess = useServerFn(getMyAccess);
  const logEvent = useServerFn(recordLoginEvent);
  const logFailure = useServerFn(recordAuthFailure);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  useEffect(() => {
    checkBootstrap()
      .then((result) => setSetupNeeded(result.needsBootstrap))
      .catch(() => setSetupNeeded(false));
  }, [checkBootstrap]);

  async function onSubmit(values: LoginValues) {
    setPending(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });
      if (error) {
        await logFailure({ data: { email: values.email, event: "LOGIN_FAILED" } }).catch(() => undefined);
        toast.error("Incorrect email or password");
        return;
      }

      const access = await fetchAccess();
      if (!access) {
        await supabase.auth.signOut();
        toast.error("This account has no internal profile. Contact an administrator.");
        return;
      }
      if (!access.isActive || access.isLocked) {
        await supabase.auth.signOut();
        toast.error("Your account is deactivated or locked. Contact an administrator.");
        return;
      }

      await logEvent({ data: { event: "LOGIN" } }).catch(() => undefined);
      if (access.mustChangePassword) {
        navigate({ to: "/account/password" });
        return;
      }
      navigate({ to: roleLandingPath(access.roles) });
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
          <h1 className="text-xl font-bold tracking-tight text-foreground">{APP_NAME}</h1>
        </div>
        <Card className="border border-border bg-card shadow-lg">
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Use your work email and password.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="username" {...form.register("email")} />
                {form.formState.errors.email ? (
                  <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  {...form.register("password")}
                />
                {form.formState.errors.password ? (
                  <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
                ) : null}
              </div>
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? "Signing in…" : "Sign in"}
              </Button>
            </form>

            <div className="mt-4 flex flex-col gap-2 text-center text-sm">
              <Link to="/forgot-password" className="text-primary hover:underline font-medium">
                Forgot your password?
              </Link>
              {setupNeeded ? (
                <Link to="/setup" className="text-primary hover:underline font-medium">
                  No accounts exist yet — run initial setup
                </Link>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
