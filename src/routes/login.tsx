import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BouncingDots } from "@/components/loading-ui/bouncing-dots";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { supabase } from "@/integrations/supabase/client";
import {
  getMyAccess,
  beginEmailMfa,
  needsBootstrap,
  recordAuthFailure,
  recordLoginEvent,
  verifyEmailMfa,
} from "@/lib/access.functions";
import { APP_NAME, roleLandingPath } from "@/lib/domain";
import { loginSchema } from "@/lib/schemas";

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — Priority Handling Logistics, Inc." },
      {
        name: "description",
        content: "Secure sign-in for HR, supervisors, the President and administrators.",
      },
      { property: "og:title", content: "Sign in — Priority Handling Logistics, Inc." },
      {
        property: "og:description",
        content: "Secure sign-in for internal evaluation system users.",
      },
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
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [mfaChallenge, setMfaChallenge] = useState<{ id: string; expiresInSeconds: number } | null>(
    null,
  );
  const [otp, setOtp] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const checkBootstrap = useServerFn(needsBootstrap);
  const fetchAccess = useServerFn(getMyAccess);
  const logEvent = useServerFn(recordLoginEvent);
  const logFailure = useServerFn(recordAuthFailure);
  const startMfa = useServerFn(beginEmailMfa);
  const verifyMfa = useServerFn(verifyEmailMfa);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  useEffect(() => {
    checkBootstrap()
      .then((result) => setSetupNeeded(result.needsBootstrap))
      .catch(() => setSetupNeeded(false));
  }, [checkBootstrap]);

  async function finishLogin() {
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

    queryClient.setQueryData(["access", access.userId], access);
    void logEvent({ data: { event: "LOGIN" } }).catch(() => undefined);
    if (access.mustChangePassword) {
      navigate({ to: "/account/password" });
      return;
    }
    navigate({ to: roleLandingPath(access.roles) });
  }

  async function onSubmit(values: LoginValues) {
    setPending(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });
      if (error) {
        await logFailure({ data: { email: values.email, event: "LOGIN_FAILED" } }).catch(
          () => undefined,
        );
        toast.error("Incorrect email or password");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.user) {
        toast.error("Sign-in is still initializing. Please try again in a moment.");
        return;
      }

      const challenge = await startMfa({ data: {} });
      if (!challenge.required) {
        await finishLogin();
        return;
      }
      setMfaChallenge({ id: challenge.challengeId, expiresInSeconds: challenge.expiresInSeconds });
      setResendCooldown(30);
      return;
    } catch (error) {
      await supabase.auth.signOut().catch(() => undefined);
      toast.error(error instanceof Error ? error.message : "Could not send the verification code");
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  async function resendOtp() {
    if (pending || resendCooldown > 0) return;
    setPending(true);
    try {
      const challenge = await startMfa({ data: {} });
      if (!challenge.required) {
        await finishLogin();
        return;
      }
      setMfaChallenge({ id: challenge.challengeId, expiresInSeconds: challenge.expiresInSeconds });
      setOtp("");
      setResendCooldown(30);
      toast.success("A new verification code was sent to your email.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not resend the verification code",
      );
    } finally {
      setPending(false);
    }
  }

  async function onVerifyOtp(event: React.FormEvent) {
    event.preventDefault();
    if (!mfaChallenge) return;
    setPending(true);
    try {
      await verifyMfa({ data: { challengeId: mfaChallenge.id, otp } });
      await finishLogin();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Verification failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center flex flex-col items-center">
          <img
            src="/logo-optimized.webp"
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
            {mfaChallenge ? (
              <form className="space-y-4" onSubmit={onVerifyOtp}>
                <div className="space-y-2">
                  <Label htmlFor="email-otp">Email verification code</Label>
                  <InputOTP
                    id="email-otp"
                    maxLength={6}
                    containerClassName="w-full justify-center"
                    value={otp}
                    onChange={(value) => setOtp(value.replace(/\D/g, ""))}
                    disabled={pending}
                    autoComplete="one-time-code"
                    aria-label="Six-digit email verification code"
                  >
                    <InputOTPGroup className="w-full justify-center">
                      {Array.from({ length: 6 }, (_, index) => (
                        <InputOTPSlot key={index} index={index} />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                  <p className="text-xs text-muted-foreground">
                    Enter the six-digit code sent to your account email. It expires in five minutes.
                  </p>
                </div>
                <Button type="submit" className="w-full" disabled={pending || otp.length !== 6}>
                  {pending ? <BouncingDots className="w-16" /> : "Verify and continue"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => void resendOtp()}
                  disabled={pending || resendCooldown > 0}
                >
                  {resendCooldown > 0
                    ? `Resend code in ${resendCooldown}s`
                    : "Resend verification code"}
                </Button>
              </form>
            ) : (
              <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    {...form.register("email")}
                  />
                  {form.formState.errors.email ? (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.email.message}
                    </p>
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
                    <p className="text-xs text-destructive">
                      {form.formState.errors.password.message}
                    </p>
                  ) : null}
                </div>
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? <BouncingDots className="w-16" /> : "Sign in"}
                </Button>
              </form>
            )}

            <div className="mt-4 flex flex-col gap-2 text-center text-sm">
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
