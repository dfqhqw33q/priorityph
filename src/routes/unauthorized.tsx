import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/unauthorized")({
  head: () => ({
    meta: [
      { title: "Access denied — Priority Handling Logistics, Inc." },
      { name: "description", content: "You do not have permission to view this part of the system." },
      { property: "og:title", content: "Access denied" },
      { property: "og:description", content: "You do not have permission to view this page." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <ShieldAlert className="size-7" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Access denied</h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          Your account does not have permission for this area. Contact an administrator if you believe this is a
          mistake.
        </p>
        <div className="mt-6">
          <Button asChild>
            <Link to="/">Back to your workspace</Link>
          </Button>
        </div>
      </div>
    </div>
  ),
});
