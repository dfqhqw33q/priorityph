import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/evaluation-submitted")({
  validateSearch: z.object({ duplicate: z.boolean().optional() }),
  head: () => ({
    meta: [
      { title: "Assessment received — Priority Handling Logistics, Inc." },
      { name: "description", content: "Your Step 1 performance self-assessment has been received." },
      { property: "og:title", content: "Assessment received" },
      { property: "og:description", content: "Your Step 1 performance self-assessment has been received." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SubmittedPage,
});

function SubmittedPage() {
  const { duplicate } = Route.useSearch();
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border border-border bg-card shadow-lg text-center">
        <CardContent className="pt-8 pb-8 px-6">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-7" />
          </div>
          <h1 className="text-xl font-bold text-foreground">
            {duplicate ? "Already recorded" : "Thank you"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            {duplicate
              ? "An assessment for this employee number has already been recorded for this cycle."
              : "Your Step 1 performance self-assessment has been successfully received. You may close this page."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
