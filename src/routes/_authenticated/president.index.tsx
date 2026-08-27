import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, LoadingBlock, PageHeader, StatCard, formatDateTime } from "@/components/ui-bits";
import { getPresidentStats } from "@/lib/president.functions";
import { humanizeToken } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/president/")({
  head: () => ({
    meta: [
      { title: "President dashboard | Priority Handling Logistics, Inc." },
      {
        name: "description",
        content: "Track supervisor submissions and complete Step 2 conclusions and Step 3 review.",
      },
      { property: "og:title", content: "President dashboard" },
      { property: "og:description", content: "Evaluations awaiting presidential review and sign-off." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PresidentDashboard,
});

function PresidentDashboard() {
  const fetchStats = useServerFn(getPresidentStats);
  const query = useQuery({
    queryKey: ["president-stats"],
    queryFn: () => fetchStats(),
    retry: false,
  });

  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : "Unavailable";
    return <EmptyState title="You do not have access to President review" description={message} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="President dashboard"
        description="Review evaluations sent by supervisors, then complete Step 2 and Step 3."
        actions={
          <Button asChild>
            <Link to="/president/evaluations">Open evaluations to review</Link>
          </Button>
        }
      />

      {query.isLoading ? (
        <LoadingBlock rows={2} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Waiting for your review" value={query.data?.awaiting ?? 0} />
          <StatCard label="In progress" value={query.data?.inReview ?? 0} />
          <StatCard label="Completed by you" value={query.data?.submitted ?? 0} />
          <StatCard label="Finalized" value={query.data?.finalized ?? 0} />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent President activity</CardTitle>
        </CardHeader>
        <CardContent>
          {(query.data?.activity ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No President activity recorded yet.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {(query.data?.activity ?? []).map((event) => (
                <li key={event.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span className="font-medium text-foreground">
                    {humanizeToken(event.action)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(event.occurred_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
