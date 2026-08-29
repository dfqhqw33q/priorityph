import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, LoadingBlock, PageHeader, StatCard, formatDateTime } from "@/components/ui-bits";
import { getSupervisorStats } from "@/lib/evaluations.functions";
import { humanizeToken } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/supervisor/")({
  head: () => ({
    meta: [
      { title: "Supervisor dashboard | Priority Handling Logistics, Inc." },
      {
        name: "description",
        content: "Review employee Step 1 self-assessments and submit supervisor ratings to the President.",
      },
      { property: "og:title", content: "Supervisor dashboard" },
      { property: "og:description", content: "Employee Step 1 submissions awaiting supervisor review." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SupervisorDashboard,
});

function SupervisorDashboard() {
  const fetchStats = useServerFn(getSupervisorStats);
  const query = useQuery({
    queryKey: ["supervisor-stats"],
    queryFn: () => fetchStats(),
    retry: false,
  });

  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : "Unavailable";
    return <EmptyState title="You do not have access to supervisor review" description={message} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Supervisor dashboard"
        description="All submitted employee self-assessments are available to every supervisor."
        actions={
          <Button asChild>
            <Link to="/supervisor/evaluations">Open evaluations to review</Link>
          </Button>
        }
      />

      {query.isLoading ? (
        <LoadingBlock rows={2} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Employee self-assessments" value={query.data?.totalStep1 ?? 0} />
          <StatCard label="Waiting for your review" value={query.data?.pending ?? 0} />
          <StatCard label="Your drafts" value={query.data?.drafts ?? 0} />
          <StatCard label="Sent to Reviewing Supervisor" value={query.data?.submitted ?? 0} />
          <StatCard label="With the President" value={query.data?.withPresident ?? 0} />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent supervisor activity</CardTitle>
        </CardHeader>
        <CardContent>
          {(query.data?.activity ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No supervisor activity recorded yet.</p>
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
