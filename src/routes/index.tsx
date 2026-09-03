import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";
import { getMyAccess } from "@/lib/access.functions";
import { APP_NAME, roleLandingPath } from "@/lib/domain";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Priority Handling Logistics, Inc." },
      {
        name: "description",
        content:
          "Annual employee performance evaluation workflow for HR, supervisors and the President, with QR-based employee self-assessment.",
      },
      { property: "og:title", content: "Priority Handling Logistics, Inc." },
      {
        property: "og:description",
        content: "Annual employee performance evaluation workflow with QR-based self-assessment.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const fetchAccess = useServerFn(getMyAccess);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!data.user) {
        navigate({ to: "/login", replace: true });
        return;
      }
      try {
        const access = await fetchAccess();
        if (cancelled) return;
        if (!access) {
          await supabase.auth.signOut();
          navigate({ to: "/login", replace: true });
          return;
        }
        if (access.mustChangePassword) {
          navigate({ to: "/account/password", replace: true });
          return;
        }
        navigate({ to: roleLandingPath(access.roles), replace: true });
      } catch {
        if (!cancelled) navigate({ to: "/login", replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchAccess, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center flex flex-col items-center">
        <img
          src="/priority-handling-logo.png"
          alt="Priority Handling Logistics, Inc."
          className="h-10 w-auto max-w-56 object-contain mb-4 animate-pulse"
        />
        <h1 className="text-lg font-bold tracking-tight text-foreground">{APP_NAME}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Loading your workspace…</p>
      </div>
    </div>
  );
}
