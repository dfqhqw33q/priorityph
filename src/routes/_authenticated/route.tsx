import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Read the locally cached session (no network round-trip on every navigation).
    // Server functions still verify the bearer token on every privileged call.
    const { data, error } = await supabase.auth.getSession();
    const user = data.session?.user ?? null;
    if (error || !user) throw redirect({ to: "/login" });
    return { user };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
