import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, LoadingState, PageHeader, StatusBadge } from "@/components/shared/portal-ui";
import { getPerformanceMonitoring } from "@/lib/performance-admin.functions";

export const Route = createFileRoute("/_authenticated/hr/monitoring")({
  component: PerformanceMonitoringPage,
});

function PerformanceMonitoringPage() {
  const loadMonitoring = useServerFn(getPerformanceMonitoring);
  const query = useQuery({
    queryKey: ["performance-monitoring"],
    queryFn: () => loadMonitoring(),
  });
  if (query.isPending) return <LoadingState label="Loading performance monitoring" />;
  if (query.isError) return <ErrorState message={query.error.message} />;
  const summary = query.data;
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={["Performance Management", "Performance Monitoring"]}
        title="Performance Monitoring"
        description="Monitor evaluation status transitions and assignments across authorized HR records."
      />
      <Card>
        <CardHeader>
          <CardTitle>Workflow summary</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">Total evaluations</p>
            <p className="mt-1 text-2xl font-semibold">{summary.total}</p>
          </div>
          {summary.statuses.map((item) => (
            <div key={item.status} className="rounded-lg border border-border p-4">
              <StatusBadge>{item.status.replaceAll("_", " ")}</StatusBadge>
              <p className="mt-2 text-2xl font-semibold">{item.count}</p>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Cycle assignments</CardTitle>
        </CardHeader>
        <CardContent>
          {summary.cycles.length ? (
            <div className="space-y-2">
              {summary.cycles.map((cycle) => (
                <div
                  key={cycle.id}
                  className="flex items-center justify-between gap-4 rounded-md border border-border p-3"
                >
                  <div>
                    <p className="font-medium">{cycle.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {cycle.assignmentCount} assignments
                    </p>
                  </div>
                  <StatusBadge>{cycle.status}</StatusBadge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No evaluation cycles have been created.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
