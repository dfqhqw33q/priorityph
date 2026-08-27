import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
import { bootstrapAdministrator, needsBootstrap } from "@/lib/access.functions";
import { bootstrapAdminSchema } from "@/lib/schemas";

export const Route = createFileRoute("/setup")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Initial setup — Priority Handling Logistics, Inc." },
      { name: "description", content: "Create the first Administrator account for the evaluation system." },
      { property: "og:title", content: "Initial setup" },
      { property: "og:description", content: "Create the first Administrator account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SetupPage,
});

type Values = z.infer<typeof bootstrapAdminSchema>;

function SetupPage() {
  const navigate = useNavigate();
  const check = useServerFn(needsBootstrap);
  const bootstrap = useServerFn(bootstrapAdministrator);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);

  const form = useForm<Values>({
    resolver: zodResolver(bootstrapAdminSchema),
    defaultValues: { email: "", fullName: "", password: "" },
  });

  useEffect(() => {
    check()
      .then((result) => setAllowed(result.needsBootstrap))
      .catch(() => setAllowed(false));
  }, [check]);

  async function onSubmit(values: Values) {
    setPending(true);
    try {
      await bootstrap({ data: values });
      toast.success("Administrator created. You can sign in now.");
      navigate({ to: "/login" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Initial setup failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md border border-border bg-card shadow-lg">
        <CardHeader>
          <CardTitle>Initial setup</CardTitle>
          <CardDescription>Create the first Administrator account.</CardDescription>
        </CardHeader>
        <CardContent>
          {allowed === false ? (
            <p className="text-sm text-muted-foreground">
              Setup has already been completed. Ask an administrator for an account.
            </p>
          ) : (
            <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
              <div className="space-y-2">
                <Label htmlFor="fullName">Full name</Label>
                <Input id="fullName" {...form.register("fullName")} />
                {form.formState.errors.fullName ? (
                  <p className="text-xs text-destructive">{form.formState.errors.fullName.message}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...form.register("email")} />
                {form.formState.errors.email ? (
                  <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" autoComplete="new-password" {...form.register("password")} />
                {form.formState.errors.password ? (
                  <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
                ) : null}
              </div>
              <Button type="submit" className="w-full" disabled={pending || allowed === null}>
                {pending ? "Creating…" : "Create Administrator"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
